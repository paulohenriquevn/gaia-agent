import { answerQuestion, buildFileIndex, type AgentConfig } from "./agent.ts";
import type { GaiaQuestion, ScoringApi, SubmittedAnswer } from "./scoring-api.ts";

export interface QuestionOutcome {
  task_id: string;
  question: string;
  answer: string;
  rawOutput: string;
  durationMs: number;
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
  onProgress?: (outcome: QuestionOutcome, completed: number, total: number) => void,
): Promise<QuestionOutcome[]> {
  const fileIndex = buildFileIndex(questions);
  const outcomes = new Array<QuestionOutcome>(questions.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= questions.length) return;

      const question = questions[index];
      const startedAt = Date.now();
      try {
        const result = await answerQuestion(question, api, fileIndex, config);
        outcomes[index] = {
          task_id: question.task_id,
          question: question.question,
          answer: result.answer,
          rawOutput: result.rawOutput,
          durationMs: result.durationMs,
        };
      } catch (error) {
        outcomes[index] = {
          task_id: question.task_id,
          question: question.question,
          answer: "",
          rawOutput: "",
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      onProgress?.(outcomes[index], ++completed, questions.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, questions.length) }, () => worker()),
  );
  return outcomes;
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
