import { test } from "node:test";
import assert from "node:assert/strict";
import { canExportMigration } from "../platform/migration/access";

test("migration export requires its own token and an unexpired deadline", () => {
  const token = "migration-test-token-with-at-least-32-characters";
  const now = Date.parse("2026-11-08T00:00:00Z");
  const deadline = "2026-11-08T01:00:00Z";
  assert.equal(canExportMigration(`Bearer ${token}`, token, deadline, now), true);
  assert.equal(canExportMigration(null, token, deadline, now), false);
  assert.equal(canExportMigration(`Bearer ${token}`, undefined, deadline, now), false);
  assert.equal(canExportMigration("Bearer wrong-token", token, deadline, now), false);
  assert.equal(canExportMigration(`Bearer ${token}`, token, undefined, now), false);
  assert.equal(canExportMigration(`Bearer ${token}`, token, "invalid", now), false);
  assert.equal(canExportMigration(`Bearer ${token}`, token, deadline, Date.parse(deadline)), false);
});
