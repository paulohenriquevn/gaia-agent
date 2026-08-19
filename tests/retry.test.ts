import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "../src/lib/retry.ts";

const always = () => true;

describe("withRetry", () => {
  it("devolve o resultado sem retentar quando a primeira tentativa passa", async () => {
    let calls = 0;
    const result = await withRetry(async () => { calls++; return "ok"; },
      { attempts: 3, baseDelayMs: 1, isRetryable: always });
    assert.equal(result, "ok");
    assert.equal(calls, 1);
  });

  it("retenta ate obter sucesso", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error("temporario");
      return "ok";
    }, { attempts: 5, baseDelayMs: 1, isRetryable: always });
    assert.equal(result, "ok");
    assert.equal(calls, 3);
  });

  it("nao retenta erro permanente", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => { calls++; throw new Error("permanente"); },
        { attempts: 5, baseDelayMs: 1, isRetryable: () => false }),
      /permanente/,
    );
    assert.equal(calls, 1);
  });

  it("propaga o ultimo erro apos esgotar as tentativas", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => { calls++; throw new Error(`falha ${calls}`); },
        { attempts: 3, baseDelayMs: 1, isRetryable: always }),
      /falha 3/,
    );
    assert.equal(calls, 3);
  });

  it("aplica jitter: duas rajadas identicas nao esperam o mesmo tempo", async () => {
    // O jitter e a razao de delegar ao SDK: sem ele, workers paralelos que tomam o mesmo
    // bloqueio voltam a bater no endpoint em sincronia.
    const durations: number[] = [];
    for (let round = 0; round < 6; round++) {
      const startedAt = Date.now();
      try {
        await withRetry(async () => { throw new Error("t"); },
          { attempts: 3, baseDelayMs: 40, isRetryable: always });
      } catch { /* esperado */ }
      durations.push(Date.now() - startedAt);
    }
    assert.ok(new Set(durations).size > 1, `esperas identicas: ${durations.join(",")}`);
  });
});
