import { spawn } from "node:child_process";
import { z } from "zod";
import { Tool } from "@getloopscale/loopzero-sdk";
import { truncate } from "./support/html-text.ts";
import { resilient } from "./support/resilient-tool.ts";

export interface PythonResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Teto de saída acumulada antes de o processo ser encerrado. */
const MAX_OUTPUT_BYTES = 256 * 1024;

/**
 * Ambiente mínimo do subprocesso.
 *
 * O código executado aqui é escrito pelo modelo a partir de páginas que ele leu na web,
 * ou seja, entrada não confiável. Herdar `process.env` entregaria as credenciais do
 * provider a esse código: um `print(os.environ)` bastaria para exfiltrar a chave. Só
 * passa o que o interpretador precisa para funcionar.
 */
function minimalEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME ?? "/tmp",
    LANG: process.env.LANG ?? "C.UTF-8",
    PYTHONIOENCODING: "utf-8",
    // Impede que o interpretador leia código do diretório de trabalho.
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

/**
 * Executa código Python num subprocesso isolado, com ambiente mínimo, teto de saída e
 * prazo rígido.
 *
 * O prazo encerra o GRUPO de processos, não só o filho: um `subprocess.Popen` disparado
 * pelo código sobrevive ao kill do pai e mantém o stdio aberto, deixando a promessa
 * pendente para sempre.
 */
export function runPython(code: string, timeoutMs: number): Promise<PythonResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-I", "-c", code], {
      stdio: ["ignore", "pipe", "pipe"],
      env: minimalEnv(),
      // Novo grupo de processos, para que o kill alcance os netos.
      detached: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const killGroup = (signal: NodeJS.Signals) => {
      try {
        // O negativo do pid atinge o grupo inteiro.
        if (child.pid !== undefined) process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGKILL");
      // O `close` depende do stdio herdado pelos netos e pode nunca chegar; a promessa
      // resolve por conta própria logo após o kill.
      setTimeout(() => finish(null), 500);
    }, timeoutMs);

    const capture = (target: "out" | "err") => (chunk: Buffer) => {
      const text = chunk.toString();
      if (target === "out") stdout += text;
      else stderr += text;
      if (stdout.length + stderr.length > MAX_OUTPUT_BYTES) {
        stderr += `\n[saída excedeu ${MAX_OUTPUT_BYTES} bytes; processo encerrado]`;
        killGroup("SIGKILL");
        setTimeout(() => finish(null), 100);
      }
    };

    child.stdout.on("data", capture("out"));
    child.stderr.on("data", capture("err"));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Falha ao iniciar python3: ${error.message}`));
    });
    child.on("close", finish);
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
