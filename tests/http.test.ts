import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { HttpTimeoutError, request } from "../src/lib/http.ts";
import { fetchPageText, unwrapDuckDuckGoRedirect } from "../src/tools/web.ts";

function listen(handler: Parameters<typeof createServer>[0], port: number): Promise<Server> {
  const server = createServer(handler);
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

describe("fronteira HTTP — triagem de SSRF", () => {
  it("recusa loopback para URL escolhida pelo modelo", async () => {
    const server = await listen((_q, r) => r.end("SEGREDO_INTERNO"), 8793);
    try {
      await assert.rejects(fetchPageText("http://127.0.0.1:8793/", 500), /Blocked request/);
    } finally {
      server.close();
    }
  });

  it("recusa o endpoint de metadados da nuvem", async () => {
    await assert.rejects(
      fetchPageText("http://169.254.169.254/latest/meta-data/", 500),
      /Blocked request/,
    );
  });

  it("permite loopback quando o host e declarado confiavel no codigo", async () => {
    const server = await listen((_q, r) => r.end("ok-confiavel"), 8794);
    try {
      const response = await request("http://127.0.0.1:8794/", { trustedHost: true });
      assert.equal(await response.text(), "ok-confiavel");
    } finally {
      server.close();
    }
  });
});

describe("fronteira HTTP — prazo", () => {
  it("aborta com erro tipado em vez de pendurar o worker", async () => {
    const server = await listen(() => { /* nunca responde */ }, 8795);
    try {
      await assert.rejects(
        request("http://127.0.0.1:8795/", { trustedHost: true, timeoutMs: 300 }),
        (error: Error) => error instanceof HttpTimeoutError && /300ms/.test(error.message),
      );
    } finally {
      server.close();
    }
  });
});

describe("unwrapDuckDuckGoRedirect com href relativo", () => {
  it("nao lanca em href relativo malformado", () => {
    assert.doesNotThrow(() => unwrapDuckDuckGoRedirect("/l/?uddg=nao-e-url"));
  });

  it("resolve href relativo do redirect", () => {
    assert.equal(
      unwrapDuckDuckGoRedirect("/l/?uddg=https%3A%2F%2Fexample.com%2Fx"),
      "https://example.com/x",
    );
  });
});
