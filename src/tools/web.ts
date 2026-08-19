import { z } from "zod";
import { Tool } from "@theokit/sdk";
import * as cheerio from "cheerio";
import { htmlToText, truncate } from "../lib/html-text.ts";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Busca na web via endpoint HTML do DuckDuckGo (sem API key).
 * Fail-fast: erro de rede ou bloqueio sobe como exceção, nunca vira lista vazia silenciosa.
 */
export async function searchWeb(query: string, maxResults: number): Promise<SearchHit[]> {
  const response = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT,
    },
    body: new URLSearchParams({ q: query }).toString(),
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo respondeu ${response.status} para a busca "${query}"`);
  }
  return parseDuckDuckGoHtml(await response.text(), maxResults);
}

/** Extrai os resultados do HTML do DuckDuckGo. Separado do fetch para ser testável offline. */
export function parseDuckDuckGoHtml(html: string, maxResults: number): SearchHit[] {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];

  $(".result__body").each((_, element) => {
    if (hits.length >= maxResults) return false;
    const anchor = $(element).find("a.result__a").first();
    const rawHref = anchor.attr("href") ?? "";
    const url = unwrapDuckDuckGoRedirect(rawHref);
    if (!url) return;
    hits.push({
      title: anchor.text().replace(/\s+/g, " ").trim(),
      url,
      snippet: $(element).find(".result__snippet").text().replace(/\s+/g, " ").trim(),
    });
  });

  return hits;
}

/** O DuckDuckGo embrulha resultados em /l/?uddg=<url-encoded>. Devolve a URL real. */
export function unwrapDuckDuckGoRedirect(href: string): string | null {
  if (!href) return null;
  const absolute = href.startsWith("//") ? `https:${href}` : href;
  if (!absolute.includes("/l/?")) return absolute.startsWith("http") ? absolute : null;
  const encoded = new URL(absolute).searchParams.get("uddg");
  return encoded ? decodeURIComponent(encoded) : null;
}

/** Baixa uma página e devolve seu texto legível. */
export async function fetchPageText(url: string, maxChars: number): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`${url} respondeu ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  const text = contentType.includes("html") ? htmlToText(body) : body;
  return truncate(text, maxChars);
}

export const webSearchTool = Tool.create({
  name: "web_search",
  description:
    "Busca na web e devolve título, URL e trecho dos melhores resultados. Use para descobrir QUAIS páginas ler; depois use fetch_page para ler o conteúdo completo.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Termos de busca"),
    max_results: z.number().int().min(1).max(10).default(5),
  }),
  handler: async ({ query, max_results }) => {
    const hits = await searchWeb(query, max_results);
    if (hits.length === 0) return `Nenhum resultado para "${query}". Tente outros termos.`;
    return hits
      .map((hit, index) => `${index + 1}. ${hit.title}\n   ${hit.url}\n   ${hit.snippet}`)
      .join("\n\n");
  },
});

export const fetchPageTool = Tool.create({
  name: "fetch_page",
  description:
    "Baixa uma URL e devolve o texto legível da página, com tabelas preservadas em formato pipe. Use depois de web_search, ou direto quando já souber a URL.",
  inputSchema: z.object({
    url: z.string().url(),
    max_chars: z.number().int().min(1000).max(120000).default(40000),
  }),
  handler: async ({ url, max_chars }) => fetchPageText(url, max_chars),
});
