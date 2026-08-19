import { Agent } from "@theokit/sdk";
import { ScoringApi, type GaiaQuestion } from "./scoring-api.ts";
import { extractFinalAnswer } from "./lib/answer.ts";
import { fetchPageTool, webSearchTool } from "./tools/web.ts";
import { runPythonTool } from "./tools/python.ts";
import { youtubeTranscriptTool } from "./tools/youtube.ts";
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
3. Research with web_search and fetch_page. Never answer a factual lookup from memory — verify it against a source you actually fetched. Wikipedia is usually the intended source.
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
  const primary = await runWithModel(question, api, fileIndex, config, config.modelId);
  if (primary.answer) return primary;

  const fallback = await runWithModel(question, api, fileIndex, config, config.fallbackModelId);
  return {
    ...fallback,
    durationMs: primary.durationMs + fallback.durationMs,
  };
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
    const result = await run.wait();

    if (result.status === "error") {
      throw new Error(`Run falhou para ${question.task_id}: ${result.result ?? "sem detalhe"}`);
    }

    const rawOutput = result.result ?? "";
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
