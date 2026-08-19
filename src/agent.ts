import { Agent, type CustomTool } from "@theokit/sdk";
import type { WebSearchCallback } from "@theokit/sdk-tools";
import { DIRECT_ANSWER_PROMPT, SYSTEM_PROMPT } from "./prompts.ts";
import { buildTools } from "./tools/registry.ts";
import { createToolPermissionPlugin } from "./lib/tool-permissions.ts";
import { failureReason, harvestStream, rawOutputOf } from "./lib/run-outcome.ts";
import { ScoringApi, type GaiaQuestion } from "./scoring-api.ts";
import { extractFinalAnswer } from "./lib/answer.ts";
import { classifyRunFailure } from "./lib/agent-errors.ts";
import { answerWithStrategy, type QuestionAnswer } from "./answer-strategy.ts";
import { resolveSearchBackend } from "./tools/search-backend.ts";
import { searchWikipedia } from "./tools/wikipedia.ts";
import { checkSources, healthGuidance, type SourceHealth } from "./lib/health.ts";

/**
 * Regras de formatação do GAIA. O benchmark pontua por igualdade exata de string,
 * então o formato da resposta pesa tanto quanto a pesquisa que a produziu.
 */


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
  /** Backend de busca, injetado — o agente não escolhe provedor nem lê o ambiente. */
  search: WebSearchCallback;
}

/** Sonda as fontes externas uma vez, para a rodada inteira. */
export function probeSources(backend = resolveSearchBackend()) {
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

/** Responde uma questão aplicando a política de tentativas de `answer-strategy.ts`. */
export function answerQuestion(
  question: GaiaQuestion,
  api: ScoringApi,
  fileIndex: Map<string, string>,
  config: AgentConfig,
): Promise<QuestionAnswer> {
  return answerWithStrategy(question, {
    research: (q, modelId) => runWithModel(q, api, fileIndex, config, modelId),
    recall: (q, modelId) => answerFromKnowledge(q, config, modelId),
    modelId: config.modelId,
    fallbackModelId: config.fallbackModelId,
  });
}

/** Cria o agente de uma tentativa. Isolado para que a conversa não carregue a montagem. */
async function createQuestionAgent(config: AgentConfig, modelId: string, tools: CustomTool[]) {
  // O SDK resolve `apiKey` deste campo ou de THEOKIT_API_KEY — nunca das provider keys.
  // Passar a chave do OpenRouter aqui é o que dispensa a THEOKIT_API_KEY: com
  // OPENROUTER_API_KEY no ambiente o SDK escolhe o runtime local, que fala com o provider.
  return Agent.create({
    apiKey: config.openRouterApiKey,
    model: { id: modelId },
    systemPrompt: SYSTEM_PROMPT + (config.health ? healthGuidance(config.health) : ""),
    local: { cwd: config.cwd, settingSources: [] },
    tools,
    // Nega as ferramentas que o runtime adiciona sozinho; ver tool-permissions.ts.
    plugins: [createToolPermissionPlugin()],
  });
}

/** Nota que informa ao agente como buscar o anexo da questão. */
function attachmentNote(question: GaiaQuestion): string {
  if (!question.file_name) return "";
  return `\n\nThis question has an attached file named "${question.file_name}". Its task_id is "${question.task_id}" — pass that task_id to the file tools.`;
}

/** Uma tentativa de resposta com um modelo específico. */
async function runWithModel(
  question: GaiaQuestion,
  api: ScoringApi,
  fileIndex: Map<string, string>,
  config: AgentConfig,
  modelId: string,
): Promise<QuestionAnswer> {
  const tools = buildTools({
    api,
    fileIndex,
    perception: {
      apiKey: config.openRouterApiKey,
      visionModel: config.visionModel,
      audioModel: config.audioModel,
    },
    search: config.search,
    health: config.health,
  });

  // Disposal explícito em vez de `await using`: explicit resource management só chega no
  // Node 24, e o runtime aqui é o 22 LTS. Vazar o runtime por questão esgotaria os
  // recursos no meio da rodada.
  const agent = await createQuestionAgent(config, modelId, tools);

  try {
    // O teto padrão do loop é 8 iterações, e uma questão do GAIA gasta isso só localizando
    // a fonte: ao estourar, o run é truncado e termina sem resposta.
    const run = await agent.send(`${question.question}${attachmentNote(question)}`, {
      maxIterations: config.maxIterations,
    });

    const harvest = await harvestStream(run);
    const result = await run.wait();
    const truncated = result.stoppedAtIterationLimit === true;

    if (result.status === "error" && !truncated) {
      throw classifyRunFailure(question.task_id, failureReason(result, harvest.failureDetail));
    }

    const rawOutput = rawOutputOf(result, harvest);
    return {
      answer: extractFinalAnswer(rawOutput),
      rawOutput,
      durationMs: result.durationMs ?? 0,
      modelUsed: modelId,
      truncated,
    };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}


/**
 * Responde sem ferramenta alguma, num agente novo.
 *
 * Existe porque alguns modelos nunca emitem texto enquanto têm ferramentas
 * disponíveis: entram no ciclo de chamadas e só param ao esgotar o orçamento, sem
 * nunca concluir. O mesmo modelo, perguntado direto, responde na primeira tentativa.
 *
 * O agente é novo de propósito — o anterior chega aqui em estado de erro, e reusá-lo
 * só propaga a falha.
 */
async function answerFromKnowledge(
  question: GaiaQuestion,
  config: AgentConfig,
  modelId: string,
): Promise<QuestionAnswer> {
  const agent = await Agent.create({
    apiKey: config.openRouterApiKey,
    model: { id: modelId },
    systemPrompt: SYSTEM_PROMPT,
    local: { cwd: config.cwd, settingSources: [] },
    tools: [],
    plugins: [createToolPermissionPlugin()],
  });

  try {
    const run = await agent.send(`${DIRECT_ANSWER_PROMPT}${question.question}`, {
      maxIterations: 1,
    });

    const harvest = await harvestStream(run);
    const result = await run.wait();

    // Checar o status aqui não é redundante: sem isto uma falha de conta neste caminho
    // — percorrido por toda questão cuja pesquisa voltou vazia — vira resposta vazia e
    // a rodada segue queimando tentativas que não têm como dar certo.
    if (result.status === "error") {
      throw classifyRunFailure(question.task_id, failureReason(result, harvest.failureDetail));
    }

    const rawOutput = rawOutputOf(result, harvest);
    return {
      answer: extractFinalAnswer(rawOutput),
      rawOutput,
      durationMs: result.durationMs ?? 0,
      modelUsed: `${modelId} (sem ferramentas)`,
    };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

export type { QuestionAnswer } from "./answer-strategy.ts";
