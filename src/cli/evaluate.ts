/**
 * Roda o agente nas 20 questões e grava o resultado em disco.
 * Não submete nada — submissão é passo explícito e separado (src/cli/submit.ts),
 * porque cada submissão aparece no leaderboard público do curso.
 */
import { writeFileSync } from "node:fs";
import { loadConfig } from "../config.ts";
import { ScoringApi } from "../scoring-api.ts";
import { answerAll } from "../runner.ts";

const config = loadConfig();
const api = new ScoringApi();

const questions = await api.fetchQuestions();
console.log(`Respondendo ${questions.length} questões com ${config.modelId} (concorrência ${config.concurrency})\n`);

const outcomes = await answerAll(questions, api, config, config.concurrency, (outcome, done, total) => {
  const status = outcome.error ? `ERRO: ${outcome.error.slice(0, 80)}` : `→ ${outcome.answer}`;
  const seconds = (outcome.durationMs / 1000).toFixed(0);
  console.log(`[${String(done).padStart(2)}/${total}] ${outcome.task_id.slice(0, 8)} (${seconds}s) ${status}`);
});

const outputPath = process.env.OUTPUT_PATH ?? "answers.json";
writeFileSync(outputPath, JSON.stringify(outcomes, null, 2));

const failed = outcomes.filter((outcome) => outcome.error).length;
const empty = outcomes.filter((outcome) => !outcome.error && !outcome.answer).length;
console.log(`\nGravado em ${outputPath}`);
console.log(`Respondidas: ${outcomes.length - failed - empty} | vazias: ${empty} | com erro: ${failed}`);
