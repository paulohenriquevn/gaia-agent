import { PermissionEngine, PermissionPlugin } from "@getloopscale/loopzero-sdk";

/**
 * Which tools the agent may use.
 *
 * An earlier version of the runtime registered `shell` on every agent, even when the
 * consumer passed only its own tools: with `tools: []`, the init event still reported
 * `["shell"]`. That gave the model arbitrary file reads from the working directory.
 * With `@getloopscale/loopzero-sdk` 0.1.0 the same probe reports `[]`.
 *
 * The denial stays anyway. The agent answers benchmark questions, and any file reachable
 * from the process (a note, reference material, the output of an earlier run) becomes a
 * way to answer that is not research. It happened once: the benchmark's answer key was
 * in the directory and two transcripts record the model saying it had read it.
 *
 * Removing the file from the directory fixes that case; denying the tool fixes the whole
 * class, including a future runtime that registers it again. An explicit denial is immune
 * to any auto-approval mode.
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
