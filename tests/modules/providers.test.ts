import assert from "node:assert/strict";
import test from "node:test";
import { createDeepSeekModel } from "../../platform/ai/deepseek";
import { createLexmountReader } from "../../platform/web/lexmount";
test("model adapter accepts injectable transport and enforces JSON output", async () => {
  const model = createDeepSeekModel(
    async () => "synthetic-test-key",
    async (_, init) => {
      assert.match(String(init?.body), /deepseek-flash/);
      return Response.json({
        choices: [
          { message: { content: '{"ok":true}' }, finish_reason: "stop" },
        ],
      });
    },
  );
  assert.deepEqual(await model("system", "input"), { ok: true });
  const invalid = createDeepSeekModel(
    async () => "synthetic-test-key",
    async () =>
      Response.json({ choices: [{ message: { content: "not JSON" } }] }),
  );
  await assert.rejects(invalid("s", "u"), SyntaxError);
});
test("provider failures stay explicit and never include API keys", async () => {
  const model = createDeepSeekModel(
    async () => "synthetic-test-key",
    async () => new Response("", { status: 429 }),
  );
  await assert.rejects(model("s", "u"), /DeepSeek HTTP 429/);
});
test("web adapter rejects private URLs before sending requests", async () => {
  let calls = 0;
  const reader = createLexmountReader(
    () => ({ key: "synthetic-test-key", projectId: "fixture" }),
    async () => {
      calls++;
      return Response.json({
        result: {
          main_text: "Public evidence",
          final_url: "https://example.org/paper",
        },
      });
    },
  );
  await assert.rejects(
    reader.extract("http://127.0.0.1/private"),
    /公开 HTTPS/,
  );
  assert.equal(calls, 0);
  assert.equal(
    (await reader.extract("https://example.org/paper")).text,
    "Public evidence",
  );
  assert.equal(calls, 1);
});
