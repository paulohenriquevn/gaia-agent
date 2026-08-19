/**
 * Classificação das falhas de run.
 *
 * A distinção que importa: uma falha de conta (crédito acabou, chave inválida) não
 * melhora se tentarmos de novo — nem com outro modelo, porque a conta é a mesma.
 * Insistir nela gasta tempo e esconde a causa, que foi exatamente o que aconteceu
 * quando o crédito do OpenRouter zerou no meio de uma rodada e 11 questões viraram
 * "sem detalhe".
 */

/** Falha que condena a rodada inteira. Abortar é a única resposta correta. */
export class FatalRunError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(`Falha irrecuperável da conta do provider: ${detail}`);
    this.name = "FatalRunError";
    this.detail = detail;
  }
}

/** Falha de um run específico. Outra questão, ou outro modelo, ainda pode dar certo. */
export class RunFailedError extends Error {
  readonly detail: string;

  constructor(taskId: string, detail: string) {
    super(`Run falhou para ${taskId}: ${detail}`);
    this.name = "RunFailedError";
    this.detail = detail;
  }
}

const FATAL_PATTERNS = [
  /quota[_\s]?exceeded/i,
  /insufficient[_\s]?(credits?|balance|quota)/i,
  /\b402\b/,
  /payment[_\s]?required/i,
  /\b401\b/,
  /invalid[_\s]?api[_\s]?key/i,
  /unauthorized/i,
];

/**
 * Decide se a mensagem de erro do provider condena a rodada inteira.
 * Na dúvida responde `false`: abortar por engano custa as questões que ainda dariam certo.
 */
export function isFatalProviderError(message: string): boolean {
  return FATAL_PATTERNS.some((pattern) => pattern.test(message));
}

/** Converte a falha de um run na exceção da categoria certa. */
export function classifyRunFailure(taskId: string, detail: string): Error {
  return isFatalProviderError(detail) ? new FatalRunError(detail) : new RunFailedError(taskId, detail);
}
