import { Agent } from "@theokit/sdk";
import { ScoringApi, type GaiaQuestion } from "./scoring-api.ts";
import { extractFinalAnswer } from "./lib/answer.ts";
import { FatalRunError, classifyRunFailure } from "./lib/agent-errors.ts";
import { fetchPageTool, createSearchTool } from "./tools/web.ts";
import { resolveSearchBackend } from "./tools/search-backend.ts";
import { runPythonTool } from "./tools/python.ts";
import { youtubeTranscriptTool } from "./tools/youtube.ts";
import { wikipediaPageTool, wikipediaSearchTool, searchWikipedia } from "./tools/wikipedia.ts";
import { checkSources, healthGuidance, type SourceHealth } from "./lib/health.ts";
import { createReadTaskFileTool } from "./tools/task-files.ts";
import {
  createDescribeImageTool,
  createTranscribeAudioTool,
  type PerceptionConfig,
} from "./tools/perception.ts";

/**
 * Regras de formatação do GAIA. O benchmark pontua por igualdade exata de string,
 * então o formato da resposta pesa tanto quanto a pesquisa que a produziu.
 */
export const SYSTEM_PROMPT = `You are a precise research assistant answering ONE question from the GAIA benchmark.

Your answer is graded by EXACT STRING MATCH against a short reference answer.
There are two ways to score zero: giving a wrong value, and giving no value at all.
An empty answer is always wrong. An informed guess is sometimes right.

## Step budget

You have roughly 25 tool calls. Most questions need fewer than 10.
Spend them READING sources, not rephrasing searches.

## Method

0. FIRST, before touching any tool, write one line:
   WORKING ANSWER: <your best answer from your own knowledge, or "unknown">
   You very likely know more than you think. This line costs nothing and guarantees you
   never finish empty-handed. It is a draft, not a commitment.

1. Name the single value the question asks for. Note its type (number, name, city,
   list) and how it must be formatted.

2. If the question mentions an attached file, call the matching tool with the task_id
   you were given: read_task_file (text, code, spreadsheets), describe_image (images),
   transcribe_audio (audio). If the attachment cannot be retrieved, do not keep trying
   it — move on and answer from the question text and your own knowledge.

3. Research to CONFIRM OR CORRECT your working answer — not to discover it from zero.
   Prefer a source you actually opened over recall, but treat research as verification.
   - Searching is not reading. A list of snippets is a map, not evidence: pick the most
     promising result and OPEN it with wikipedia_page or fetch_page.
   - At most 2 searches per topic. If the second brings nothing usable, change strategy
     instead of wording: a different entity, a broader parent topic, a page that would
     cite the fact, or a different tool.
   - Never issue a query that is a minor rewording of one you already tried. Repeating
     yourself burns the budget and returns the same results.
   - If a tool reports a failure, do not call it again with the same input.

4. Use run_python for arithmetic, counting, sorting, date math, or parsing. Do not do
   multi-step math in your head.

5. Stop researching the moment you have the value. Extra confirmation rarely changes a
   correct answer and often exhausts the budget.

## When research does not converge

Fall back to your WORKING ANSWER and submit it. Do not keep searching.

Research that neither confirms nor refutes it has told you nothing, so the working
answer remains your best estimate. State it in the required format with no hedging, no
caveats and no mention of uncertainty. Half-verified beats blank, because blank is
guaranteed to be wrong — and your own knowledge is often right.

Two searches that return nothing usable is already the signal to stop and answer.

## Answer format — these rules are absolute

- Reply with ONLY the value asked for. No explanation, no units, no restating the question.
- Numbers: plain digits. No thousands separators, no currency symbols, no units, unless
  the question explicitly asks for a unit. Write 89706.00 as 89706.00 if cents are asked for.
- Strings: no leading article. No abbreviations: write "Saint Petersburg", not "St. Petersburg".
- Lists: comma-separated, in the order the question requests, each element following the
  rules above. Alphabetize only when asked.
- Names: give exactly the part requested. "First name only" means one word.
- Do not add quotation marks, bold, code formatting, or a trailing period.

End your reply with a single line in exactly this form:
FINAL ANSWER: <the answer>`;

