import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runPython, formatPythonResult } from "../src/tools/python.ts";

// Testes de fronteira: exercitam um subprocesso real, sem rede.
describe("runPython — isolamento de ambiente", () => {
  it("nao entrega credenciais do processo pai ao codigo executado", async () => {
    process.env.CANARIO_DE_TESTE = "FAKE-sk-canario";
    try {
      const r = await runPython(
        "import os; print(os.environ.get('CANARIO_DE_TESTE', 'AUSENTE'))",
        15000,
      );
      assert.equal(r.stdout.trim(), "AUSENTE");
      assert.doesNotMatch(r.stdout, /FAKE-sk/);
    } finally {
      delete process.env.CANARIO_DE_TESTE;
    }
  });

  it("nao expoe a chave do provider ao codigo executado", async () => {
    process.env.OPENROUTER_API_KEY = "FAKE-sk-or-v1-nao-deve-vazar";
    try {
      const r = await runPython("import os; print(len(os.environ.get('OPENROUTER_API_KEY','')))", 15000);
      assert.equal(r.stdout.trim(), "0");
    } finally {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it("ainda fornece PATH, senao o interpretador nao roda nada util", async () => {
    const r = await runPython("import os; print('PATH' in os.environ)", 15000);
    assert.equal(r.stdout.trim(), "True");
  });
});

describe("runPython — prazo", () => {
  it("resolve em vez de ficar pendente quando o codigo excede o prazo", async () => {
    const startedAt = Date.now();
    const r = await runPython("import time; time.sleep(30)", 1500);
    const elapsed = Date.now() - startedAt;
    assert.equal(r.timedOut, true);
    assert.ok(elapsed < 10000, `resolveu em ${elapsed}ms, deveria ser bem menos que 10s`);
  });

  it("resolve mesmo quando o codigo deixa um processo neto vivo", async () => {
    const startedAt = Date.now();
    const r = await runPython(
      "import subprocess, time; subprocess.Popen(['sleep','40']); print('lancou', flush=True); time.sleep(30)",
      1500,
    );
    const elapsed = Date.now() - startedAt;
    assert.equal(r.timedOut, true);
    assert.ok(elapsed < 10000, `resolveu em ${elapsed}ms; o stdio herdado nao pode travar a promessa`);
  });

  it("executa codigo normal dentro do prazo", async () => {
    const r = await runPython("print(6*7)", 15000);
    assert.equal(r.stdout.trim(), "42");
    assert.equal(r.timedOut, false);
    assert.equal(r.exitCode, 0);
  });

  it("reporta erro do interpretador sem esconder o stderr", async () => {
    const r = await runPython("raise ValueError('quebrou de proposito')", 15000);
    assert.match(r.stderr, /ValueError/);
    assert.notEqual(r.exitCode, 0);
    assert.match(formatPythonResult(r), /quebrou de proposito/);
  });
});
