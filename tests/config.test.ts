import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agentCodeUrlFromSpaceId, usernameFromSpaceId } from "../src/config.ts";

describe("agentCodeUrlFromSpaceId", () => {
  it("monta a URL para /tree/main, que e o formato exigido pela API", () => {
    assert.equal(
      agentCodeUrlFromSpaceId("paulohenriquevn/gaia-final-agent"),
      "https://huggingface.co/spaces/paulohenriquevn/gaia-final-agent/tree/main",
    );
  });

  it("tolera barras sobrando nas pontas", () => {
    assert.equal(
      agentCodeUrlFromSpaceId("/user/space/"),
      "https://huggingface.co/spaces/user/space/tree/main",
    );
  });

  it("falha alto quando falta o dono do space", () => {
    assert.throws(() => agentCodeUrlFromSpaceId("gaia-final-agent"), /usuario\/nome-do-space/);
  });

  it("falha alto para valor vazio", () => {
    assert.throws(() => agentCodeUrlFromSpaceId("   "), /usuario\/nome-do-space/);
  });
});

describe("usernameFromSpaceId", () => {
  it("extrai o dono do space", () => {
    assert.equal(usernameFromSpaceId("paulohenriquevn/gaia-final-agent"), "paulohenriquevn");
  });
});
