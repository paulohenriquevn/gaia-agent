/**
 * Extração e normalização da resposta final.
 *
 * O scorer da Unit 4 compara por EXACT MATCH. O agente é instruído a terminar com
 * "FINAL ANSWER: <x>" — formato no qual o GAIA foi calibrado — e este módulo extrai
 * o <x> e remove o prefixo, porque o curso exige que o texto submetido não o contenha.
 */

const FINAL_ANSWER_PATTERN = /final\s*answer\s*:?\s*(.*)/is;

/**
 * Extrai a resposta final do texto bruto do agente.
 * Sem o marcador, cai para a última linha não vazia — melhor um palpite do que
 * submeter um parágrafo inteiro, que erra o exact match com certeza.
 */
export function extractFinalAnswer(rawOutput: string): string {
  const match = rawOutput.match(FINAL_ANSWER_PATTERN);
  const candidate = match ? match[1] : lastNonEmptyLine(rawOutput);
  return normalizeAnswer(candidate);
}

function lastNonEmptyLine(text: string): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : "";
}

/**
 * Limpa artefatos de formatação que quebrariam o exact match, sem alterar o conteúdo:
 * markdown de ênfase, pontuação final, aspas envolventes e espaço redundante.
 */
export function normalizeAnswer(answer: string): string {
  let normalized = answer.split("\n")[0].trim();

  normalized = normalized.replace(/\*\*/g, "").replace(/^`+|`+$/g, "").trim();
  normalized = stripWrappingQuotes(normalized);
  normalized = normalized.replace(/[.。]+$/, "").trim();
  normalized = normalized.replace(/\s*,\s*/g, ", ").replace(/\s{2,}/g, " ");

  return normalized;
}

function stripWrappingQuotes(text: string): string {
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
  ];
  for (const [open, close] of pairs) {
    if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
      return text.slice(1, -1).trim();
    }
  }
  return text;
}
