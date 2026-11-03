import assert from "node:assert/strict";
import test from "node:test";
import { createRepositoryDiscovery } from "../../modules/repositories/discovery";
import { createRepositoryAudit } from "../../modules/repositories/audit";
import { normalizePaper } from "../../modules/catalog/papers";
import type { WebReader } from "../../shared/ports";
const web: WebReader = {
  extract: async (url) => ({
    text: "Code https://github.com/example/model",
    description: "",
    title: "",
    finalUrl: url,
    author: "",
    publishTime: "",
    requestId: "fixture",
  }),
  dumpDom: async () => {
    throw new Error("unavailable");
  },
};
test("repository discovery uses an injected page reader and preserves link evidence", async () => {
  const service = createRepositoryDiscovery({ web });
  const result = await service.discoverPaperRepository(
    normalizePaper({
      id: "repo-test",
      title: "Test",
      url: "https://example.org/paper",
    }),
  );
  assert.equal(result.status, "found");
  assert.equal(result.repoUrl, "https://github.com/example/model");
  assert.equal(result.sourceUrl, "https://example.org/paper");
});
test("repository rate limits produce unknown checks rather than invented absence", async () => {
  const service = createRepositoryAudit({
    web,
    http: async () => new Response("", { status: 429 }),
    githubToken: () => "",
    publicDom: async () => {
      throw new Error("offline");
    },
  });
  const result = await service.auditRepository(
    "https://github.com/example/model",
  );
  assert.ok(result.checks.every((c) => c.status === "无法确认"));
  assert.match(result.disclaimer, /未经实际运行/);
});
