import { z } from "zod";
import { Tool } from "@theokit/sdk";
import { htmlToText, truncate } from "../lib/html-text.ts";
import { withRetry } from "../lib/retry.ts";
import { request } from "../lib/http.ts";
import { resilient } from "../lib/resilient-tool.ts";

/**
 * Acesso à Wikipedia pela API oficial (`api.php`).
 *
 * Existe separado de `web_search` porque a maioria das questões do GAIA aponta para a
 * Wikipedia, e a API oficial não bloqueia por volume como os buscadores gerais — que
 * respondem 403 assim que o agente faz algumas buscas seguidas.
 */

const API_ENDPOINT = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "GaiaFinalAgent/0.1 (HF Agents Course Unit 4)";

/** Envelope da API da Wikipedia, com apenas os campos que este módulo consome. */
interface WikipediaApiResponse {
  query?: { search?: Array<{ title: string; snippet: string }> };
  parse?: { text?: Record<string, string> };
  error?: { info?: string; code?: string };
}

async function callApi(params: Record<string, string>): Promise<WikipediaApiResponse> {
  const url = new URL(API_ENDPOINT);
  for (const [key, value] of Object.entries({ ...params, format: "json", origin: "*" })) {
    url.searchParams.set(key, value);
  }

  return withRetry(
    async () => {
      const response = await request(url.toString(), {
        headers: { "user-agent": USER_AGENT },
        trustedHost: true,
        timeoutMs: 25_000,
      });
      if (!response.ok) {
        throw new Error(`API da Wikipedia respondeu ${response.status}`);
      }
      return (await response.json()) as WikipediaApiResponse;
    },
    {
      attempts: 3,
      baseDelayMs: 700,
      isRetryable: (error) => error instanceof Error && /respondeu (429|5\d\d)/.test(error.message),
    },
  );
}

export interface WikipediaHit {
  title: string;
  snippet: string;
}

/** Busca artigos por texto completo. */
export async function searchWikipedia(query: string, limit: number): Promise<WikipediaHit[]> {
  const data = await callApi({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: String(limit),
  });

  const results = data.query?.search ?? [];
  return results.map((result) => ({
    title: result.title,
    snippet: stripHtmlTags(result.snippet),
  }));
}

/** Busca o conteúdo renderizado de um artigo, com tabelas preservadas. */
export async function fetchWikipediaPage(title: string): Promise<string> {
  const data = await callApi({ action: "parse", page: title, prop: "text", redirects: "1" });

  if (data.error) {
    throw new Error(`Wikipedia não tem o artigo "${title}": ${data.error.info ?? data.error.code}`);
  }
  const html = data.parse?.text?.["*"];
  if (typeof html !== "string") {
    throw new Error(`Resposta inesperada da Wikipedia para "${title}".`);
  }
  return htmlToText(html);
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
}

export const wikipediaSearchTool = Tool.create({
  name: "wikipedia_search",
  description:
    "Busca artigos na Wikipedia em inglês pela API oficial. Prefira esta ferramenta a web_search quando a resposta provavelmente está na Wikipedia — ela é mais confiável e não bloqueia por volume de consultas.",
  inputSchema: z.object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  handler: resilient(
    "wikipedia_search",
    "Tente termos diferentes, ou use web_search se o assunto não estiver na Wikipedia.",
    async ({ query, limit }: { query: string; limit: number }) => {
      const hits = await searchWikipedia(query, limit);
      if (hits.length === 0) return `Nenhum artigo encontrado para "${query}".`;
      return hits.map((hit, index) => `${index + 1}. ${hit.title}\n   ${hit.snippet}`).join("\n\n");
    },
  ),
});

export const wikipediaPageTool = Tool.create({
  name: "wikipedia_page",
  description:
    "Lê um artigo da Wikipedia em inglês pelo título exato, devolvendo o texto completo com as tabelas preservadas em formato pipe. Use depois de wikipedia_search, ou direto quando souber o título.",
  inputSchema: z.object({
    title: z.string().min(1).describe("Título exato do artigo, ex: 'Amazon River'"),
    max_chars: z.number().int().min(1000).max(150000).default(60000),
  }),
  handler: resilient(
    "wikipedia_page",
    "Confirme o título exato com wikipedia_search antes de tentar de novo.",
    async ({ title, max_chars }: { title: string; max_chars: number }) =>
      truncate(await fetchWikipediaPage(title), max_chars),
  ),
});
