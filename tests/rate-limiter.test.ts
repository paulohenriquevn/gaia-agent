import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../src/lib/rate-limiter.ts";

describe("RateLimiter", () => {
  it("espaca chamadas concorrentes em vez de deixa-las sair em rajada", async () => {
    const limiter = new RateLimiter(60);
    const startedAt: number[] = [];
    const t0 = Date.now();

    await Promise.all(
      Array.from({ length: 4 }, () => limiter.run(async () => { startedAt.push(Date.now() - t0); })),
    );

    assert.equal(startedAt.length, 4);
    const ordered = [...startedAt].sort((a, b) => a - b);
    for (let i = 1; i < ordered.length; i++) {
      // Margem de 15ms para o agendador; o essencial é não sair tudo junto.
      assert.ok(ordered[i] - ordered[i - 1] >= 45,
        `intervalos: ${ordered.join(",")} — a rajada é o que causa o bloqueio`);
    }
  });

  it("uma falha nao trava a fila das chamadas seguintes", async () => {
    const limiter = new RateLimiter(5);
    await assert.rejects(limiter.run(async () => { throw new Error("falhou"); }), /falhou/);
    assert.equal(await limiter.run(async () => "seguinte ok"), "seguinte ok");
  });

  it("propaga o valor da operacao", async () => {
    assert.equal(await new RateLimiter(0).run(async () => 42), 42);
  });

  it("recusa intervalo invalido em vez de silenciar", () => {
    assert.throws(() => new RateLimiter(-1), /Intervalo mínimo inválido/);
    assert.throws(() => new RateLimiter(Number.NaN), /Intervalo mínimo inválido/);
  });
});
