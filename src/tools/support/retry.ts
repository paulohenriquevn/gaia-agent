import { Retry } from "@theokit/sdk/retry";

/**
 * Repetição com backoff.
 *
 * Delega ao `Retry` do SDK em vez de reimplementar: a versão caseira daqui usava
 * `baseMs * 2 ** tentativa` sem jitter nem teto, então três workers que tomavam o mesmo
 * 403 voltavam a bater no endpoint exatamente no mesmo instante, em sincronia — o que a
 * revisão apontou como mecanismo do bloqueio de busca observado. O SDK aplica jitter
 * completo e limita cada espera.
 */

export interface RetryPolicy {
  /** Tentativas APÓS a primeira. */
  attempts: number;
  baseDelayMs: number;
  isRetryable: (error: unknown) => boolean;
}

/**
 * Repete `operation` enquanto `isRetryable` disser que vale, com backoff e jitter.
 * Erro não-retentável sobe na primeira tentativa: insistir numa falha permanente só
 * gasta tempo e esconde a causa.
 */
export function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts: number; baseDelayMs: number; isRetryable: (error: unknown) => boolean },
): Promise<T> {
  return Retry.create(operation, {
    // `attempts` aqui sempre significou o total de tentativas; o SDK conta as repetições
    // depois da primeira.
    retries: Math.max(0, options.attempts - 1),
    initialDelayMs: options.baseDelayMs,
    isRetryable: options.isRetryable,
  });
}
