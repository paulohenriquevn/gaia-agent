/**
 * Servidor do Hugging Face Space: uma página com um botão que roda o agente
 * nas 20 questões e submete o resultado, transmitindo o progresso por SSE.
 */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.ts";
import { ScoringApi } from "./scoring-api.ts";
import { answerAll, toSubmittedAnswers } from "./runner.ts";
import { probeSources, searchProviderName } from "./agent.ts";
import { describeHealth } from "./lib/health.ts";
const here = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const api = new ScoringApi();

/**
 * Segredo que autoriza disparar uma execução.
 *
 * `/run` gasta crédito do provider e publica no leaderboard do curso, então não pode
 * ficar aberto a quem alcançar a URL. Sem o segredo configurado o servidor sobe em modo
 * somente-leitura, que é o comportamento seguro por omissão.
 */
const RUN_TOKEN = config.runToken;

let running = false;

/** Confere o segredo em tempo constante, para a resposta não revelar o prefixo correto. */
function isAuthorized(url: URL, request: import("node:http").IncomingMessage): boolean {
  if (!RUN_TOKEN) return false;
  const provided = url.searchParams.get("token") ?? request.headers["x-run-token"];
  const supplied = Array.isArray(provided) ? provided[0] : provided;
  if (typeof supplied !== "string" || supplied.length !== RUN_TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(RUN_TOKEN));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (url.pathname === "/") {
    const html = readFileSync(join(here, "..", "public", "index.html"), "utf8");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }

  if (url.pathname === "/run") {
    if (!isAuthorized(url, request)) {
      response.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
      response.end(
        RUN_TOKEN
          ? "Token inválido."
          : "Execução desabilitada: defina RUN_TOKEN para habilitar /run.",
      );
      return;
    }
    if (running) {
      response.writeHead(409, { "content-type": "text/plain; charset=utf-8" });
      response.end("Já existe uma execução em andamento.");
      return;
    }

    running = true;
    try {
      await streamRun(url.searchParams.get("submit") === "true", response);
    } finally {
      // Sem o finally, um cliente que abortasse o SSE deixava o servidor preso em 409
      // para sempre: a flag nunca voltava a false.
      running = false;
    }
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
    // Sondar as fontes aqui também: sem isto o servidor era o único entrypoint que
    // rodava sem health, e todo o mecanismo de desregistrar ferramenta morta ficava
    // inerte justamente no ambiente publicado.
    const health = await probeSources();
    send("start", {
      total: questions.length,
      model: config.modelId,
      health: describeHealth(health),
      searchProvider: searchProviderName(),
    });

    const outcomes = await answerAll(questions, api, { ...config, health }, config.concurrency, (outcome, done, total) => {
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
    const message = error instanceof Error ? error.message : String(error);
    // O servidor precisa deixar rastro: antes, uma falha só aparecia para o cliente e
    // o log do processo ficava mudo.
    console.error(`[run] falhou: ${message}`);
    send("error", { message });
  } finally {
    response.end();
  }
}

server.listen(config.port, "0.0.0.0", () => {
  console.log(`GAIA Final Agent ouvindo em http://0.0.0.0:${config.port}`);
  console.log(RUN_TOKEN ? "/run habilitado (token exigido)" : "/run desabilitado (defina RUN_TOKEN)");
});
