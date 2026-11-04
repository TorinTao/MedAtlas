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
test("blank JSON-mode output retries once as text and validates JSON", async () => {
  const formats: string[] = [];
  const budgets: number[] = [];
  const model = createDeepSeekModel(async () => "synthetic-test-key", async (_, init) => {
    const body = JSON.parse(String(init?.body));
    formats.push(body.response_format.type);
    budgets.push(body.max_tokens);
    return Response.json(formats.length === 1
      ? { choices: [{ message: { content: "   " }, finish_reason: "stop" }] }
      : { choices: [{ message: { content: '```json\n{"ok":true}\n```' }, finish_reason: "stop" }] });
  });
  assert.deepEqual(await model("system", "input", { maxTokens: 1000 }), { ok: true });
  assert.deepEqual(formats, ["json_object", "text"]);
  assert.deepEqual(budgets, [1000, 2000]);
});
test("length and repeated blank responses report the actual failure", async () => {
  let calls = 0;
  const lengthModel = createDeepSeekModel(async () => "synthetic-test-key", async () => {
    calls++;
    return Response.json({ choices: [{ message: { content: "" }, finish_reason: "length" }] });
  });
  await assert.rejects(lengthModel("system", "input"), /长度上限/);
  assert.equal(calls, 2);
  const blankModel = createDeepSeekModel(async () => "synthetic-test-key", async () =>
    Response.json({ choices: [{ message: { content: "  " }, finish_reason: "stop" }] }));
  await assert.rejects(blankModel("system", "input"), /连续返回空白内容/);
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
