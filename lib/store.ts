import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { papers as paperTable } from "../db/schema";
import { dedupePapers, seedPapers } from "./papers";
import type { Paper } from "./types";

export async function allPapers(): Promise<Paper[]> {
  try {
    const rows = await getDb().select().from(paperTable).limit(500);
    return dedupePapers([...rows.map(r => JSON.parse(r.data) as Paper), ...seedPapers]);
  } catch { return seedPapers; }
}

export async function findPaper(id: string): Promise<Paper | undefined> {
  try {
    const row = await getDb().select().from(paperTable).where(eq(paperTable.id, id)).limit(1);
    if (row[0]) return JSON.parse(row[0].data) as Paper;
  } catch { /* initial preview can use the seed corpus */ }
  return seedPapers.find(p => p.id === id);
}

export async function putPapers(items: Paper[]) {
  const db = getDb(); const updatedAt = new Date().toISOString();
  for (const paper of items) await db.insert(paperTable).values({ id: paper.id, title: paper.title, data: JSON.stringify(paper), updatedAt }).onConflictDoUpdate({ target: paperTable.id, set: { title: paper.title, data: JSON.stringify(paper), updatedAt } });
}

export async function takeQuota(request: Request, action: string, limit: number, userId?: string): Promise<boolean> {
  if (!env.DB) return false;
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const identity = userId || [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)))].map(x => x.toString(16).padStart(2, "0")).join("");
  const id = `${new Date().toISOString().slice(0, 10)}:${action}:${identity}`;
  const result = await env.DB.prepare("INSERT INTO usage (id,count,updated_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at WHERE count < ? RETURNING count").bind(id, new Date().toISOString(), limit).first();
  return Boolean(result);
}

export function jsonError(message: string, status = 400) { return Response.json({ error: message }, { status }); }
