import { Agent, setDiagnosticsSink } from "@theokit/sdk";
import { ScoringApi } from "./src/scoring-api.ts";
import { SYSTEM_PROMPT, probeSources } from "./src/agent.ts";
import { wikipediaPageTool, wikipediaSearchTool } from "./src/tools/wikipedia.ts";
import { fetchPageTool } from "./src/tools/web.ts";
import { runPythonTool } from "./src/tools/python.ts";
import { healthGuidance } from "./src/lib/health.ts";

const seen: string[] = [];
setDiagnosticsSink((...a: unknown[]) => {
  const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  seen.push(s);
  if (/error|fail|abort|limit|429|quota|doom/i.test(s)) console.log("DIAG:", s.slice(0, 300));
});

const api = new ScoringApi();
const questions = await api.fetchQuestions();
const q = questions.find((x) => x.task_id.startsWith(process.argv[2] ?? "bda648d7"))!;
const health = await probeSources();
console.log("saude:", JSON.stringify(health));

const agent = await Agent.create({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: { id: process.env.MODEL_ID! },
  systemPrompt: SYSTEM_PROMPT + healthGuidance(health),
  local: { cwd: process.cwd(), settingSources: [] },
  tools: [wikipediaSearchTool, wikipediaPageTool, fetchPageTool, runPythonTool],
});

let tools = 0, turns = 0;
try {
  const run = await agent.send(q.question, { maxIterations: 30 });
  for await (const ev of run.stream()) {
    const e = ev as any;
    if (e.type === "assistant") { turns++; console.log(`[a${turns}]`, JSON.stringify(e.message?.content).slice(0, 200)); }
    else if (e.type === "tool_call" && e.status === "completed") { tools++; console.log(`[t${tools}] ${e.name}`, JSON.stringify(e.args ?? "").slice(0,90), "->", JSON.stringify(e.result ?? "").slice(0, 110)); }
    else if (e.type === "status") console.log("[status]", e.status, e.message ?? "(sem mensagem)");
  }
  const r = await run.wait();
  console.log("\n=== RunResult ===");
  console.log("status:", r.status, "| turnos:", turns, "| tools:", tools);
  console.log("stoppedAtIterationLimit:", r.stoppedAtIterationLimit);
  console.log("stoppedByDoomLoop:", r.stoppedByDoomLoop);
  console.log("result:", JSON.stringify(r.result)?.slice(0, 300));
  console.log("usage:", JSON.stringify(r.usage));
} catch (e) {
  console.log("EXCECAO:", e);
} finally {
  await agent[Symbol.asyncDispose]();
  console.log("\n--- ultimas 6 linhas de diagnostico ---");
  for (const l of seen.slice(-6)) console.log("  ", l.slice(0, 220));
}
