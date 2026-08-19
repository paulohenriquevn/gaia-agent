import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { backoffDelay, withRetry } from "../src/lib/retry.ts";

describe("backoffDelay", () => {
  it("dobra a cada tentativa", () => {
    assert.equal(backoffDelay(0, 100), 100);
    assert.equal(backoffDelay(1, 100), 200);
    assert.equal(backoffDelay(2, 100), 400);
  });
});

describe("withRetry", () => {
  const always = () => true;

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
});
