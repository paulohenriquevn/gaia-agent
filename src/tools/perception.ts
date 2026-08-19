import { z } from "zod";
import { Tool } from "@theokit/sdk";
import { ScoringApi } from "../scoring-api.ts";
import { analyzeAudio, describeImage } from "../lib/openrouter.ts";
import { extensionOf } from "./task-files.ts";
import { resilient } from "../lib/resilient-tool.ts";

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export interface PerceptionConfig {
  apiKey: string;
  visionModel: string;
  audioModel: string;
}

export function createDescribeImageTool(
  api: ScoringApi,
  fileNameByTaskId: Map<string, string>,
  config: PerceptionConfig,
) {
  return Tool.create({
    name: "describe_image",
    description:
      "Analisa a imagem anexada a uma questão e responde uma pergunta específica sobre ela. Faça a pergunta mais precisa possível — descrições genéricas perdem detalhe.",
    inputSchema: z.object({
      task_id: z.string().min(1),
      question: z
        .string()
        .min(1)
        .describe("O que examinar na imagem, ex: 'Descreva a posição de cada peça no tabuleiro'"),
    }),
    handler: resilient(
      "describe_image",
      "A imagem pode estar indisponível no servidor. Responda pelo enunciado, ou busque a informação em outra fonte.",
      async ({ task_id, question }: { task_id: string; question: string }) => {
      const fileName = fileNameByTaskId.get(task_id);
      if (!fileName) throw new Error(`A questão ${task_id} não tem arquivo anexado.`);

      const extension = extensionOf(fileName);
      const mimeType = MIME_BY_EXTENSION[extension];
      if (!mimeType) throw new Error(`"${fileName}" não é uma imagem suportada (extensão "${extension}").`);

      const { bytes } = await api.fetchTaskFile(task_id);
      return describeImage({
        model: config.visionModel,
        apiKey: config.apiKey,
        bytes,
        mimeType,
        question,
      });
    }),
  });
}

export function createTranscribeAudioTool(
  api: ScoringApi,
  fileNameByTaskId: Map<string, string>,
  config: PerceptionConfig,
) {
  return Tool.create({
    name: "transcribe_audio",
    description:
      "Escuta o áudio anexado a uma questão e responde uma pergunta sobre o conteúdo falado. Peça a transcrição literal quando precisar de nomes ou números exatos.",
    inputSchema: z.object({
      task_id: z.string().min(1),
      question: z
        .string()
        .min(1)
        .default("Transcreva este áudio literalmente, palavra por palavra."),
    }),
    handler: resilient(
      "transcribe_audio",
      "O áudio pode estar indisponível no servidor. Responda pelo enunciado, ou busque a informação em outra fonte.",
      async ({ task_id, question }: { task_id: string; question: string }) => {
      const fileName = fileNameByTaskId.get(task_id);
      if (!fileName) throw new Error(`A questão ${task_id} não tem arquivo anexado.`);

      const format = extensionOf(fileName);
      if (!["mp3", "wav", "m4a", "ogg", "flac"].includes(format)) {
        throw new Error(`"${fileName}" não é um áudio suportado (extensão "${format}").`);
      }

      const { bytes } = await api.fetchTaskFile(task_id);
      return analyzeAudio({
        model: config.audioModel,
        apiKey: config.apiKey,
        bytes,
        format,
        question,
      });
    }),
  });
}
