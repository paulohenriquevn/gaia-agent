import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, truncate, collapseBlankLines } from "../src/tools/support/html-text.ts";
import { extractVideoId } from "../src/tools/youtube.ts";
import { formatPythonResult } from "../src/tools/python.ts";
import { extensionOf, decodeTaskFile } from "../src/tools/task-files.ts";
import { parseDuckDuckGoHtml, unwrapDuckDuckGoRedirect } from "../src/tools/web.ts";

describe("htmlToText", () => {
  it("converte tabela em pipe-table preservando as celulas", () => {
    const html = "<table><tr><th>Year</th><th>Title</th></tr><tr><td>1999</td><td>Example Record</td></tr></table>";
    const text = htmlToText(html);
    assert.match(text, /\| Year \| Title \|/);
    assert.match(text, /\| 1999 \| Example Record \|/);
  });

  it("descarta script e style", () => {
    const text = htmlToText("<body><script>var x=1</script><style>p{color:red}</style><p>visivel</p></body>");
    assert.equal(text, "visivel");
    assert.doesNotMatch(text, /var x/);
  });

  it("colapsa multiplas linhas em branco", () => {
    assert.equal(collapseBlankLines("a\n\n\n\n\nb"), "a\n\nb");
  });
});

describe("truncate", () => {
  it("mantem texto abaixo do limite intacto", () => {
    assert.equal(truncate("abc", 10), "abc");
  });

  it("sinaliza o corte em vez de truncar em silencio", () => {
    const result = truncate("a".repeat(100), 10);
    assert.match(result, /truncado/);
    assert.match(result, /90 caracteres omitidos/);
  });
});

describe("extractVideoId", () => {
  it("extrai de URL watch", () => {
    assert.equal(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("extrai de youtu.be", () => {
    assert.equal(extractVideoId("https://youtu.be/aBcDeFgHiJk"), "aBcDeFgHiJk");
  });

  it("aceita o id cru", () => {
    assert.equal(extractVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("falha alto para entrada sem id", () => {
    assert.throws(() => extractVideoId("https://example.com/video"), /Não consegui extrair/);
  });
});

describe("formatPythonResult", () => {
  it("mostra stdout em execucao bem sucedida", () => {
    const out = formatPythonResult({ exitCode: 0, stdout: "42\n", stderr: "", timedOut: false });
    assert.match(out, /stdout:\n42/);
  });

  it("nunca esconde stderr", () => {
    const out = formatPythonResult({ exitCode: 1, stdout: "", stderr: "NameError: x", timedOut: false });
    assert.match(out, /NameError/);
    assert.match(out, /exit code: 1/);
  });

  it("sinaliza timeout explicitamente", () => {
    const out = formatPythonResult({ exitCode: null, stdout: "", stderr: "", timedOut: true });
    assert.match(out, /TIMEOUT/);
  });

  it("reporta ausencia de saida em vez de string vazia", () => {
    const out = formatPythonResult({ exitCode: 0, stdout: "", stderr: "", timedOut: false });
    assert.match(out, /sem nenhuma saída/);
  });
});

describe("decodeTaskFile", () => {
  it("decodifica arquivo de texto", () => {
    const bytes = new TextEncoder().encode("print(1)");
    assert.equal(decodeTaskFile("script.py", bytes), "print(1)");
  });

  it("recusa imagem apontando a ferramenta correta", () => {
    assert.throws(
      () => decodeTaskFile("board.png", new Uint8Array([1, 2, 3])),
      /describe_image/,
    );
  });

  it("recusa audio apontando a ferramenta correta", () => {
    assert.throws(
      () => decodeTaskFile("clip.mp3", new Uint8Array([1, 2, 3])),
      /transcribe_audio/,
    );
  });

  it("extensionOf devolve vazio para nome sem extensao", () => {
    assert.equal(extensionOf("README"), "");
  });
});

describe("unwrapDuckDuckGoRedirect", () => {
  it("desembrulha o redirect uddg", () => {
    const href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FExample_Page&rut=x";
    assert.equal(unwrapDuckDuckGoRedirect(href), "https://en.wikipedia.org/wiki/Example_Page");
  });

  it("devolve null para href vazio", () => {
    assert.equal(unwrapDuckDuckGoRedirect(""), null);
  });

  it("preserva URL absoluta ja direta", () => {
    assert.equal(unwrapDuckDuckGoRedirect("https://example.com/x"), "https://example.com/x");
  });
});

describe("parseDuckDuckGoHtml", () => {
  it("respeita o limite de resultados", () => {
    const block = (n: number) =>
      `<div class="result__body"><a class="result__a" href="https://e.com/${n}">T${n}</a><div class="result__snippet">S${n}</div></div>`;
    const html = `<html><body>${[1, 2, 3, 4].map(block).join("")}</body></html>`;
    const hits = parseDuckDuckGoHtml(html, 2);
    assert.equal(hits.length, 2);
    assert.equal(hits[0].title, "T1");
    assert.equal(hits[0].url, "https://e.com/1");
    assert.equal(hits[0].snippet, "S1");
  });
});
