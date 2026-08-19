import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FatalRunError, RunFailedError, classifyRunFailure, isFatalProviderError } from "../src/lib/agent-errors.ts";

describe("isFatalProviderError", () => {
  it("reconhece a mensagem real de credito esgotado do openrouter", () => {
    assert.equal(isFatalProviderError("openrouter API error: quota_exceeded (HTTP 402)"), true);
  });
  it("reconhece chave invalida", () => {
    assert.equal(isFatalProviderError("401 Unauthorized: invalid api key"), true);
  });
  it("nao trata timeout como fatal", () => {
    assert.equal(isFatalProviderError("request timed out after 60s"), false);
  });
  it("nao trata filtro de conteudo como fatal", () => {
    assert.equal(isFatalProviderError("finish_reason: content_filter"), false);
  });
  it("nao trata rate limit como fatal, porque ele passa", () => {
    assert.equal(isFatalProviderError("429 too many requests"), false);
  });
});

describe("classifyRunFailure", () => {
  it("classifica credito esgotado como fatal", () => {
    assert.ok(classifyRunFailure("t1", "quota_exceeded (HTTP 402)") instanceof FatalRunError);
  });
  it("classifica falha comum como erro do run e preserva o task id", () => {
    const e = classifyRunFailure("t1", "sem detalhe");
    assert.ok(e instanceof RunFailedError);
    assert.match(e.message, /t1/);
  });
});
