/**
 * Servidor do Hugging Face Space: uma página com um botão que roda o agente
 * nas 20 questões e submete o resultado, transmitindo o progresso por SSE.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.ts";
import { ScoringApi } from "./scoring-api.ts";
import { answerAll, toSubmittedAnswers } from "./runner.ts";

const PORT = Number.parseInt(process.env.PORT ?? "7860", 10);
const here = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const api = new ScoringApi();

let running = false;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (url.pathname === "/") {
    const html = readFileSync(join(here, "..", "public", "index.html"), "utf8");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }

  if (url.pathname === "/run") {
    if (running) {
      response.writeHead(409, { "content-type": "text/plain" });
      response.end("Já existe uma execução em andamento.");
      return;
    }
    running = true;
    await streamRun(url.searchParams.get("submit") === "true", response);
    running = false;
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("Not found");
});

async function streamRun(shouldSubmit: boolean, response: import("node:http").ServerResponse) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  const send = (event: string, data: unknown) =>
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const questions = await api.fetchQuestions();
    send("start", { total: questions.length, model: config.modelId });

    const outcomes = await answerAll(questions, api, config, config.concurrency, (outcome, done, total) => {
      send("progress", {
        done,
        total,
        task_id: outcome.task_id,
        question: outcome.question.slice(0, 120),
        answer: outcome.answer,
        error: outcome.error ?? null,
      });
    });

    if (shouldSubmit) {
      if (!config.username || !config.agentCodeUrl) {
        throw new Error("HF_USERNAME e AGENT_CODE_URL precisam estar configurados para submeter.");
      }
      const result = await api.submit({
        username: config.username,
        agent_code: config.agentCodeUrl,
        answers: toSubmittedAnswers(outcomes),
      });
      send("submitted", result);
    } else {
      send("done", { answers: toSubmittedAnswers(outcomes) });
    }
  } catch (error) {
    send("error", { message: error instanceof Error ? error.message : String(error) });
  } finally {
    response.end();
  }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`GAIA Final Agent ouvindo em http://0.0.0.0:${PORT}`);
});
