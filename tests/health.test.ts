import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkSources, describeHealth, healthGuidance } from "../src/lib/health.ts";

describe("checkSources", () => {
  it("marca como disponivel a sonda que resolve", async () => {
    const h = await checkSources({ webSearch: async () => [1], wikipedia: async () => [1] });
    assert.deepEqual(h, { webSearch: true, wikipedia: true });
  });

  it("marca como indisponivel a sonda que lanca, sem propagar o erro", async () => {
    const h = await checkSources({
      webSearch: async () => { throw new Error("fetch failed"); },
      wikipedia: async () => [1],
    });
    assert.deepEqual(h, { webSearch: false, wikipedia: true });
  });
});

describe("healthGuidance", () => {
  it("orienta a usar wikipedia quando a busca web esta fora", () => {
    const g = healthGuidance({ webSearch: false, wikipedia: true });
    assert.match(g, /wikipedia_search/);
    assert.match(g, /Do not attempt web_search/);
  });

  it("nao adiciona instrucao quando tudo funciona", () => {
    assert.equal(healthGuidance({ webSearch: true, wikipedia: true }), "");
  });
});

describe("describeHealth", () => {
  it("resume o estado das duas fontes", () => {
    assert.equal(describeHealth({ webSearch: false, wikipedia: true }),
      "busca web: indisponível | wikipedia: ok");
  });
});
