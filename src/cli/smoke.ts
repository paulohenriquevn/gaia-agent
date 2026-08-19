/**
 * Teste de fumaça: responde UMA questão do benchmark de ponta a ponta.
 *
 * Existe para separar "o agente está errado" de "o agente nem sobe" antes de
 * gastar uma rodada completa. Por padrão usa a questão da string invertida,
 * que exige raciocínio e nenhuma ferramenta — se ela falha, o problema é
 * infraestrutura, não pesquisa.
 */
import { loadConfig } from "../config.ts";
import { ScoringApi } from "../scoring-api.ts";
import { answerQuestion, buildFileIndex, probeSources } from "../agent.ts";
import { describeHealth } from "../lib/health.ts";

const config = loadConfig();
const api = new ScoringApi();

const questions = await api.fetchQuestions();
const requestedTaskId = process.argv[2];
const question = requestedTaskId
  ? questions.find((candidate) => candidate.task_id.startsWith(requestedTaskId))
  : questions.find((candidate) => candidate.question.startsWith(".rewsna"));

if (!question) {
  throw new Error(`Nenhuma questão encontrada para "${requestedTaskId ?? "(padrão)"}".`);
}

const health = await probeSources();
console.log(`Fontes: ${describeHealth(health)}`);
console.log(`Modelo: ${config.modelId}`);
console.log(`Questão ${question.task_id}${question.file_name ? ` (anexo: ${question.file_name})` : ""}`);
console.log(`> ${question.question.slice(0, 200)}\n`);

const startedAt = Date.now();
const result = await answerQuestion(question, api, buildFileIndex(questions), { ...config, health });

console.log("--- saída bruta ---");
console.log(result.rawOutput.slice(-1500));
console.log("--- fim ---\n");
console.log(`Resposta extraída: "${result.answer}"`);
console.log(`Tempo: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
