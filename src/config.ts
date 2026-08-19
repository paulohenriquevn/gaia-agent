import type { AgentConfig } from "./agent.ts";

/** Configuração ausente ou inválida. Falha na fronteira, antes de qualquer trabalho. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface AppConfig extends AgentConfig {
  /** Usuário do Hugging Face, usado para identificar a submissão. */
  username: string;
  /** URL pública do código do Space (.../tree/main), exigida pela API de avaliação. */
  agentCodeUrl: string;
  /** Questões respondidas em paralelo. */
  concurrency: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigError(
      `Variável de ambiente ${name} não está definida. Defina-a antes de rodar o agente.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new ConfigError(`${name} precisa ser um inteiro positivo, recebi "${raw}".`);
  }
  return value;
}

/**
 * Monta a URL do código a partir do id do Space (formato "usuario/nome-do-space").
 * A API de avaliação exige o link para `/tree/main`, não a página do Space.
 */
export function agentCodeUrlFromSpaceId(spaceId: string): string {
  const trimmed = spaceId.trim().replace(/^\/+|\/+$/g, "");
  if (!/^[^/\s]+\/[^/\s]+$/.test(trimmed)) {
    throw new ConfigError(
      `SPACE_ID precisa ter o formato "usuario/nome-do-space", recebi "${spaceId}".`,
    );
  }
  return `https://huggingface.co/spaces/${trimmed}/tree/main`;
}

/** Extrai o usuário dono do Space a partir do id. */
export function usernameFromSpaceId(spaceId: string): string {
  return agentCodeUrlFromSpaceId(spaceId).split("/spaces/")[1].split("/")[0];
}

export function loadConfig(): AppConfig {
  const openRouterApiKey = required("OPENROUTER_API_KEY");

  // Dentro de um Space em execução o Hugging Face injeta SPACE_ID, então os dois
  // campos de submissão se resolvem sozinhos. Fora dele, valem as variáveis explícitas.
  const spaceId = process.env.SPACE_ID?.trim();

  return {
    openRouterApiKey,
    modelId: optional("MODEL_ID", "openrouter/anthropic/claude-sonnet-5"),
    fallbackModelId: optional("FALLBACK_MODEL_ID", "openrouter/google/gemini-3-flash-preview"),
    visionModel: optional("VISION_MODEL", "google/gemini-2.5-flash"),
    audioModel: optional("AUDIO_MODEL", "google/gemini-2.5-flash"),
    cwd: optional("AGENT_CWD", process.cwd()),
    username: optional("HF_USERNAME", spaceId ? usernameFromSpaceId(spaceId) : ""),
    agentCodeUrl: optional("AGENT_CODE_URL", spaceId ? agentCodeUrlFromSpaceId(spaceId) : ""),
    maxIterations: positiveInt("MAX_ITERATIONS", 30),
    concurrency: positiveInt("CONCURRENCY", 3),
  };
}
