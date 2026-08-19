import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeToolFailure, resilient } from "../src/lib/resilient-tool.ts";

describe("resilient", () => {
  it("devolve a saida do handler quando tudo da certo", async () => {
    const h = resilient("t", "dica", async () => "conteudo");
    assert.equal(await h({}), "conteudo");
  });

  it("nunca lanca: converte excecao em texto para o agente ler", async () => {
    const h = resilient("web_search", "use wikipedia_search", async () => {
      throw new Error("fetch failed");
    });
    const out = await h({});
    assert.match(out, /FERRAMENTA web_search FALHOU/);
    assert.match(out, /fetch failed/);
    assert.match(out, /use wikipedia_search/);
  });

  it("converte tambem erro sincrono", async () => {
    const h = resilient("t", "dica", () => { throw new Error("boom"); });
    assert.match(await h({}), /boom/);
  });

  it("sinaliza saida vazia em vez de devolver string vazia", async () => {
    const h = resilient("t", "dica", async () => "   ");
    assert.match(await h({}), /não retornou conteúdo/);
  });

  it("preserva valores nao-Error lancados", async () => {
    const h = resilient("t", "dica", async () => { throw "texto cru"; });
    assert.match(await h({}), /texto cru/);
  });
});

describe("describeToolFailure", () => {
  it("inclui nome, motivo e a alternativa concreta", () => {
    const out = describeToolFailure("read_task_file", new Error("404"), "use web_search");
    assert.match(out, /read_task_file/);
    assert.match(out, /404/);
    assert.match(out, /use web_search/);
  });
});
