import type { GaiaQuestion } from "./scoring-api.ts";
import { FatalRunError } from "./lib/agent-errors.ts";

/**
 * A política de tentativas, isolada de como cada tentativa é executada.
 *
 * Antes esta regra vivia colada à criação do agente do SDK, e por isso não tinha teste:
 * não havia como substituir `Agent.create` para exercitar a cadeia. Aqui ela depende só
 * de duas funções — pesquisar e perguntar sem ferramentas — o que a torna verificável
 * sem rede, sem modelo e sem credencial.
 */

export interface QuestionAnswer {
  answer: string;
  rawOutput: string;
  durationMs: number;
  /** Modelo que efetivamente produziu a resposta. */
  modelUsed: string;
  /** O run parou no teto de iterações com o modelo ainda querendo usar ferramentas. */
  truncated?: boolean;
}

/** Executa uma tentativa. A implementação real fala com o SDK; os testes substituem. */
export type AttemptFn = (question: GaiaQuestion, modelId: string) => Promise<QuestionAnswer>;

export interface AnswerStrategy {
  /** Tentativa com ferramentas, que produz as respostas verificadas. */
  research: AttemptFn;
  /** Tentativa sem ferramenta alguma, apoiada no conhecimento do modelo. */
  recall: AttemptFn;
  modelId: string;
  fallbackModelId: string;
}

/** Resposta vazia com o motivo registrado, para o chamador decidir o próximo passo. */
function emptyWith(modelId: string, prefix: string, error: unknown): QuestionAnswer {
  return {
    answer: "",
    rawOutput: `[${prefix}] ${error instanceof Error ? error.message : String(error)}`,
    durationMs: 0,
    modelUsed: modelId,
  };
}

/**
 * Converte falha em resposta vazia, para o chamador seguir com a próxima tentativa.
 * Falha fatal da conta é a exceção: sobe e derruba a rodada, porque nenhuma tentativa
 * seguinte teria como dar certo com a mesma credencial.
 */
async function guarded(
  run: () => Promise<QuestionAnswer>,
  modelId: string,
  prefix: string,
): Promise<QuestionAnswer> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FatalRunError) throw error;
    return emptyWith(modelId, prefix, error);
  }
}

/**
 * Encadeia as tentativas até obter uma resposta.
 *
 * A ordem não é arbitrária: pesquisa primeiro porque é o que produz resposta verificada;
 * cai para o conhecimento do próprio modelo porque alguns nunca concluem enquanto têm
 * ferramentas disponíveis, mas respondem de primeira quando não há nenhuma; e só então
 * troca de modelo. Uma questão sem resposta vale zero, então desistir cedo é o pior
 * desfecho possível.
 */
export async function answerWithStrategy(
  question: GaiaQuestion,
  strategy: AnswerStrategy,
): Promise<QuestionAnswer> {
  const researched = await guarded(
    () => strategy.research(question, strategy.modelId),
    strategy.modelId,
    `falha com ${strategy.modelId}`,
  );
  if (researched.answer) return researched;

  const recalled = await guarded(
    () => strategy.recall(question, strategy.modelId),
    strategy.modelId,
    "conhecimento direto falhou",
  );
  if (recalled.answer) {
    return { ...recalled, durationMs: researched.durationMs + recalled.durationMs };
  }

  const fallback = await guarded(
    () => strategy.research(question, strategy.fallbackModelId),
    strategy.fallbackModelId,
    `falha com ${strategy.fallbackModelId}`,
  );

  const chosen = fallback.answer ? fallback : researched;
  return {
    ...chosen,
    durationMs: researched.durationMs + recalled.durationMs + fallback.durationMs,
  };
}