export interface AgentConfig {
  modelId: string;
  /**
   * Modelo usado quando o primário devolve resposta vazia.
   * Alguns enunciados do GAIA (texto invertido, por exemplo) disparam o filtro de
   * conteúdo do provider, que encerra o run sem emitir texto. Um modelo de outra
   * família costuma responder normalmente.
   */
  fallbackModelId: string;
  visionModel: string;
  audioModel: string;
  openRouterApiKey: string;
  /** Diretório de trabalho do runtime local do SDK. */
  cwd: string;
  /** Teto de rodadas de ferramenta por questão. O padrão do SDK, 8, é baixo demais aqui. */
  maxIterations: number;
  /** Fontes disponíveis nesta rodada. Ausente ⇒ todas as ferramentas são registradas. */
  health?: SourceHealth;
}

/** Sonda as fontes externas uma vez, para a rodada inteira. */
export function probeSources() {
  const backend = resolveSearchBackend();
  return checkSources({
    // A sonda precisa de resultado, não só de resposta: um backend que devolve lista
    // vazia para toda consulta é tão inútil quanto um que falha.
    webSearch: async () => {
      const hits = await backend.search("wikipedia", 1);
      if (hits.length === 0) throw new Error("busca sem resultados");
      return hits;
    },
    wikipedia: () => searchWikipedia("Wikipedia", 1),
  });
}

/** Nome do provedor de busca em uso, para o log. */
export function searchProviderName(): string {
  return resolveSearchBackend().provider;
}

/** Índice task_id -> nome do anexo, para as ferramentas resolverem arquivos sem adivinhar. */
export function buildFileIndex(questions: GaiaQuestion[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const question of questions) {
    if (question.file_name) index.set(question.task_id, question.file_name);
  }
  return index;
}

export interface QuestionAnswer {
  answer: string;
  rawOutput: string;
  durationMs: number;
  /** Modelo que efetivamente produziu a resposta. */
  modelUsed: string;
  /** O run parou no teto de iterações com o modelo ainda querendo usar ferramentas. */
  truncated?: boolean;
}

/**
 * Responde uma questão, caindo para o modelo de fallback se o primário
 * devolver resposta vazia (tipicamente filtro de conteúdo do provider).
 */
export async function answerQuestion(
  question: GaiaQuestion,
  api: ScoringApi,
  fileIndex: Map<string, string>,
  config: AgentConfig,
): Promise<QuestionAnswer> {
  const primary = await attempt(question, api, fileIndex, config, config.modelId);
  if (primary.answer) return primary;

  // O primário não produziu resposta — filtro de conteúdo, run interrompido, ou
  // ferramenta que falhou repetidas vezes. Vale uma tentativa com outro modelo:
  // desistir aqui custa a questão inteira.
  const fallback = await attempt(question, api, fileIndex, config, config.fallbackModelId);
  const chosen = fallback.answer ? fallback : primary;
  return { ...chosen, durationMs: primary.durationMs + fallback.durationMs };
}

/**
 * Executa uma tentativa convertendo falha em resposta vazia, para o chamador decidir.
 * Falha fatal da conta é a exceção: ela sobe e derruba a rodada, porque nenhuma
 * tentativa seguinte teria como dar certo.
 */
async function attempt(
  question: GaiaQuestion,
  api: ScoringApi,
  fileIndex: Map<string, string>,
  config: AgentConfig,
  modelId: string,
): Promise<QuestionAnswer> {
  try {
    return await runWithModel(question, api, fileIndex, config, modelId);
  } catch (error) {
    if (error instanceof FatalRunError) throw error;
    return {
      answer: "",
      rawOutput: `[falha com ${modelId}] ${error instanceof Error ? error.message : String(error)}`,
      durationMs: 0,
      modelUsed: modelId,
    };
  }
}

