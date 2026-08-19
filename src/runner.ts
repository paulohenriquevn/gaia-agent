import { answerQuestion, buildFileIndex, type AgentConfig } from "./agent.ts";
import { FatalRunError } from "./lib/agent-errors.ts";
import type { GaiaQuestion, ScoringApi, SubmittedAnswer } from "./scoring-api.ts";

export type ProgressCallback = (
  outcome: QuestionOutcome,
  completed: number,
  total: number,
) => void;

export interface QuestionOutcome {
  task_id: string;
  question: string;
  answer: string;
  rawOutput: string;
  durationMs: number;
  /** Modelo que produziu a resposta; ausente quando a questão falhou. */
  modelUsed?: string;
  /** Mensagem do erro quando a questão falhou; ausente em caso de sucesso. */
  error?: string;
}

/**
 * Responde todas as questões com paralelismo limitado.
 *
 * Uma questão que falha NÃO derruba o lote: o benchmark pontua por acerto individual,
 * e perder 19 respostas boas por causa de 1 timeout seria o pior resultado possível.
 * A falha é registrada em `error` e a resposta vai vazia.
 */
export async function answerAll(
  questions: GaiaQuestion[],
  api: ScoringApi,
  config: AgentConfig,
  concurrency: number,
  onProgress?: ProgressCallback,
): Promise<QuestionOutcome[]> {
  const fileIndex = buildFileIndex(questions);
  const state: RunState = {
    outcomes: new Array<QuestionOutcome>(questions.length),
    nextIndex: 0,
    completed: 0,
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, questions.length) }, () =>
      worker(questions, api, config, fileIndex, state, onProgress),
    ),
  );

  if (state.fatal !== undefined) {
    // A falha fatal é anexada aos resultados em vez de lançada: as questões já
    // respondidas custaram tempo e crédito, e descartá-las era o pior desfecho
    // possível — exatamente o que acontecia quando o crédito acabava no meio.
    state.fatal.partialOutcomes = state.outcomes.filter(Boolean);
  }

  return state.outcomes.filter(Boolean);
}

interface RunState {
  outcomes: QuestionOutcome[];
  nextIndex: number;
  completed: number;
  fatal?: FatalRunError;
}

/** Consome questões da fila até esgotá-la ou até uma falha condenar a rodada. */
async function worker(
  questions: GaiaQuestion[],
  api: ScoringApi,
  config: AgentConfig,
  fileIndex: Map<string, string>,
  state: RunState,
  onProgress?: ProgressCallback,
): Promise<void> {
  while (state.fatal === undefined) {
    const index = state.nextIndex++;
    if (index >= questions.length) return;

    state.outcomes[index] = await answerOne(questions[index], api, config, fileIndex, state);
    if (state.fatal !== undefined) return;
    onProgress?.(state.outcomes[index], ++state.completed, questions.length);
  }
}

/** Responde uma questão, convertendo falha comum em resultado vazio e registrando a fatal. */
async function answerOne(
  question: GaiaQuestion,
  api: ScoringApi,
  config: AgentConfig,
  fileIndex: Map<string, string>,
  state: RunState,
): Promise<QuestionOutcome> {
  const startedAt = Date.now();
  try {
    const result = await answerQuestion(question, api, fileIndex, config);
    return {
      task_id: question.task_id,
      question: question.question,
      answer: result.answer,
      rawOutput: result.rawOutput,
      durationMs: result.durationMs,
      modelUsed: result.modelUsed,
    };
  } catch (error) {
    // Crédito esgotado ou chave inválida condena as questões restantes: nenhuma
    // tentativa seguinte teria como dar certo.
    if (error instanceof FatalRunError) state.fatal = error;
    return {
      task_id: question.task_id,
      question: question.question,
      answer: "",
      rawOutput: "",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Converte resultados em payload de submissão.
 * Respostas vazias são incluídas de propósito: o scorer divide pelo total de questões,
 * então omitir uma resposta não melhora o score, e submeter todas mantém o payload auditável.
 */
export function toSubmittedAnswers(outcomes: QuestionOutcome[]): SubmittedAnswer[] {
  return outcomes.map((outcome) => ({
    task_id: outcome.task_id,
    submitted_answer: outcome.answer,
  }));
}
