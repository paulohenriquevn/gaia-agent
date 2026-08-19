import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractFinalAnswer, normalizeAnswer } from "../src/lib/answer.ts";

describe("extractFinalAnswer", () => {
  it("extrai o valor que segue o marcador FINAL ANSWER", () => {
    const raw = "Checked the discography table.\n\nFINAL ANSWER: 3";
    assert.equal(extractFinalAnswer(raw), "3");
  });

  it("aceita o marcador sem dois-pontos e com caixa diferente", () => {
    assert.equal(extractFinalAnswer("blah\nfinal answer  Saint Petersburg"), "Saint Petersburg");
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
    assert.equal(normalizeAnswer("**Rd5**"), "Rd5");
  });

  it("remove ponto final", () => {
    assert.equal(normalizeAnswer("Saint Petersburg."), "Saint Petersburg");
  });

  it("remove aspas envolventes retas e tipograficas", () => {
    assert.equal(normalizeAnswer('"Extremely"'), "Extremely");
    assert.equal(normalizeAnswer("“Extremely”"), "Extremely");
  });

  it("preserva apostrofo interno", () => {
    assert.equal(normalizeAnswer("Teal'c"), "Teal'c");
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
