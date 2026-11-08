import { env } from "cloudflare:workers";
import { canExportMigration } from "../../../../platform/migration/access";

const tables = ["ideas", "jobs", "papers", "read_papers", "research_directions", "saved_papers", "uploads", "usage", "user_api_credentials"] as const;
const noStore = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  if (!canExportMigration(request.headers.get("authorization"), env.MIGRATION_EXPORT_TOKEN, env.MIGRATION_EXPORT_UNTIL))
    return new Response("Not found", { status: 404, headers: noStore });
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("resource") === "database") {
      if (!env.DB) throw new Error("Database unavailable");
      const schema = await env.DB.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type DESC, name").all<{ type: string; name: string; tbl_name: string; sql: string }>();
      const selected = schema.results.filter((item) => tables.includes(item.tbl_name as typeof tables[number]));
      for (const name of tables)
        if (!selected.some((item) => item.type === "table" && item.name === name)) throw new Error("Incomplete schema");
      // D1 batch executes within a transaction: every table belongs to one snapshot.
      const rows = await env.DB.batch(tables.map((name) => env.DB!.prepare(`SELECT * FROM "${name}" ORDER BY rowid`)));
      return Response.json({ format: "medatlas-migration-v1", exportedAt: new Date().toISOString(), schema: selected, tables: tables.map((name, i) => ({ name, rows: rows[i].results })) }, { headers: noStore });
    }
    if (url.searchParams.get("resource") === "files") {
      if (!env.BUCKET) throw new Error("File storage unavailable");
      const page = await env.BUCKET.list({ limit: 25, cursor: url.searchParams.get("cursor") || undefined });
      const objects = await Promise.all(page.objects.map(async (listed) => {
        const object = await env.BUCKET!.head(listed.key);
        if (!object) throw new Error("File changed during export");
        return { key: object.key, size: object.size, etag: object.etag, httpMetadata: object.httpMetadata, customMetadata: object.customMetadata };
      }));
      return Response.json({ objects, cursor: page.truncated ? page.cursor : null }, { headers: noStore });
    }
    if (url.searchParams.get("resource") === "file") {
      const key = url.searchParams.get("key");
      if (!key || !env.BUCKET) return new Response("Not found", { status: 404, headers: noStore });
      const object = await env.BUCKET.get(key);
      if (!object) return new Response("Not found", { status: 404, headers: noStore });
      return new Response(object.body, { headers: { ...noStore, "Content-Type": "application/octet-stream", "Content-Length": String(object.size), ETag: object.httpEtag } });
    }
    return new Response("Unknown export resource", { status: 400, headers: noStore });
  } catch {
    return Response.json({ error: "Migration export failed" }, { status: 503, headers: noStore });
  }
}
