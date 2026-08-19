import { Agent, setDiagnosticsSink } from "@theokit/sdk";
import { TheokitAgentError } from "@theokit/sdk/errors";
import { ScoringApi } from "./src/scoring-api.ts";
import { SYSTEM_PROMPT, buildFileIndex } from "./src/agent.ts";
import { fetchPageTool, webSearchTool } from "./src/tools/web.ts";
import { wikipediaPageTool, wikipediaSearchTool } from "./src/tools/wikipedia.ts";
import { runPythonTool } from "./src/tools/python.ts";

setDiagnosticsSink((...args: unknown[]) => {
  const s = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  if (/error|fail|abort|limit|exceed|max|turn|iterat/i.test(s)) console.log("DIAG:", s.slice(0, 500));
});

const api = new ScoringApi();
const questions = await api.fetchQuestions();
const q = questions.find((x) => x.task_id.startsWith(process.argv[2] ?? "bda648d7"))!;

const agent = await Agent.create({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: { id: "openrouter/anthropic/claude-sonnet-5" },
  systemPrompt: SYSTEM_PROMPT,
  local: { cwd: process.cwd(), settingSources: [] },
  tools: [wikipediaSearchTool, wikipediaPageTool, webSearchTool, fetchPageTool, runPythonTool],
});

let toolCalls = 0, toolFails = 0, assistantTurns = 0;
try {
  const run = await agent.send(q.question);
  for await (const ev of run.stream()) {
    const e = ev as any;
    if (e.type === "assistant") { assistantTurns++; console.log(`[assistant #${assistantTurns}]`, JSON.stringify(e.message?.content).slice(0, 160)); }
    else if (e.type === "tool_call" && e.status === "completed") {
      toolCalls++;
      const res = JSON.stringify(e.result ?? "");
      const failed = /stderr":"[^"]+/.test(res) || /exitCode":1/.test(res);
      if (failed) toolFails++;
      console.log(`[tool #${toolCalls}] ${e.name} ${failed ? "FALHOU" : "ok"} ${res.slice(0, 130)}`);
    }
    else if (e.type === "status") console.log("[status]", e.status, e.message ?? "");
  }
  const r = await run.wait();
  console.log(`\n=== status=${r.status} | turnos=${assistantTurns} | tools=${toolCalls} (falhas=${toolFails}) | result=${JSON.stringify(r.result)?.slice(0,200)}`);
} catch (error) {
  if (error instanceof TheokitAgentError) {
    console.log(`\n=== TheokitAgentError code=${error.code} retryable=${error.isRetryable}\n${error.message}`);
  } else { console.log("\n=== erro:", error); }
} finally {
  await agent[Symbol.asyncDispose]();
}
