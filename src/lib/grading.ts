/**
 * Correção local das respostas contra um gabarito.
 *
 * Serve para medir o agente antes de submeter — cada submissão entra no leaderboard
 * público do curso, e descobrir o score só depois de publicá-lo é caro.
 *
 * O gabarito nunca entra no caminho da resposta: é lido aqui, depois que as respostas já
 * foram geradas e gravadas, e nada deste módulo é importado pelo agente.
 *
 * Manter isso verdadeiro exige disciplina no resto do código: valores do gabarito não
 * podem virar exemplo de prompt nem fixture de teste. Uma revisão encontrou
 * "Saint Petersburg" — resposta de uma das questões — dentro do prompt de sistema,
 * servida ao modelo em toda pergunta.
 */

import { TRAILING_PUNCTUATION } from "./answer.ts";

export interface GradedItem {
  taskId: string;
  submitted: string;
  expected: string;
  correct: boolean;
  /** Sem resposta: falha de execução, não erro de conteúdo. */
  empty: boolean;
}

export interface GradeReport {
  items: GradedItem[];
  correct: number;
  total: number;
  /** Percentual inteiro, na mesma escala do gate do curso. */
  scorePercent: number;
}

/**
 * Normaliza para comparação, absorvendo só diferenças que o scorer do curso também
 * ignora: caixa, espaço redundante, pontuação final e espaçamento de listas.
 */
export function normalizeForGrading(value: string): string {
  // Reusa a pontuação de `answer.ts` de propósito: são o mesmo conhecimento, e mantê-los
  // separados fez as duas divergirem — a medição aceitava um final que a submissão não
  // limpava, e o score estimado saía otimista.
  return value
    .trim()
    .toLowerCase()
    .replace(TRAILING_PUNCTUATION, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Compara uma resposta com o gabarito. Resposta vazia nunca conta como acerto. */
export function isCorrect(submitted: string, expected: string): boolean {
  if (submitted.trim() === "") return false;
  return normalizeForGrading(submitted) === normalizeForGrading(expected);
}

/**
 * Corrige as respostas contra o gabarito.
 * Questões sem gabarito conhecido ficam de fora do total — pontuar contra um
 * gabarito que não temos inventaria uma medição.
 */
export function grade(
  answers: Map<string, string>,
  groundTruth: Map<string, string>,
): GradeReport {
  const items: GradedItem[] = [];

  for (const [taskId, submitted] of answers) {
    const expected = groundTruth.get(taskId);
    if (expected === undefined) continue;
    items.push({
      taskId,
      submitted,
      expected,
      correct: isCorrect(submitted, expected),
      empty: submitted.trim() === "",
    });
  }

  const correct = items.filter((item) => item.correct).length;
  const total = items.length;
  return {
    items,
    correct,
    total,
    scorePercent: total === 0 ? 0 : Math.round((correct / total) * 100),
  };
}

/**
 * Lê um gabarito em JSONL no formato do dataset GAIA
 * (`{"task_id": ..., "Final answer": ...}` por linha).
 */
export function parseGroundTruthJsonl(content: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const [index, line] of content.split("\n").entries()) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    let record: { task_id?: string; "Final answer"?: unknown };
    try {
      record = JSON.parse(trimmed);
    } catch {
      throw new Error(`Linha ${index + 1} do gabarito não é JSON válido.`);
    }

    if (record.task_id && record["Final answer"] !== undefined) {
      map.set(record.task_id, String(record["Final answer"]));
    }
  }

  if (map.size === 0) {
    throw new Error("O gabarito não tem nenhuma entrada com task_id e 'Final answer'.");
  }
  return map;
}
