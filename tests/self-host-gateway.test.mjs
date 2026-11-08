import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedRequest, workerHeaders } from "../deployment/self-host/gateway.mjs";

test("personal gateway accepts the tunnel and rejects cross-site requests", () => {
  const check = (headers) => allowedRequest({ headers }, 5180);
  assert.equal(check({ host: "localhost:5180" }), true);
  assert.equal(check({ host: "localhost:5180", origin: "http://localhost:5180" }), true);
  assert.equal(check({ host: "evil.example" }), false);
  assert.equal(check({ host: "localhost:5180", origin: "https://evil.example" }), false);
  assert.equal(check({ host: "localhost:5180", origin: "null" }), false);
  assert.equal(check({ host: "localhost:5180", "sec-fetch-site": "cross-site" }), false);
});
test("client-supplied identity cannot select another migrated workspace", () => {
  const headers = workerHeaders({ "oai-authenticated-user-id": "other", "oai-authenticated-user-email": "other@example.test", "x-forwarded-host": "evil.example", accept: "application/json" }, { userId: "original-owner", email: "torin@localhost", name: "torin" });
  assert.equal(headers.get("oai-authenticated-user-id"), "original-owner");
  assert.equal(headers.get("oai-authenticated-user-email"), "torin@localhost");
  assert.equal(headers.has("x-forwarded-host"), false);
  assert.equal(headers.get("accept"), "application/json");
});
