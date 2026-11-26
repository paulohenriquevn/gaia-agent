import { createBraveWebSearchAdapter, type WebSearchCallback } from "@getloopscale/loopzero-sdk-tools";
import { searchWeb } from "./web.ts";
import { searchLimiter } from "../lib/rate-limiter.ts";

/**
 * Escolha do backend de busca.
 *
 * A ferramenta `web_search` é agnóstica de provedor: recebe o backend por injeção.
 * Aqui fica a única decisão de qual usar, para que trocar de provedor não toque em
 * mais nada.
 *
 * O DuckDuckGo é o padrão porque não exige credencial, mas depende de o domínio
 * estar acessível — em redes que o bloqueiam por DNS ele falha em toda chamada.
 * Com `BRAVE_API_KEY` no ambiente, a busca passa pela API do Brave.
 */

export interface SearchBackend {
  search: WebSearchCallback;
  /** Nome do provedor, para o log da rodada. */
  provider: string;
}

export function resolveSearchBackend(env: NodeJS.ProcessEnv = process.env): SearchBackend {
  const braveApiKey = env.BRAVE_API_KEY?.trim();

  if (braveApiKey) {
    // O adapter valida a chave na criação e lança ConfigurationError sem ela —
    // por isso só é construído quando a chave existe de fato.
    const brave = createBraveWebSearchAdapter({ apiKey: braveApiKey });
    return {
      // O plano gratuito do Brave permite 1 consulta por segundo; o limitador garante
      // isso mesmo com várias questões pesquisando em paralelo.
      search: (query, maxResults) => searchLimiter.run(() => brave(query, maxResults)),
      provider: "brave",
    };
  }

  return {
    search: (query, maxResults) => searchLimiter.run(() => searchWeb(query, maxResults)),
    provider: "duckduckgo",
  };
}
