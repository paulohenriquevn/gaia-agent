/**
 * Verificação de disponibilidade das fontes externas, feita uma vez por rodada.
 *
 * Uma ferramenta quebrada é pior que uma ferramenta ausente: o agente a chama,
 * recebe falha, tenta de novo e queima o orçamento de iterações sem sair do lugar.
 * Registrar só o que responde deixa o agente ir direto para o que funciona.
 */

export interface SourceHealth {
  webSearch: boolean;
  wikipedia: boolean;
}

/** Executa uma sonda tratando qualquer falha como indisponibilidade. */
async function probe(check: () => Promise<unknown>): Promise<boolean> {
  try {
    await check();
    return true;
  } catch {
    return false;
  }
}

export async function checkSources(probes: {
  webSearch: () => Promise<unknown>;
  wikipedia: () => Promise<unknown>;
}): Promise<SourceHealth> {
  const [webSearch, wikipedia] = await Promise.all([
    probe(probes.webSearch),
    probe(probes.wikipedia),
  ]);
  return { webSearch, wikipedia };
}

/** Resumo legível do que está disponível, para o log da rodada. */
export function describeHealth(health: SourceHealth): string {
  const label = (name: string, ok: boolean) => `${name}: ${ok ? "ok" : "indisponível"}`;
  return [label("busca web", health.webSearch), label("wikipedia", health.wikipedia)].join(" | ");
}

/**
 * Instrução adicional para o agente quando uma fonte está fora.
 * Sem isso o modelo tenta a fonte ausente pelo hábito do enunciado.
 */
export function healthGuidance(health: SourceHealth): string {
  if (health.webSearch) return "";
  return (
    "\n\nIMPORTANT: general web search is unavailable in this environment. " +
    "Use wikipedia_search and wikipedia_page as your research tools, and fetch_page " +
    "when you already know the exact URL. Do not attempt web_search."
  );
}