/** Uma tentativa de resposta com um modelo específico. */
async function runWithModel(
  question: GaiaQuestion,
  api: ScoringApi,
  fileIndex: Map<string, string>,
  config: AgentConfig,
  modelId: string,
): Promise<QuestionAnswer> {
  const perception: PerceptionConfig = {
    apiKey: config.openRouterApiKey,
    visionModel: config.visionModel,
    audioModel: config.audioModel,
  };

  // Disposal explícito em vez de `await using`: explicit resource management só
  // chega no Node 24, e o runtime aqui é o 22 LTS. Vazar o runtime por questão
  // esgotaria os recursos no meio da rodada.
  const agent = await Agent.create({
    // O SDK resolve `apiKey` a partir deste campo ou de THEOKIT_API_KEY — nunca das
    // provider keys. Passar a chave do OpenRouter aqui é o que dispensa a THEOKIT_API_KEY:
    // com OPENROUTER_API_KEY no ambiente o SDK escolhe o runtime local real, que fala
    // direto com o provider.
    apiKey: config.openRouterApiKey,
    model: { id: modelId },
    systemPrompt: SYSTEM_PROMPT + (config.health ? healthGuidance(config.health) : ""),
    local: { cwd: config.cwd, settingSources: [] },
    // Ferramenta de fonte comprovadamente fora não é registrada: oferecê-la só
    // convida o agente a gastar iterações numa porta fechada.
    tools: [
      ...(config.health?.wikipedia === false ? [] : [wikipediaSearchTool, wikipediaPageTool]),
      ...(config.health?.webSearch === false ? [] : [createSearchTool(resolveSearchBackend().search)]),
      fetchPageTool,
      runPythonTool,
      youtubeTranscriptTool,
      createReadTaskFileTool(api, fileIndex),
      createDescribeImageTool(api, fileIndex, perception),
      createTranscribeAudioTool(api, fileIndex, perception),
    ],
  });

  try {
    const attachmentNote = question.file_name
      ? `\n\nThis question has an attached file named "${question.file_name}". Its task_id is "${question.task_id}" — pass that task_id to the file tools.`
      : "";

    // O teto padrão do loop é 8 iterações, e uma questão do GAIA gasta isso só
    // localizando a fonte: ao estourar, o run é truncado e termina sem resposta.
    // Era essa a causa por trás dos erros "sem detalhe" nas questões de pesquisa.
    const run = await agent.send(`${question.question}${attachmentNote}`, {
      maxIterations: config.maxIterations,
    });

    // O stream é consumido em vez de só aguardar o run: quando o provider recusa a
    // chamada, `result.result` vem vazio e a razão só aparece no evento de status.
    // Foi essa mensagem perdida que transformou "crédito acabou" em "sem detalhe".
    const assistantTexts: string[] = [];
    let failureDetail: string | undefined;

    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text") assistantTexts.push(block.text);
        }
      } else if (event.type === "status" && String(event.status).toUpperCase() === "ERROR") {
        failureDetail = event.message ?? failureDetail;
      }
    }

    const result = await run.wait();

    if (result.status === "error" && !result.stoppedAtIterationLimit) {
      throw classifyRunFailure(question.task_id, failureDetail ?? "sem detalhe do provider");
    }

    // Um run truncado no teto de iterações ainda pode ter dito a resposta antes de
    // parar; o texto colhido do stream é aproveitado em vez de descartado.
    const rawOutput = result.result ?? assistantTexts.join("\n");
    const answer = extractFinalAnswer(rawOutput);
    const truncated = result.stoppedAtIterationLimit === true;

    // Pesquisa esgotada sem conclusão: em vez de desistir, cobra a resposta com o que
    // já foi lido. O contexto da investigação continua no agente, e uma questão
    // respondida por inferência ainda pode acertar — vazia nunca acerta.
    if (answer === "" && truncated) {
      const forced = await forceAnswer(agent, question.task_id);
      if (forced.answer !== "") {
        return {
          ...forced,
          durationMs: (result.durationMs ?? 0) + forced.durationMs,
          modelUsed: modelId,
          truncated: true,
        };
      }
    }

    return {
      answer,
      rawOutput,
      durationMs: result.durationMs ?? 0,
      modelUsed: modelId,
      truncated,
    };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}


const FORCE_ANSWER_PROMPT = `Your research budget is exhausted. Do not call any more tools.

Answer now with the best value you can infer from what you already read, combined with
what you know. Follow the answer format rules exactly: only the value, no explanation,
no hedging, no mention of uncertainty.

End with a single line: FINAL ANSWER: <the answer>`;

/**
 * Cobra do agente uma resposta final sem novas ferramentas.
 * Falha aqui não invalida a questão: devolve resposta vazia e o chamador segue com o
 * que tinha, porque este passo é uma tentativa extra, não um requisito.
 */
async function forceAnswer(
  agent: Awaited<ReturnType<typeof Agent.create>>,
  taskId: string,
): Promise<{ answer: string; rawOutput: string; durationMs: number }> {
  try {
    const run = await agent.send(FORCE_ANSWER_PROMPT, { maxIterations: 1, tools: [] });
    const result = await run.wait();
    const rawOutput = result.result ?? "";
    return { answer: extractFinalAnswer(rawOutput), rawOutput, durationMs: result.durationMs ?? 0 };
  } catch {
    return { answer: "", rawOutput: `[força-resposta falhou para ${taskId}]`, durationMs: 0 };
  }
}
