import type { CustomTool } from "@getloopscale/loopzero-sdk";
import { createWebFetchTool } from "@getloopscale/loopzero-sdk-tools";
import type { TaskFileSource } from "../scoring-api.ts";
import type { SourceHealth } from "../lib/health.ts";
import { createSearchTool, fetchPageTool } from "./web.ts";
import { wikipediaPageTool, wikipediaSearchTool } from "./wikipedia.ts";
import { runPythonTool } from "./python.ts";
import { youtubeTranscriptTool } from "./youtube.ts";
import { createReadTaskFileTool } from "./task-files.ts";
import {
  createDescribeImageTool,
  createTranscribeAudioTool,
  type PerceptionConfig,
} from "./perception.ts";
import type { WebSearchCallback } from "@getloopscale/loopzero-sdk-tools";

/**
 * Monta o conjunto de ferramentas de uma execução.
 *
 * Existe separado do agente porque montar o conjunto e conduzir a conversa mudam por
 * razões diferentes: adicionar uma ferramenta não deveria exigir editar a função que
 * consome o stream e encadeia tentativas.
 */

export interface ToolRegistryOptions {
  api: TaskFileSource;
  fileIndex: Map<string, string>;
  perception: PerceptionConfig;
  search: WebSearchCallback;
  /** Fontes disponíveis; ausente ⇒ registra tudo. */
  health?: SourceHealth;
}

/**
 * Busca uma URL com proteção contra SSRF, vinda de `@getloopscale/loopzero-sdk-tools`.
 *
 * O agente escolhe a URL a partir de texto que ele mesmo leu da web, então ela é entrada
 * não confiável: sem screening, uma página pode dirigi-lo a `127.0.0.1` ou ao endpoint de
 * metadados da nuvem (`169.254.169.254`). A ferramenta do SDK resolve o host e recusa
 * endereços privados, de loopback e link-local, também nos redirecionamentos.
 */
const webFetchTool = createWebFetchTool({
  description:
    "Baixa uma URL e devolve o conteúdo bruto, com proteção contra acesso a endereços internos. Use fetch_page quando quiser o texto já legível, com tabelas preservadas.",
  defaultTimeoutMs: 30_000,
});

export function buildTools(options: ToolRegistryOptions): CustomTool[] {
  const { api, fileIndex, perception, health } = options;

  const wikipedia = health?.wikipedia === false ? [] : [wikipediaSearchTool, wikipediaPageTool];
  const webSearch = health?.webSearch === false ? [] : [createSearchTool(options.search)];

  return [
    ...wikipedia,
    ...webSearch,
    webFetchTool,
    fetchPageTool,
    runPythonTool,
    youtubeTranscriptTool,
    createReadTaskFileTool(api, fileIndex),
    createDescribeImageTool(api, fileIndex, perception),
    createTranscribeAudioTool(api, fileIndex, perception),
  ] as CustomTool[];
}
