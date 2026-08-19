import { z } from "zod";
import { Tool } from "@theokit/sdk";
import * as XLSX from "xlsx";
import { ScoringApi } from "../scoring-api.ts";
import { truncate } from "../lib/html-text.ts";

const TEXT_EXTENSIONS = new Set(["py", "txt", "csv", "json", "md", "jsonl", "xml", "yaml", "yml"]);
const SHEET_EXTENSIONS = new Set(["xlsx", "xls"]);

export function extensionOf(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/** Converte uma pasta de trabalho Excel em CSV, uma seção por planilha. */
export function workbookToCsv(bytes: Uint8Array): string {
  const workbook = XLSX.read(bytes, { type: "array" });
  return workbook.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
    return `=== planilha: ${name} ===\n${csv}`;
  }).join("\n\n");
}

/**
 * Decodifica o anexo de uma questão para texto.
 * Formatos binários que exigem percepção (imagem, áudio) são recusados aqui de propósito:
 * eles têm ferramentas próprias, e devolver bytes como texto produziria alucinação.
 */
export function decodeTaskFile(fileName: string, bytes: Uint8Array): string {
  const extension = extensionOf(fileName);

  if (SHEET_EXTENSIONS.has(extension)) return workbookToCsv(bytes);
  if (TEXT_EXTENSIONS.has(extension)) return new TextDecoder().decode(bytes);

  throw new Error(
    `O anexo "${fileName}" é do tipo "${extension}", que read_task_file não decodifica. ` +
      `Use describe_image para imagens (png/jpg) ou transcribe_audio para áudio (mp3/wav).`,
  );
}

export function createReadTaskFileTool(api: ScoringApi, fileNameByTaskId: Map<string, string>) {
  return Tool.create({
    name: "read_task_file",
    description:
      "Lê o arquivo anexado a uma questão e devolve seu conteúdo como texto. Suporta planilhas (xlsx/xls, convertidas para CSV) e arquivos de texto/código (py, txt, csv, json). Para imagens use describe_image; para áudio use transcribe_audio.",
    inputSchema: z.object({
      task_id: z.string().min(1).describe("O task_id da questão que tem o anexo"),
    }),
    handler: async ({ task_id }) => {
      const fileName = fileNameByTaskId.get(task_id);
      if (!fileName) {
        throw new Error(`A questão ${task_id} não tem arquivo anexado.`);
      }
      const { bytes } = await api.fetchTaskFile(task_id);
      return truncate(decodeTaskFile(fileName, bytes), 60000);
    },
  });
}
