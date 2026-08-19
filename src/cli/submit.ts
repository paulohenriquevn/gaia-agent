/**
 * Submete um answers.json já produzido por `npm run eval`.
 * Passo separado e explícito: cada submissão entra no leaderboard público do curso.
 */
import { readFileSync } from "node:fs";
import { loadConfig, ConfigError } from "../config.ts";
import { ScoringApi } from "../scoring-api.ts";
import { toSubmittedAnswers, type QuestionOutcome } from "../runner.ts";

const config = loadConfig();
if (!config.username) throw new ConfigError("HF_USERNAME é obrigatório para submeter.");
if (!config.agentCodeUrl) throw new ConfigError("AGENT_CODE_URL é obrigatório para submeter.");

const inputPath = process.env.OUTPUT_PATH ?? "answers.json";
const outcomes = JSON.parse(readFileSync(inputPath, "utf8")) as QuestionOutcome[];

const result = await new ScoringApi().submit({
  username: config.username,
  agent_code: config.agentCodeUrl,
  answers: toSubmittedAnswers(outcomes),
});

console.log(`Score: ${result.score}% (${result.correct_count}/${result.total_attempted})`);
console.log(result.message);
