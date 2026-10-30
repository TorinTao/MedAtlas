import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { papers as paperTable } from "../db/schema";
import { classify, dedupePapers, publicPaperUrl, relevantMedicalAiPaper, seedPapers } from "./papers";
import type { Paper } from "./types";

export async function allPapers(): Promise<Paper[]> {
  try {
    const rows = await getDb().select().from(paperTable).orderBy(desc(paperTable.updatedAt)).limit(500);
    return dedupePapers([...rows.map(r => securePaperUrls(JSON.parse(r.data) as Paper)), ...seedPapers]).filter(paper => paper.year <= new Date().getUTCFullYear() && (!paper.discovery || relevantMedicalAiPaper(paper.title, paper.abstract))).slice(0, 500);
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
  // Keep enrichment when a fresh metadata snapshot omits it, while allowing retries to improve it.
  const sql = `INSERT INTO papers (id,title,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    title=excluded.title,
    data=json_set(excluded.data,
      '$.summaryZh',coalesce(json_extract(excluded.data,'$.summaryZh'),json_extract(papers.data,'$.summaryZh')),
      '$.summaryBasis',coalesce(json_extract(excluded.data,'$.summaryBasis'),json_extract(papers.data,'$.summaryBasis')),
      '$.summarySourceUrl',coalesce(json_extract(excluded.data,'$.summarySourceUrl'),json_extract(papers.data,'$.summarySourceUrl')),
      '$.abstractZh',coalesce(json_extract(excluded.data,'$.abstractZh'),json_extract(papers.data,'$.abstractZh')),
      '$.abstractSourceUrl',coalesce(json_extract(excluded.data,'$.abstractSourceUrl'),json_extract(papers.data,'$.abstractSourceUrl')),
      '$.reviewAbstractZh',coalesce(json_extract(excluded.data,'$.reviewAbstractZh'),json_extract(papers.data,'$.reviewAbstractZh')),
      '$.reviewAbstractSourceUrl',coalesce(json_extract(excluded.data,'$.reviewAbstractSourceUrl'),json_extract(papers.data,'$.reviewAbstractSourceUrl')),
      '$.analysis',json(coalesce(json_extract(excluded.data,'$.analysis'),json_extract(papers.data,'$.analysis'),'null')),
      '$.repoUrl',coalesce(nullif(json_extract(excluded.data,'$.repoUrl'),''),json_extract(papers.data,'$.repoUrl'),''),
      '$.repoEvidenceUrl',coalesce(json_extract(excluded.data,'$.repoEvidenceUrl'),json_extract(papers.data,'$.repoEvidenceUrl')),
      '$.repoAudit',json(coalesce(json_extract(excluded.data,'$.repoAudit'),json_extract(papers.data,'$.repoAudit'),'null')),
      '$.discovery',json(coalesce(json_extract(excluded.data,'$.discovery'),json_extract(papers.data,'$.discovery'),'null'))),
    updated_at=excluded.updated_at`;
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
