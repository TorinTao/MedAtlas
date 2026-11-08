import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRuntime, loadConfig } from "./runtime.mjs";

const backup = resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Usage: node deployment/self-host/import.mjs BACKUP_DIRECTORY");
const source = JSON.parse(await readFile(join(backup, "database.json"), "utf8"));
const files = JSON.parse(await readFile(join(backup, "files.json"), "utf8"));
if (source.format !== "medatlas-migration-v1") throw new Error("Unknown backup format");
const config = await loadConfig();
const runtime = await createRuntime(config);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (rows) => JSON.stringify(rows.map((row) => Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)))));
try {
  const db = await runtime.getD1Database("DB");
  const existing = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
  if (existing.results.length) throw new Error("Target database is not empty; refusing to overwrite it");
  const allowed = new Set(["ideas", "jobs", "papers", "read_papers", "research_directions", "saved_papers", "uploads", "usage", "user_api_credentials"]);
  for (const item of source.schema) {
    if (!allowed.has(item.tbl_name) || !["table", "index"].includes(item.type) || !/^CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\b/i.test(item.sql)) throw new Error("Unexpected schema entry");
    await db.prepare(item.sql).run();
  }
  const verified = {};
  for (const table of source.tables) {
    if (!allowed.has(table.name)) throw new Error("Unexpected table");
    for (let offset = 0; offset < table.rows.length; offset += 50) {
      await db.batch(table.rows.slice(offset, offset + 50).map((row) => {
        const columns = Object.keys(row);
        if (!columns.every((name) => /^[a-z_]+$/.test(name))) throw new Error("Unexpected column");
        return db.prepare(`INSERT INTO "${table.name}" (${columns.map((name) => `"${name}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`).bind(...columns.map((name) => row[name]));
      }));
    }
    const restored = await db.prepare(`SELECT * FROM "${table.name}" ORDER BY rowid`).all();
    if (hash(canonical(restored.results)) !== hash(canonical(table.rows))) throw new Error(`Verification failed: ${table.name}`);
    verified[table.name] = { count: table.rows.length, sha256: hash(canonical(table.rows)) };
  }
  const bucket = await runtime.getR2Bucket("BUCKET");
  for (const object of files.objects) {
    const bytes = await readFile(join(backup, "objects", object.sha256));
    if (bytes.length !== object.size || hash(bytes) !== object.sha256) throw new Error("File checksum mismatch");
    await bucket.put(object.key, bytes, { httpMetadata: object.httpMetadata, customMetadata: object.customMetadata });
    const restored = await bucket.get(object.key);
    if (!restored || hash(Buffer.from(await restored.arrayBuffer())) !== object.sha256) throw new Error("Restored file checksum mismatch");
  }
  const report = { importedAt: new Date().toISOString(), exportedAt: source.exportedAt, tables: verified, files: files.objects.length };
  await writeFile(join(config.statePath, "migration-verified.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} finally {
  await runtime.dispose();
}
