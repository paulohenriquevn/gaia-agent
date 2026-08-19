import { PermissionEngine, PermissionPlugin } from "@theokit/sdk";

/**
 * Quais ferramentas o agente pode usar.
 *
 * O runtime local registra `shell` em todo agente, mesmo quando o consumidor passa
 * apenas ferramentas próprias — verificado: com `tools: []`, o evento de init ainda
 * reporta `["shell"]`. Isso dá ao modelo leitura arbitrária de arquivos a partir do
 * diretório de trabalho.
 *
 * Numa avaliação isso não é aceitável. O agente responde perguntas de um benchmark, e
 * qualquer arquivo alcançável a partir do processo — anotação, material de referência,
 * resultado de uma rodada anterior — vira uma via de resposta que não é pesquisa. Já
 * aconteceu uma vez: o gabarito do benchmark estava no diretório e duas transcrições
 * registram o modelo dizendo tê-lo consultado.
 *
 * Retirar o arquivo do diretório resolve aquele caso; negar a ferramenta resolve a
 * classe inteira. A negação explícita é imune a qualquer modo de auto-aprovação.
 */

/** Ferramentas do runtime que o agente não deve alcançar. */
const DENIED_TOOLS = ["shell", "memory_search", "memory_get"];

/**
 * Plugin que nega as ferramentas de acesso irrestrito e permite as do projeto.
 *
 * A ordem importa: a primeira regra que casa vence, então as negações vêm antes da
 * permissão geral. `defaultAction: "allow"` deixa passar as ferramentas registradas
 * pelo projeto sem precisar listá-las uma a uma — o que se quer barrar é o que o
 * runtime adiciona por conta própria.
 */
export function createToolPermissionPlugin() {
  const engine = new PermissionEngine(
    DENIED_TOOLS.map((tool) => ({ tool, action: "deny" as const })),
    { defaultAction: "allow" },
  );

  return PermissionPlugin.create(engine, {
    name: "gaia-tool-permissions",
    mode: "default",
  });
}

/** Ferramentas negadas, para o log da rodada declarar o que foi bloqueado. */
export function deniedToolNames(): readonly string[] {
  return DENIED_TOOLS;
}
