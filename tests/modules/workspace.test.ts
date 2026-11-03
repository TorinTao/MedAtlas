import assert from "node:assert/strict";
import test from "node:test";
import {
  createDocumentService,
  type UploadRecord,
} from "../../modules/workspace/documents";
import { createWorkspaceService } from "../../modules/workspace/saved-items";
import type { ResearchIdea } from "../../shared/models";
test("document service can replace metadata and file storage independently", async () => {
  const rows = new Map<string, UploadRecord>(),
    files = new Map<string, Uint8Array | string>();
  const service = createDocumentService(
    {
      findOwned: async (user, id) => {
        const r = rows.get(id);
        return r?.userId === user ? r : undefined;
      },
      insert: async (r) => {
        rows.set(r.id, r);
      },
      remove: async (_, id) => {
        rows.delete(id);
      },
    },
    {
      put: async (k, v) => {
        files.set(k, v);
      },
      get: async (k) => {
        const v = files.get(k);
        return v
          ? {
              body: typeof v === "string" ? v : new Uint8Array(v).buffer,
              text: async () => String(v),
            }
          : null;
      },
      delete: async (k) => {
        files.delete(k);
      },
    },
  );
  const result = await service.save("owner", {
    bytes: new Uint8Array(100),
    text: "fixture",
    fileName: "example.pdf",
    pages: 1,
  });
  await assert.rejects(service.read("other", result.id, "pdf"), /无权访问/);
  assert.equal(
    (await service.read("owner", result.id, "pdf")).row.pageCount,
    1,
  );
  await service.remove("owner", result.id);
  assert.equal(files.size, 0);
  assert.equal(rows.size, 0);
});
test("workspace enforces explicit idea saving even with a replacement repository", async () => {
  const service = createWorkspaceService(
    {
      paperIds: async () => [],
      setPaper: async () => {},
      uploads: async () => [],
      savedIdeas: async () =>
        [
          { id: "unsaved", favorite: false },
          { id: "saved", favorite: true },
        ] as ResearchIdea[],
    },
    { find: async () => undefined },
  );
  assert.deepEqual(
    (await service.list("owner")).ideas.map((i) => i.id),
    ["saved"],
  );
  await assert.rejects(service.list(""), /请先登录/);
});
