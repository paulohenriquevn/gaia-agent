import { spawn } from "node:child_process";
import { z } from "zod";
import { Tool } from "@theokit/sdk";
import { truncate } from "../lib/html-text.ts";
import { resilient } from "../lib/resilient-tool.ts";

export interface PythonResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Executa código Python num subprocesso isolado com timeout rígido.
 * O timeout não é opcional: código do benchmark pode conter laços longos de propósito.
 */
export function runPython(code: string, timeoutMs: number): Promise<PythonResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-c", code], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Falha ao iniciar python3: ${error.message}`));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}

/** Formata o resultado da execução preservando o sinal de falha — nunca esconde stderr. */
export function formatPythonResult(result: PythonResult): string {
  const sections: string[] = [];
  if (result.timedOut) sections.push("[TIMEOUT: execução interrompida antes de terminar]");
  if (result.stdout.trim()) sections.push(`stdout:\n${result.stdout.trim()}`);
  if (result.stderr.trim()) sections.push(`stderr:\n${result.stderr.trim()}`);
  if (result.exitCode !== 0 && !result.timedOut) sections.push(`exit code: ${result.exitCode}`);
  if (sections.length === 0) return "[execução concluída sem nenhuma saída]";
  return truncate(sections.join("\n\n"), 20000);
}

export const runPythonTool = Tool.create({
  name: "run_python",
  description:
    "Executa código Python 3 e devolve stdout/stderr. Use para rodar código anexado a uma questão, fazer cálculos exatos, ou processar dados. O código precisa imprimir o resultado com print().",
  inputSchema: z.object({
    code: z.string().min(1).describe("Código Python completo, incluindo os print() do resultado"),
    timeout_seconds: z.number().int().min(1).max(120).default(30),
  }),
  handler: resilient(
    "run_python",
    "Revise o código: erro de sintaxe, import indisponível ou laço sem fim.",
    async ({ code, timeout_seconds }: { code: string; timeout_seconds: number }) =>
      formatPythonResult(await runPython(code, timeout_seconds * 1000)),
  ),
});
