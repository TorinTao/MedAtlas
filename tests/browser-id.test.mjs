import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { browserId } from "../shared/browser-id.ts";

test("draw progress IDs remain valid without secure-context randomUUID", () => {
  const httpCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const ids = Array.from({ length: 100 }, () => browserId(httpCrypto));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("secure origins can use the native UUID implementation", () => {
  const native = "3ef418da-f688-4ebc-ae76-7915cbf94f1f";
  assert.equal(browserId({ randomUUID: () => native, getRandomValues() { throw new Error("unexpected fallback"); } }), native);
});
