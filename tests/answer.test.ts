import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractFinalAnswer, normalizeAnswer } from "../src/lib/answer.ts";

describe("extractFinalAnswer", () => {
  it("extrai o valor que segue o marcador FINAL ANSWER", () => {
    const raw = "Checked the reference table.\n\nFINAL ANSWER: 12";
    assert.equal(extractFinalAnswer(raw), "12");
  });

  it("aceita o marcador sem dois-pontos e com caixa diferente", () => {
    assert.equal(extractFinalAnswer("blah\nfinal answer  Buenos Aires"), "Buenos Aires");
  });

  it("usa a ultima linha nao vazia quando o marcador esta ausente", () => {
    assert.equal(extractFinalAnswer("Reasoning here.\n\nright\n\n"), "right");
  });

  it("devolve string vazia para saida vazia", () => {
    assert.equal(extractFinalAnswer("   \n  \n"), "");
  });

  it("ignora texto posterior ao valor na mesma resposta", () => {
    const raw = "FINAL ANSWER: 519\nThat concludes the analysis.";
    assert.equal(extractFinalAnswer(raw), "519");
  });
});

describe("normalizeAnswer", () => {
  it("remove enfase markdown", () => {
    assert.equal(normalizeAnswer("**Nf6**"), "Nf6");
  });

  it("remove ponto final", () => {
    assert.equal(normalizeAnswer("Buenos Aires."), "Buenos Aires");
  });

  it("remove aspas envolventes retas e tipograficas", () => {
    assert.equal(normalizeAnswer('"Absolutely"'), "Absolutely");
    assert.equal(normalizeAnswer("“Absolutely”"), "Absolutely");
  });

  it("preserva apostrofo interno", () => {
    assert.equal(normalizeAnswer("O'Brien"), "O'Brien");
  });

  it("padroniza espacamento em listas separadas por virgula", () => {
    assert.equal(normalizeAnswer("b,e"), "b, e");
    assert.equal(normalizeAnswer("a ,  b ,c"), "a, b, c");
  });

  it("remove crases de codigo", () => {
    assert.equal(normalizeAnswer("`0`"), "0");
  });

  it("nao altera um numero ja limpo", () => {
    assert.equal(normalizeAnswer("3"), "3");
  });
});

describe("extractWorkingAnswer", () => {
  it("recupera o rascunho escrito antes da pesquisa", async () => {
    const { extractWorkingAnswer } = await import("../src/lib/answer.ts");
    assert.equal(extractWorkingAnswer("WORKING ANSWER: Buenos Aires\nagora vou pesquisar"), "Buenos Aires");
  });

  it("trata 'unknown' como ausencia de resposta", async () => {
    const { extractWorkingAnswer } = await import("../src/lib/answer.ts");
    assert.equal(extractWorkingAnswer("WORKING ANSWER: unknown"), "");
  });

  it("devolve vazio quando nao ha rascunho", async () => {
    const { extractWorkingAnswer } = await import("../src/lib/answer.ts");
    assert.equal(extractWorkingAnswer("apenas texto"), "");
  });
});

describe("extractFinalAnswer com rascunho", () => {
  it("prefere FINAL ANSWER ao rascunho", () => {
    const raw = "WORKING ANSWER: Lisbon\n...\nFINAL ANSWER: Buenos Aires";
    assert.equal(extractFinalAnswer(raw), "Buenos Aires");
  });

  it("cai para o rascunho quando o run foi interrompido antes de concluir", () => {
    const raw = "WORKING ANSWER: Buenos Aires\nsearching wikipedia...\nsearching again...";
    assert.equal(extractFinalAnswer(raw), "Buenos Aires");
  });

  it("ignora rascunho 'unknown' e usa a ultima linha", () => {
    assert.equal(extractFinalAnswer("WORKING ANSWER: unknown\nNf6"), "Nf6");
  });
});

describe("extractFinalAnswer com marcador repetido", () => {
  it("usa o ULTIMO marcador, nao o primeiro", () => {
    const raw = "FINAL ANSWER: 41\n\nWait, recomputing.\n\nFINAL ANSWER: 42";
    assert.equal(extractFinalAnswer(raw), "42");
  });

  it("usa o ultimo rascunho quando o agente revisa antes de concluir", async () => {
    const { extractWorkingAnswer } = await import("../src/lib/answer.ts");
    assert.equal(extractWorkingAnswer("WORKING ANSWER: Lisbon\nWORKING ANSWER: Porto"), "Porto");
  });

  it("marcador final vence rascunho mesmo com ambos repetidos", () => {
    const raw = "WORKING ANSWER: a\nFINAL ANSWER: b\nWORKING ANSWER: c\nFINAL ANSWER: d";
    assert.equal(extractFinalAnswer(raw), "d");
  });
});

describe("normalizacao compartilhada com a correcao", () => {
  it("submissao e medicao tratam a pontuacao final da mesma forma", async () => {
    const { normalizeForGrading } = await import("../src/lib/grading.ts");
    for (const value of ["Nf6!", "Ferdinand?", "3.", "Buenos Aires。"]) {
      assert.equal(
        normalizeAnswer(value).toLowerCase(),
        normalizeForGrading(value),
        `divergencia em ${JSON.stringify(value)} — mede diferente do que submete`,
      );
    }
  });
});
