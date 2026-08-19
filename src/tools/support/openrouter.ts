/**
 * Cliente mínimo do OpenRouter para as chamadas MULTIMODAIS (imagem e áudio).
 * O raciocínio principal do agente passa pelo runtime do @theokit/sdk; este cliente
 * existe só porque uma ferramenta precisa devolver texto, e imagem/áudio só viram
 * texto passando por um modelo perceptivo.
 */

import { request } from "../../lib/http.ts";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`OpenRouter respondeu ${status}: ${body.slice(0, 500)}`);
    this.name = "OpenRouterError";
    this.status = status;
    this.body = body;
  }
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

async function complete(model: string, parts: ContentPart[], apiKey: string): Promise<string> {
  const response = await request(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-title": "GAIA Final Agent",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: parts }],
      temperature: 0,
    }),
    trustedHost: true,
    // Percepção multimodal é lenta: imagem e áudio levam mais que uma consulta de texto.
    timeoutMs: 120_000,
  });

  const body = await response.text();
  if (!response.ok) throw new OpenRouterError(response.status, body);

  const payload = JSON.parse(body) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (payload.error) throw new OpenRouterError(200, payload.error.message ?? "erro sem mensagem");

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new OpenRouterError(200, `resposta sem conteúdo: ${body.slice(0, 300)}`);
  return content;
}

/** Descreve uma imagem respondendo a uma pergunta específica sobre ela. */
export function describeImage(options: {
  model: string;
  apiKey: string;
  bytes: Uint8Array;
  mimeType: string;
  question: string;
}): Promise<string> {
  const dataUrl = `data:${options.mimeType};base64,${Buffer.from(options.bytes).toString("base64")}`;
  return complete(
    options.model,
    [
      { type: "text", text: options.question },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
    options.apiKey,
  );
}

/** Transcreve/analisa um áudio respondendo a uma pergunta sobre ele. */
export function analyzeAudio(options: {
  model: string;
  apiKey: string;
  bytes: Uint8Array;
  format: string;
  question: string;
}): Promise<string> {
  return complete(
    options.model,
    [
      { type: "text", text: options.question },
      {
        type: "input_audio",
        input_audio: { data: Buffer.from(options.bytes).toString("base64"), format: options.format },
      },
    ],
    options.apiKey,
  );
}
