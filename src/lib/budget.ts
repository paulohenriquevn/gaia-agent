import { Budget } from "@getloopscale/loopzero-sdk";

/**
 * Teto de gasto da rodada.
 *
 * Uma rodada completa são 20 questões, cada uma com até 30 chamadas ao modelo e duas
 * tentativas extras quando a primeira volta vazia. É fácil gastar mais do que se
 * pretendia sem perceber — e foi o que aconteceu: o crédito acabou no meio de uma
 * execução, 11 questões falharam em cascata e a causa ficou escondida atrás de mensagens
 * genéricas por horas.
 *
 * O modo `block` recusa a chamada ANTES de emiti-la ao provider, então o limite é um
 * teto de verdade, não um aviso depois do fato.
 */

export interface BudgetOptions {
  /** Teto em dólares para a janela de uma hora. Zero ou ausente desliga a proteção. */
  limitUsd: number;
  /** `block` recusa ao atingir o teto; `warn` apenas avisa. */
  mode: "block" | "warn" | "audit";
}

export type BudgetHandle = ReturnType<typeof Budget.create>;

/**
 * Cria o controle de gasto, ou devolve `undefined` quando não há teto configurado.
 * Sem teto o comportamento é o de antes — nada é bloqueado — mas isso passa a ser uma
 * escolha explícita em vez de um descuido.
 */
export function createRunBudget(options: BudgetOptions): BudgetHandle | undefined {
  if (!Number.isFinite(options.limitUsd) || options.limitUsd <= 0) return undefined;

  return Budget.create({
    name: "hf-agents-course-unit4-final",
    scope: "process",
    mode: options.mode,
    limits: [
      { window: "1h", limitUsd: options.limitUsd },
      // Teto diário mais folgado: protege contra várias rodadas seguidas no mesmo dia,
      // que foi exatamente o padrão que esgotou o crédito.
      { window: "1d", limitUsd: options.limitUsd * 4 },
    ],
    onThreshold: (event) => {
      console.warn(
        `[orçamento] ${Math.round(event.threshold * 100)}% do limite de ${event.window} atingido`,
      );
    },
    onExceed: (event) => {
      console.error(
        `[orçamento] limite de ${event.window} excedido — chamadas ao modelo serão recusadas`,
      );
    },
  });
}
