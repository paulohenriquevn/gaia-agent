import { Agent } from "@theokit/sdk";
import { ScoringApi, type GaiaQuestion } from "./scoring-api.ts";
import { extractFinalAnswer } from "./lib/answer.ts";
import { FatalRunError, classifyRunFailure } from "./lib/agent-errors.ts";
import { fetchPageTool, webSearchTool } from "./tools/web.ts";
import { runPythonTool } from "./tools/python.ts";
import { youtubeTranscriptTool } from "./tools/youtube.ts";
import { wikipediaPageTool, wikipediaSearchTool } from "./tools/wikipedia.ts";
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
export const SYSTEM_PROMPT = `You are a precise research assistant answering questions from the GAIA benchmark.

Your answer is graded by EXACT STRING MATCH. A correct fact in the wrong format scores zero.

WORKFLOW
1. Read the question and identify exactly what single value is being asked for.
2. If the question mentions an attached file, call the matching tool (read_task_file, describe_image, transcribe_audio) with the task_id you were given.
3. Research before answering. Never answer a factual lookup from memory — verify it against a source you actually fetched.
   - Wikipedia is the intended source for most of these questions: use wikipedia_search then wikipedia_page.
   - Use web_search and fetch_page for anything outside Wikipedia.
   - If a tool fails, switch to a different tool or a different phrasing. Do not call the same tool with the same arguments twice.
4. Use run_python for any arithmetic, counting, sorting, or data processing. Do not do math in your head.
5. Cross-check the value once before committing to it.

ANSWER FORMAT — these rules are absolute
- Reply with ONLY the value asked for. No explanation, no units, no restating the question.
- Numbers: plain digits, no thousands separators, no currency symbols, no units — unless the question explicitly asks for a unit.
- Strings: no leading articles ("the", "a"), no abbreviations. Spell out place names in full.
- Lists: comma-separated, following the number and string rules per element, in the order the question requests.
- If asked for a name, give exactly the part requested (first name only means first name only; surname only means surname only).

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
    systemPrompt: SYSTEM_PROMPT,
    local: { cwd: config.cwd, settingSources: [] },
    tools: [
      wikipediaSearchTool,
      wikipediaPageTool,
      webSearchTool,
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

    const run = await agent.send(`${question.question}${attachmentNote}`);

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

    if (result.status === "error") {
      throw classifyRunFailure(question.task_id, failureDetail ?? "sem detalhe do provider");
    }

    const rawOutput = result.result ?? assistantTexts.join("\n");
    return {
      answer: extractFinalAnswer(rawOutput),
      rawOutput,
      durationMs: result.durationMs ?? 0,
      modelUsed: modelId,
    };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}
