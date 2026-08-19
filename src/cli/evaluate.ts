/**
 * Roda o agente nas 20 questões e grava o resultado em disco.
 * Não submete nada — submissão é passo explícito e separado (src/cli/submit.ts),
 * porque cada submissão aparece no leaderboard público do curso.
 */
import { writeFileSync } from "node:fs";
import { loadConfig } from "../config.ts";
import { ScoringApi } from "../scoring-api.ts";
import { answerAll } from "../runner.ts";
import { probeSources, searchProviderName } from "../agent.ts";
import { describeHealth } from "../lib/health.ts";
import { createRunBudget } from "../lib/budget.ts";
import { configureSearchLimiter } from "../lib/rate-limiter.ts";

const config = loadConfig();
const api = new ScoringApi();

// O teto é criado ANTES da primeira chamada: em modo block ele recusa a requisição
// antes de emiti-la, então protege de verdade em vez de avisar depois do gasto.
configureSearchLimiter(config.searchMinIntervalMs);
const budget = createRunBudget({ limitUsd: config.budgetLimitUsd, mode: "block" });
if (budget) console.log(`Teto de gasto: US$ ${config.budgetLimitUsd.toFixed(2)}/hora`);

const questions = await api.fetchQuestions();
const health = await probeSources();
console.log(`Fontes -> ${describeHealth(health)} (busca via ${searchProviderName()})`);
console.log(`Respondendo ${questions.length} questões com ${config.modelId} (concorrência ${config.concurrency})\n`);

const outcomes = await answerAll(questions, api, { ...config, health }, config.concurrency, (outcome, done, total) => {
  const status = outcome.error ? `ERRO: ${outcome.error.slice(0, 80)}` : `→ ${outcome.answer}`;
  const seconds = (outcome.durationMs / 1000).toFixed(0);
  console.log(`[${String(done).padStart(2)}/${total}] ${outcome.task_id.slice(0, 8)} (${seconds}s) ${status}`);
});

const outputPath = config.outputPath;
writeFileSync(outputPath, JSON.stringify(outcomes, null, 2));

const failed = outcomes.filter((outcome) => outcome.error).length;
const empty = outcomes.filter((outcome) => !outcome.error && !outcome.answer).length;
console.log(`\nGravado em ${outputPath}`);
console.log(`Respondidas: ${outcomes.length - failed - empty} | vazias: ${empty} | com erro: ${failed}`);
