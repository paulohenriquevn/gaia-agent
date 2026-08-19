/**
 * Espaçamento mínimo entre chamadas a um mesmo serviço externo.
 *
 * O agente responde várias questões em paralelo, e cada uma pesquisa por conta própria.
 * Sem coordenação, os workers disparam rajadas simultâneas contra o mesmo host — foi
 * assim que o provedor de busca passou a recusar as conexões no meio de uma rodada.
 * Backoff sozinho não resolve: ele reage depois do bloqueio, e o que evita o bloqueio é
 * não emitir a rajada.
 *
 * A serialização é por serviço, não global: a Wikipedia não deve esperar a vez porque a
 * busca web está lenta.
 */
export class RateLimiter {
  private readonly minIntervalMs: number;
  /** Encadeia as chamadas: cada uma espera a anterior liberar a vez. */
  private queue: Promise<void> = Promise.resolve();
  private lastStartedAt = 0;

  constructor(minIntervalMs: number) {
    if (!Number.isFinite(minIntervalMs) || minIntervalMs < 0) {
      throw new Error(`Intervalo mínimo inválido: ${minIntervalMs}`);
    }
    this.minIntervalMs = minIntervalMs;
  }

  /** Executa `operation` respeitando o espaçamento desde a chamada anterior. */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    const myTurn = this.queue.then(() => this.waitForSlot());
    // A fila avança mesmo se a operação falhar — uma falha não pode travar as seguintes.
    this.queue = myTurn.catch(() => undefined);
    await myTurn;
    return operation();
  }

  private async waitForSlot(): Promise<void> {
    const elapsed = Date.now() - this.lastStartedAt;
    const remaining = this.minIntervalMs - elapsed;
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    this.lastStartedAt = Date.now();
  }
}

/**
 * Limitador compartilhado da busca.
 *
 * É module-level de propósito: o espaçamento só funciona se todas as questões passarem
 * pelo MESMO limitador — uma instância por questão não coordenaria nada. O intervalo é
 * configurado uma vez, na inicialização, em vez de lido do ambiente aqui dentro.
 */
let searchLimiterInstance = new RateLimiter(1100);

export function configureSearchLimiter(minIntervalMs: number): void {
  searchLimiterInstance = new RateLimiter(minIntervalMs);
}

export const searchLimiter = {
  run<T>(operation: () => Promise<T>): Promise<T> {
    return searchLimiterInstance.run(operation);
  },
};
