import * as cheerio from "cheerio";

/** Elementos que nunca contribuem com texto útil para leitura de conteúdo. */
const NOISE_SELECTORS = "script, style, noscript, svg, nav, footer, header, form, iframe";

/**
 * Converte HTML em texto legível, preservando tabelas como pipe-tables.
 * Tabelas importam: várias questões do GAIA dependem de ler uma tabela da Wikipedia.
 */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $(NOISE_SELECTORS).remove();

  $("table").each((_, table) => {
    const rows: string[] = [];
    $(table)
      .find("tr")
      .each((_, tr) => {
        const cells = $(tr)
          .find("th, td")
          .map((_, cell) => $(cell).text().replace(/\s+/g, " ").trim())
          .get();
        if (cells.length > 0) rows.push(`| ${cells.join(" | ")} |`);
      });
    $(table).replaceWith(`\n\n${rows.join("\n")}\n\n`);
  });

  const text = $("body").length > 0 ? $("body").text() : $.root().text();
  return collapseBlankLines(text);
}

/** Reduz sequências de linhas em branco a no máximo uma, e apara espaços por linha. */
export function collapseBlankLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Corta texto no limite de caracteres, sinalizando o corte.
 * Truncar em silêncio faria o modelo tratar conteúdo parcial como completo.
 */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[...truncado: ${text.length - maxChars} caracteres omitidos de ${text.length} no total]`;
}
