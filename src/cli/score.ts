/**
 * Benchmark local: corrige um answers.json contra um gabarito e imprime o score.
 *
 * Uso:
 *   GROUND_TRUTH_PATH=<arquivo.jsonl> npm run score [answers.json ...]
 *
 * Vários arquivos podem ser passados: vale a resposta do primeiro arquivo, com os
 * seguintes preenchendo apenas o que ficou vazio. Isso combina rodadas por uma regra
 * objetiva, sem consultar o gabarito para escolher.
 *
 * O gabarito não é versionado e não é lido pelo agente. Formato JSONL do dataset GAIA:
 *   {"task_id": "...", "Final answer": "..."}
 */
import { readFileSync } from "node:fs";
import { grade, parseGroundTruthJsonl } from "../lib/grading.ts";
import type { QuestionOutcome } from "../runner.ts";

const groundTruthPath = process.env.GROUND_TRUTH_PATH;
if (!groundTruthPath) {
  throw new Error(
    "GROUND_TRUTH_PATH não está definido. Aponte para um JSONL com {task_id, 'Final answer'}.",
  );
}

const answerPaths = process.argv.slice(2);
if (answerPaths.length === 0) answerPaths.push("answers.json");

// Primeiro arquivo tem precedência; os seguintes só preenchem lacunas.
const answers = new Map<string, string>();
const sourceOf = new Map<string, string>();

for (const path of answerPaths) {
  const outcomes = JSON.parse(readFileSync(path, "utf8")) as QuestionOutcome[];
  for (const outcome of outcomes) {
    const current = answers.get(outcome.task_id);
    if (current === undefined || (current === "" && outcome.answer !== "")) {
      answers.set(outcome.task_id, outcome.answer);
      sourceOf.set(outcome.task_id, path);
    }
  }
}

const report = grade(answers, parseGroundTruthJsonl(readFileSync(groundTruthPath, "utf8")));

const width = 46;
console.log(`${"task".padEnd(10)} ${"resposta".padEnd(width)} ${"esperado".padEnd(28)} `);
console.log("-".repeat(92));

for (const item of report.items) {
  const mark = item.correct ? "OK " : item.empty ? "-- " : "X  ";
  console.log(
    `${item.taskId.slice(0, 8).padEnd(10)} ${item.submitted.slice(0, width - 1).padEnd(width)} ` +
      `${item.expected.slice(0, 27).padEnd(28)} ${mark}`,
  );
}

const empty = report.items.filter((item) => item.empty).length;
const wrong = report.total - report.correct - empty;

console.log();
console.log(`Acertos:  ${report.correct}/${report.total}  =  ${report.scorePercent}%`);
console.log(`Erradas:  ${wrong}   |   sem resposta: ${empty}`);
console.log(`Gate do certificado: 30% — ${report.scorePercent >= 30 ? "ATINGIDO" : "NÃO atingido"}`);

if (answerPaths.length > 1) {
  console.log(`\nFontes combinadas, em ordem de precedência: ${answerPaths.join(", ")}`);
}
