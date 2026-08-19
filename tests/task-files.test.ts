import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createReadTaskFileTool, decodeTaskFile, extensionOf, workbookToCsv } from "../src/tools/task-files.ts";
import type { TaskFileSource } from "../src/scoring-api.ts";
import * as XLSX from "xlsx";

/**
 * Dublê estrutural — possível somente depois que as ferramentas passaram a depender da
 * interface mínima. Com a classe concreta, isto não compilava.
 */
function sourceReturning(bytes: Uint8Array): TaskFileSource {
  return { fetchTaskFile: async () => ({ bytes, contentType: "application/octet-stream" }) };
}

function sourceFailing(message: string): TaskFileSource {
  return { fetchTaskFile: async () => { throw new Error(message); } };
}

const index = new Map([["t1", "script.py"], ["t2", "planilha.xlsx"], ["t3", "imagem.png"]]);

/** O handler pode devolver texto ou blocos; os testes verificam o texto. */
async function textOf(result: unknown): Promise<string> {
  const value = await result;
  return typeof value === "string" ? value : JSON.stringify(value);
}

describe("read_task_file", () => {
  it("decodifica anexo de texto", async () => {
    const tool = createReadTaskFileTool(sourceReturning(new TextEncoder().encode("print(1)")), index);
    assert.equal(await textOf(tool.handler({ task_id: "t1" })), "print(1)");
  });

  it("informa a falha ao agente em vez de lancar e derrubar o run", async () => {
    const tool = createReadTaskFileTool(sourceFailing("respondeu 404"), index);
    const out = await textOf(tool.handler({ task_id: "t1" }));
    assert.match(out, /FERRAMENTA read_task_file FALHOU/);
    assert.match(out, /404/);
    assert.match(out, /wikipedia_search|web_search/, "precisa sugerir uma alternativa concreta");
  });

  it("explica quando a questao nao tem anexo", async () => {
    const tool = createReadTaskFileTool(sourceReturning(new Uint8Array()), index);
    assert.match(await textOf(tool.handler({ task_id: "desconhecida" })), /não tem arquivo anexado/);
  });

  it("recusa imagem apontando a ferramenta correta", async () => {
    const tool = createReadTaskFileTool(sourceReturning(new Uint8Array([1, 2, 3])), index);
    assert.match(await textOf(tool.handler({ task_id: "t3" })), /describe_image/);
  });
});

describe("decodificacao de anexo", () => {
  it("extensionOf devolve vazio para nome sem extensao", () => {
    assert.equal(extensionOf("README"), "");
  });

  it("recusa audio apontando transcribe_audio", () => {
    assert.throws(() => decodeTaskFile("clip.mp3", new Uint8Array([1])), /transcribe_audio/);
  });

  it("converte planilha em CSV com o nome da aba", () => {
    // Planilha mínima construída em memória, sem arquivo externo.
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["item", "valor"], ["cafe", 3]]), "Vendas");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const csv = workbookToCsv(bytes);
    assert.match(csv, /=== planilha: Vendas ===/);
    assert.match(csv, /item,valor/);
    assert.match(csv, /cafe,3/);
  });
});
