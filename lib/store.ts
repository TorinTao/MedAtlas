import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { papers as paperTable } from "../db/schema";
import { classify, dedupePapers, publicPaperUrl, seedPapers } from "./papers";
import type { Paper } from "./types";

export async function allPapers(): Promise<Paper[]> {
  try {
    const rows = await getDb().select().from(paperTable).orderBy(desc(paperTable.updatedAt)).limit(500);
    return dedupePapers([...rows.map(r => securePaperUrls(JSON.parse(r.data) as Paper)), ...seedPapers]).slice(0, 500);
  } catch { return seedPapers; }
}

export async function findPaper(id: string): Promise<Paper | undefined> {
  try {
    const row = await getDb().select().from(paperTable).where(eq(paperTable.id, id)).limit(1);
    if (row[0]) return securePaperUrls(JSON.parse(row[0].data) as Paper);
  } catch { /* initial preview can use the seed corpus */ }
  return seedPapers.find(p => p.id === id);
}

export async function putPapers(items: Paper[]) {
  const updatedAt = new Date().toISOString();
  const storage = env.DB;
  if (!storage) throw new Error("文献数据库不可用");
  // D1 batches keep large background updates within a single Worker request.
  // Preserve a prior full-text/abstract analysis when metadata is refreshed.
  const sql = "INSERT INTO papers (id,title,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, data=CASE WHEN json_extract(papers.data,'$.analysis') IS NOT NULL THEN json_set(excluded.data,'$.analysis',json_extract(papers.data,'$.analysis')) ELSE excluded.data END, updated_at=excluded.updated_at";
  for (let offset = 0; offset < items.length; offset += 50) {
    const batch = items.slice(offset, offset + 50).map(paper => storage.prepare(sql).bind(paper.id, paper.title, JSON.stringify(paper), updatedAt));
    await storage.batch(batch);
  }
}

function securePaperUrls(paper: Paper): Paper { return { ...paper, url: publicPaperUrl(paper.url), oaUrl: publicPaperUrl(paper.oaUrl), method: classify(paper.title, paper.abstract).method }; }

export async function takeQuota(request: Request, action: string, limit: number, userId?: string): Promise<boolean> {
  if (!env.DB) return false;
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const identity = userId || [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)))].map(x => x.toString(16).padStart(2, "0")).join("");
  const id = `${new Date().toISOString().slice(0, 10)}:${action}:${identity}`;
  const result = await env.DB.prepare("INSERT INTO usage (id,count,updated_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at WHERE count < ? RETURNING count").bind(id, new Date().toISOString(), limit).first();
  return Boolean(result);
}

export function jsonError(message: string, status = 400) { return Response.json({ error: message }, { status }); }
