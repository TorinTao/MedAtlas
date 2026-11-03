import assert from "node:assert/strict";
import test from "node:test";
import { createTaskRunner } from "../../modules/automation/runner";
test("task runner isolates a failed job and accepts replacement workflows", async () => {
  const runner = createTaskRunner({
    broken: async () => {
      throw new Error("source unavailable");
    },
    replacement: async () => ({ updated: 2 }),
  });
  assert.deepEqual(await runner.run("broken"), {
    ok: false,
    error: "source unavailable",
  });
  assert.deepEqual(await runner.run("replacement"), {
    ok: true,
    result: { updated: 2 },
  });
  assert.equal((await runner.run("toString")).ok, false);
});
