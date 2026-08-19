import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { grade, isCorrect, normalizeForGrading, parseGroundTruthJsonl } from "../src/lib/grading.ts";

describe("normalizeForGrading", () => {
  it("ignora caixa e ponto final", () => {
    assert.equal(normalizeForGrading("Saint Petersburg."), "saint petersburg");
  });
  it("padroniza espacamento de lista", () => {
    assert.equal(normalizeForGrading("b ,e"), "b, e");
  });
});

describe("isCorrect", () => {
  it("aceita diferenca apenas de caixa", () => {
    assert.equal(isCorrect("right", "Right"), true);
  });
  it("rejeita resposta vazia mesmo com gabarito vazio", () => {
    assert.equal(isCorrect("", ""), false);
  });
  it("rejeita resposta que apenas contem o valor", () => {
    assert.equal(isCorrect("The answer is Wojciech", "Wojciech"), false);
  });
  it("aceita lista com espacamento diferente", () => {
    assert.equal(isCorrect("b,e", "b, e"), true);
  });
});

describe("grade", () => {
  const truth = new Map([["t1", "3"], ["t2", "right"], ["t3", "Rd5"]]);

  it("conta acertos e calcula o percentual", () => {
    const r = grade(new Map([["t1", "3"], ["t2", "wrong"], ["t3", ""]]), truth);
    assert.equal(r.correct, 1);
    assert.equal(r.total, 3);
    assert.equal(r.scorePercent, 33);
  });

  it("marca resposta vazia como empty e nao como erro de conteudo", () => {
    const r = grade(new Map([["t3", ""]]), truth);
    assert.equal(r.items[0].empty, true);
    assert.equal(r.items[0].correct, false);
  });

  it("ignora questao sem gabarito conhecido em vez de contar como erro", () => {
    const r = grade(new Map([["t1", "3"], ["desconhecida", "x"]]), truth);
    assert.equal(r.total, 1);
    assert.equal(r.correct, 1);
  });

  it("devolve 0% sem estourar quando nao ha nada a corrigir", () => {
    const r = grade(new Map(), truth);
    assert.equal(r.scorePercent, 0);
    assert.equal(r.total, 0);
  });
});

describe("parseGroundTruthJsonl", () => {
  it("le o formato do dataset GAIA", () => {
    const m = parseGroundTruthJsonl('{"task_id":"a","Final answer":"3"}\n{"task_id":"b","Final answer":"right"}');
    assert.equal(m.get("a"), "3");
    assert.equal(m.get("b"), "right");
  });
  it("ignora linhas em branco", () => {
    const m = parseGroundTruthJsonl('\n{"task_id":"a","Final answer":"3"}\n\n');
    assert.equal(m.size, 1);
  });
  it("falha alto em JSON invalido apontando a linha", () => {
    assert.throws(() => parseGroundTruthJsonl("{nao json}"), /Linha 1/);
  });
  it("falha alto quando nenhuma entrada e utilizavel", () => {
    assert.throws(() => parseGroundTruthJsonl('{"outra":"coisa"}'), /nenhuma entrada/);
  });
});
