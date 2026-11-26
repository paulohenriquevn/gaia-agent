import type { Run, RunResult, SDKMessage } from "@getloopscale/loopzero-sdk";

/**
 * Leitura do stream de um run.
 *
 * Consumir o stream não é opcional: quando o provider recusa a chamada, `result.result`
 * vem vazio e o motivo aparece só no evento de status. Ler apenas o resultado
 * transformava "o crédito acabou" em "sem detalhe do provider".
 */

export interface StreamHarvest {
  /** Texto que o agente emitiu, na ordem. */
  assistantTexts: string[];
  /** Motivo do erro relatado pelo provider, quando houve. */
  failureDetail?: string;
}

/** Estados terminais que o SDK usa no evento de status. */
const ERROR_STATUS = "ERROR";

export async function harvestStream(run: Run): Promise<StreamHarvest> {
  const assistantTexts: string[] = [];
  let failureDetail: string | undefined;

  for await (const event of run.stream() as AsyncIterable<SDKMessage>) {
    if (event.type === "assistant") {
      for (const block of event.message.content) {
        if (block.type === "text") assistantTexts.push(block.text);
      }
    } else if (event.type === "status" && event.status === ERROR_STATUS) {
      failureDetail = event.message ?? failureDetail;
    }
  }

  return { assistantTexts, failureDetail };
}

/**
 * Motivo da falha de um run, preferindo o detalhe estruturado do SDK.
 * A mensagem do stream é o segundo melhor; o literal genérico, o último recurso.
 */
export function failureReason(result: RunResult, harvested?: string): string {
  const structured = (result as { error?: { message?: string } }).error?.message;
  return structured ?? harvested ?? "sem detalhe do provider";
}

/** Texto bruto do run: o resultado final, ou o que foi colhido antes de ele parar. */
export function rawOutputOf(result: RunResult, harvest: StreamHarvest): string {
  return result.result ?? harvest.assistantTexts.join("\n");
}
