/** Espera `ms` milissegundos. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calcula o atraso da tentativa `attempt` (base 0) com backoff exponencial. */
export function backoffDelay(attempt: number, baseMs: number): number {
  return baseMs * 2 ** attempt;
}

/**
 * Repete `operation` com backoff exponencial enquanto `isRetryable` disser que vale.
 * Erros não-retentáveis sobem na primeira tentativa — retentar uma falha permanente
 * só gasta tempo e mascara a causa.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts: number; baseDelayMs: number; isRetryable: (error: unknown) => boolean },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < options.attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!options.isRetryable(error) || attempt === options.attempts - 1) throw error;
      await delay(backoffDelay(attempt, options.baseDelayMs));
    }
  }

  throw lastError;
}
