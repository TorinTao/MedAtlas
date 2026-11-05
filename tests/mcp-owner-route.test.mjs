import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(path.join(tmpdir(), "medatlas-mcp-owner-"));
let route;
try {
  const outfile = path.join(temp, "route.mjs");
  await build({
    entryPoints: ["app/mcp/route.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    plugins: [{
      name: "mcp-dependencies",
      setup(plugin) {
        plugin.onResolve({ filter: /composition\/automation$/ }, () => ({ path: "automation", namespace: "mcp-test" }));
        plugin.onResolve({ filter: /composition\/jobs\/enrich$/ }, () => ({ path: "retry", namespace: "mcp-test" }));
        plugin.onResolve({ filter: /platform\/config$/ }, () => ({ path: "config", namespace: "mcp-test" }));
        plugin.onLoad({ filter: /.*/, namespace: "mcp-test" }, ({ path: name }) => ({
          contents: name === "config"
            ? "export const runtime = () => globalThis.__mcpOwnerEmail;"
            : name === "retry"
              ? "export const retryMissingReading = async () => { globalThis.__mcpRuns++; return { analysis: true }; };"
            : "export const backgroundTasks = { run: async () => { globalThis.__mcpRuns++; return { ok: true, result: { processed: 1 } }; } };",
        }));
      },
    }],
  });
  route = await import(pathToFileURL(outfile));

  const call = async (email, name = "enrich_missing_papers", argumentsValue = {}) => {
    const headers = new Headers({ "content-type": "application/json" });
    if (email) headers.set("oai-authenticated-user-email", email);
    const request = new Request("https://example.test/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: argumentsValue } }),
    });
    return (await route.POST(request)).json();
  };

  test("MCP owner check accepts only the configured verified email", async () => {
    globalThis.__mcpOwnerEmail = " Owner@Example.test \n";
    globalThis.__mcpRuns = 0;
    assert.equal((await call("owner@example.test")).result.isError, undefined);
    assert.equal(globalThis.__mcpRuns, 1);
    assert.equal((await call("other@example.test")).result.isError, true);
    assert.equal((await call("other@example.test", "retry_missing_reading", { paperId: "paper-1" })).result.isError, true);
    assert.equal((await call("owner@example.test", "retry_missing_reading", { paperId: "paper-1" })).result.isError, undefined);
    assert.ok((await call("owner@example.test", "retry_missing_reading", { paperId: "bad/id" })).error);
    assert.equal((await call(null)).result.isError, true);
    assert.equal(globalThis.__mcpRuns, 2);
    globalThis.__mcpOwnerEmail = "";
    assert.equal((await call("owner@example.test")).result.isError, true);
    assert.equal(globalThis.__mcpRuns, 2);
  });
} finally {
  await rm(temp, { recursive: true, force: true });
}
