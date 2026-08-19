import { screenedFetch } from "@theokit/sdk-tools";

/**
 * Fronteira HTTP do projeto.
 *
 * Toda chamada de rede passa por aqui, por duas razões que a revisão mediu:
 *
 * 1. **Prazo.** Nenhuma das sete chamadas de `fetch` do projeto tinha `AbortSignal`, e
 *    sem ele a requisição herda só o padrão de 300 s do undici — tempo suficiente para
 *    uma questão prender um worker e a rodada inteira parecer travada.
 *
 * 2. **SSRF.** As URLs de leitura de página vêm do modelo, que as extraiu de texto lido
 *    na web. Sem triagem, uma página consegue dirigi-lo a `127.0.0.1` ou ao endpoint de
 *    metadados da nuvem (`169.254.169.254`) e receber a resposta de volta — provado com
 *    PoC contra um servidor local.
 *
 * A triagem vem de `@theokit/sdk-tools`, que já resolve o host, recusa endereços
 * privados, de loopback e link-local, e reavalia cada redirecionamento.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /**
   * Desliga a triagem de SSRF. Use apenas para hosts fixos definidos em código
   * (a API do curso, o OpenRouter, a Wikipedia), nunca para URL escolhida pelo modelo.
   */
  trustedHost?: boolean;
}

/** Erro de rede com o prazo estourado, distinguível de uma recusa do servidor. */
export class HttpTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`${url} não respondeu em ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
  }
}

/**
 * Executa uma requisição com prazo e, salvo host confiável, triagem de SSRF.
 * O `AbortController` é sempre limpo, para não vazar timers entre questões.
 */
export async function request(url: string, options: HttpRequestOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (options.trustedHost) {
      return await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
    }

    return await screenedFetch(url, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new HttpTimeoutError(url, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
