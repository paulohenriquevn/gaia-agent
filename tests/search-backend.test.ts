import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSearchBackend } from "../src/tools/search-backend.ts";

describe("resolveSearchBackend", () => {
  it("usa o Brave quando a chave esta presente", () => {
    const b = resolveSearchBackend({ BRAVE_API_KEY: "chave-de-teste" } as NodeJS.ProcessEnv);
    assert.equal(b.provider, "brave");
  });

  it("cai para o duckduckgo sem chave", () => {
    assert.equal(resolveSearchBackend({} as NodeJS.ProcessEnv).provider, "duckduckgo");
  });

  it("trata chave em branco como ausente", () => {
    assert.equal(resolveSearchBackend({ BRAVE_API_KEY: "   " } as NodeJS.ProcessEnv).provider, "duckduckgo");
  });

  it("sempre devolve um callback de busca chamavel", () => {
    assert.equal(typeof resolveSearchBackend({} as NodeJS.ProcessEnv).search, "function");
  });
});
