/**
 * Contrato de falha das ferramentas do agente.
 *
 * Uma ferramenta que lança exceção derruba o run inteiro: o runtime aborta depois de
 * poucas falhas seguidas e a questão termina sem nenhuma resposta. Foi assim que
 * buscas bloqueadas por volume e anexos com 404 custaram questões inteiras.
 *
 * Isto não é engolir erro. A falha continua explícita — só é entregue a quem pode
 * tratá-la, que aqui é o próprio agente: ele lê o motivo, escolhe outra ferramenta e
 * segue. É o mesmo contrato das ferramentas de `@getloopscale/loopzero-sdk-tools`, que devolvem
 * `{ ok: false, error }` em vez de lançar.
 */

/** Descreve a falha para o agente, com uma saída concreta a tentar em seguida. */
export function describeToolFailure(toolName: string, error: unknown, hint: string): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `FERRAMENTA ${toolName} FALHOU: ${reason}\n\nO que fazer: ${hint}`;
}

/**
 * Envolve um handler para que nenhuma falha escape como exceção.
 * `hint` deve nomear uma alternativa real — "tente outra coisa" não ajuda o agente a
 * escolher, e ele acaba repetindo a mesma chamada até o run ser abortado.
 */
export function resilient<TInput>(
  toolName: string,
  hint: string,
  handler: (input: TInput) => Promise<string> | string,
): (input: TInput) => Promise<string> {
  return async (input: TInput) => {
    try {
      const output = await handler(input);
      return output.trim() === "" ? `${toolName} não retornou conteúdo.` : output;
    } catch (error) {
      return describeToolFailure(toolName, error, hint);
    }
  };
}
