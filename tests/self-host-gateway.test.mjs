import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedRequest, publicRouteError, requestUser, workerHeaders } from "../deployment/self-host/gateway.mjs";

test("public visitors are isolated unless the owner explicitly shares their workspace", () => {
  const owner = { userId: "original-owner", email: "torin@localhost", name: "torin" };
  assert.equal(requestUser({ mode: "ssh-personal", user: owner }), owner);
  const demo = requestUser({ mode: "public-demo", user: owner });
  assert.notEqual(demo.userId, owner.userId);
  assert.equal(demo.name, "演示访客");
  const headers = workerHeaders({ "oai-authenticated-user-id": owner.userId }, demo);
  assert.equal(headers.get("oai-authenticated-user-id"), "medatlas-public-demo");
  assert.equal(requestUser({ mode: "public-demo", publicWorkspace: "owner", user: owner }), owner);
  assert.notEqual(requestUser({ mode: "public-demo", publicWorkspace: "invalid", user: owner }).userId, owner.userId);
});

test("public demo accepts external navigation but not cross-site API calls", () => {
  const check = (headers, url = "/", method = "GET") => allowedRequest({ headers, url, method }, 5180, "http://39.106.14.223:5180");
  const host = "39.106.14.223:5180";
  assert.equal(check({ host }), true);
  assert.equal(check({ host, origin: `http://${host}` }, "/api/ideas", "POST"), true);
  assert.equal(check({ host, "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" }), true);
  assert.equal(check({ host, "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" }, "/api/workspace"), false);
  assert.equal(check({ host, origin: "https://evil.example" }, "/api/ideas", "POST"), false);
  assert.equal(check({ host: "evil.example:5180" }), false);
  assert.equal(check({ host, origin: "http://localhost:5180" }, "/api/ideas", "POST"), false);
});

test("public demo protects provider settings, private PDFs and administrative routes", () => {
  for (const path of ["/api/admin/migration", "/api/%61dmin/refresh", "/api/admin/summaries", "/mcp"]) assert.equal(publicRouteError(path, "POST").status, 404);
  for (const path of ["/api/upload", "/api/upload/abc", "/api/upload/abc/analyze"]) assert.equal(publicRouteError(path, "GET").status, 403);
  for (const method of ["POST", "PUT", "DELETE"]) assert.equal(publicRouteError("/api/settings/ai", method).status, 403);
  assert.equal(publicRouteError("/api/%2561dmin/refresh", "POST").status, 400);
  assert.equal(publicRouteError("/api/settings/ai", "GET"), null);
  assert.equal(publicRouteError("/api/ideas", "POST"), null);
  assert.equal(publicRouteError("/api/research", "POST"), null);
});

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
