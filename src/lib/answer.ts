/**
 * Extração e normalização da resposta final.
 *
 * O scorer da Unit 4 compara por EXACT MATCH. O agente é instruído a terminar com
 * "FINAL ANSWER: <x>" — formato no qual o GAIA foi calibrado — e este módulo extrai
 * o <x> e remove o prefixo, porque o curso exige que o texto submetido não o contenha.
 */

/**
 * Pontuação final descartável.
 *
 * Compartilhada com a correção local (`grading.ts`): quando as duas divergiam, uma
 * resposta terminando em "!" era contada como acerto na medição e recusada pelo scorer
 * real, inflando o score estimado sem que nada acusasse.
 */
export const TRAILING_PUNCTUATION = /[.。!?！？]+$/;

const FINAL_ANSWER_PATTERN_GLOBAL = /final\s*answer\s*:?[ \t]*(.*)/gi;
const WORKING_ANSWER_PATTERN_GLOBAL = /working\s*answer\s*:?[ \t]*(.*)/gi;

/** Último grupo capturado por um padrão global, ou `undefined` se não houver nenhum. */
function lastMatch(text: string, pattern: RegExp): string | undefined {
  const matches = [...text.matchAll(pattern)];
  return matches.length > 0 ? matches[matches.length - 1][1] : undefined;
}

/**
 * Rascunho que o agente escreve ANTES de pesquisar. Serve de rede: quando o run é
 * interrompido no meio da investigação, esta linha costuma ser tudo o que sobrou —
 * e um rascunho plausível vale mais que resposta vazia, que erra sempre.
 */


/**
 * Extrai a resposta final do texto bruto do agente.
 * Sem o marcador, cai para a última linha não vazia — melhor um palpite do que
 * submeter um parágrafo inteiro, que erra o exact match com certeza.
 */
export function extractFinalAnswer(rawOutput: string): string {
  // O ÚLTIMO marcador vence. O texto reúne todas as mensagens do agente, e um modelo
  // que se corrige escreve o marcador mais de uma vez: pegar o primeiro submete o
  // rascunho que ele próprio descartou.
  const finalMatch = lastMatch(rawOutput, FINAL_ANSWER_PATTERN_GLOBAL);
  if (finalMatch !== undefined) return normalizeAnswer(finalMatch);

  const working = extractWorkingAnswer(rawOutput);
  if (working !== "") return working;

  return normalizeAnswer(lastNonEmptyLine(rawOutput));
}

/**
 * Recupera o rascunho anterior à pesquisa. Devolve string vazia quando ele não existe
 * ou quando o agente declarou não saber — "unknown" não é uma resposta.
 */
export function extractWorkingAnswer(rawOutput: string): string {
  const match = lastMatch(rawOutput, WORKING_ANSWER_PATTERN_GLOBAL);
  if (match === undefined) return "";

  const candidate = normalizeAnswer(match);
  return /^(unknown|desconhecido|n\/a|none)$/i.test(candidate) ? "" : candidate;
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
  normalized = normalized.replace(TRAILING_PUNCTUATION, "").trim();
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
