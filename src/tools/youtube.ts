import { z } from "zod";
import { Tool } from "@theokit/sdk";
import { YoutubeTranscript } from "youtube-transcript";
import { truncate } from "./support/html-text.ts";
import { resilient } from "./support/resilient-tool.ts";

/** Extrai o id de 11 caracteres de qualquer forma de URL do YouTube. */
export function extractVideoId(urlOrId: string): string {
  if (/^[\w-]{11}$/.test(urlOrId)) return urlOrId;
  const match = urlOrId.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  if (!match) throw new Error(`Não consegui extrair o id do vídeo de "${urlOrId}".`);
  return match[1];
}

export const youtubeTranscriptTool = Tool.create({
  name: "youtube_transcript",
  description:
    "Obtém a transcrição (legendas) de um vídeo do YouTube, com marcação de tempo. Serve para perguntas sobre o que é DITO no vídeo. Não descreve o que aparece na imagem.",
  inputSchema: z.object({
    url: z.string().min(1).describe("URL do vídeo ou o id de 11 caracteres"),
  }),
  handler: resilient(
    "youtube_transcript",
    "O vídeo pode não ter legendas. Procure uma transcrição ou descrição do vídeo com web_search.",
    async ({ url }: { url: string }) => {
    const videoId = extractVideoId(url);
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    if (segments.length === 0) return "O vídeo não tem legendas disponíveis.";
    const transcript = segments
      .map((segment) => `[${formatTimestamp(segment.offset)}] ${decodeEntities(segment.text)}`)
      .join("\n");
    return truncate(transcript, 40000);
  }),
});

function formatTimestamp(offsetMs: number): string {
  const totalSeconds = Math.floor(offsetMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;#39;/g, "'")
    .replace(/&amp;quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}
