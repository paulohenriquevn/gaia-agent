import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { answerWithStrategy, type AnswerStrategy, type QuestionAnswer } from "../src/answer-strategy.ts";
import { FatalRunError } from "../src/lib/agent-errors.ts";
import type { GaiaQuestion } from "../src/scoring-api.ts";

const QUESTION: GaiaQuestion = { task_id: "t1", question: "Quanto é 2+2?", Level: "1", file_name: "" };

function reply(answer: string, modelUsed = "primario", durationMs = 10): QuestionAnswer {
  return { answer, rawOutput: `FINAL ANSWER: ${answer}`, durationMs, modelUsed };
}

function strategyOf(overrides: Partial<AnswerStrategy>): AnswerStrategy {
  return {
    research: async () => reply(""),
    recall: async () => reply(""),
    modelId: "primario",
    fallbackModelId: "reserva",
    ...overrides,
  };
}

describe("politica de tentativas", () => {
  it("devolve a pesquisa quando ela responde, sem gastar as outras tentativas", async () => {
    const chamadas: string[] = [];
    const result = await answerWithStrategy(QUESTION, strategyOf({
      research: async () => { chamadas.push("research"); return reply("4"); },
      recall: async () => { chamadas.push("recall"); return reply("errado"); },
    }));
    assert.equal(result.answer, "4");
    assert.deepEqual(chamadas, ["research"]);
  });

  it("recorre ao conhecimento do modelo quando a pesquisa volta vazia", async () => {
    const result = await answerWithStrategy(QUESTION, strategyOf({
      research: async (_q, modelId) => reply("", modelId),
      recall: async () => reply("4", "primario (sem ferramentas)"),
    }));
    assert.equal(result.answer, "4");
    assert.equal(result.modelUsed, "primario (sem ferramentas)");
  });

  it("troca de modelo apenas quando as duas primeiras falham", async () => {
    const modelos: string[] = [];
    const result = await answerWithStrategy(QUESTION, strategyOf({
      research: async (_q, modelId) => { modelos.push(modelId); return reply(modelId === "reserva" ? "4" : "", modelId); },
    }));
    assert.equal(result.answer, "4");
    assert.deepEqual(modelos, ["primario", "reserva"]);
  });

});

describe("politica de tentativas — contabilidade e falhas", () => {
  it("soma a duracao de todas as tentativas gastas", async () => {
    const result = await answerWithStrategy(QUESTION, strategyOf({
      research: async (_q, modelId) => reply(modelId === "reserva" ? "4" : "", modelId, 100),
      recall: async () => reply("", "primario", 50),
    }));
    assert.equal(result.durationMs, 250);
  });

  it("uma tentativa que lanca nao derruba as seguintes", async () => {
    const result = await answerWithStrategy(QUESTION, strategyOf({
      research: async (_q, modelId) => {
        if (modelId === "primario") throw new Error("provider instavel");
        return reply("4", modelId);
      },
    }));
    assert.equal(result.answer, "4");
  });

  it("registra o motivo da falha no rawOutput quando ninguem responde", async () => {
    const result = await answerWithStrategy(QUESTION, strategyOf({
      research: async () => { throw new Error("timeout de rede"); },
    }));
    assert.equal(result.answer, "");
    assert.match(result.rawOutput, /timeout de rede/);
  });

  it("falha fatal da conta interrompe a cadeia em vez de gastar as demais tentativas", async () => {
    const chamadas: string[] = [];
    await assert.rejects(
      answerWithStrategy(QUESTION, strategyOf({
        research: async () => { chamadas.push("research"); throw new FatalRunError("quota_exceeded (HTTP 402)"); },
        recall: async () => { chamadas.push("recall"); return reply("4"); },
      })),
      FatalRunError,
    );
    assert.deepEqual(chamadas, ["research"], "nenhuma tentativa depois da fatal");
  });

  it("prefere a resposta da pesquisa quando o fallback tambem volta vazio", async () => {
    const result = await answerWithStrategy(QUESTION, strategyOf({
      research: async (_q, modelId) => ({ ...reply("", modelId), rawOutput: `parcial de ${modelId}` }),
    }));
    assert.equal(result.answer, "");
    assert.equal(result.rawOutput, "parcial de primario");
  });
});
