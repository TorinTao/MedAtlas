import { env } from "cloudflare:workers";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { papers as paperTable } from "../../db/schema";
import {
  classify,
  dedupePapers,
  publicPaperUrl,
  seedPapers,
} from "../../modules/catalog/papers";
import type { Paper } from "../../shared/models";
import { withSummaryFallback } from "../../modules/catalog/summary-fallback";
import { withVenueFallback } from "../../modules/catalog/publication-venue";
export async function allPapers(): Promise<Paper[]> {
  try {
    const rows = await getDb()
      .select()
      .from(paperTable)
      .orderBy(desc(paperTable.updatedAt))
      .limit(500);
    return dedupePapers([
      ...rows.map((r) => securePaperUrls(JSON.parse(r.data) as Paper)),
      ...seedPapers,
    ])
      .filter((paper) => paper.year <= new Date().getUTCFullYear())
      .slice(0, 500)
      .map(withVenueFallback)
      .map(withSummaryFallback);
  } catch {
    return seedPapers.map(withVenueFallback).map(withSummaryFallback);
  }
}
/** Scan every stored paper for background enrichment, including older library rows. */
export async function allPapersForEnrichment(): Promise<Paper[]> {
  const rows: { data: string }[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const page = await getDb()
      .select({ data: paperTable.data })
      .from(paperTable)
      .orderBy(desc(paperTable.updatedAt), desc(paperTable.id))
      .limit(pageSize)
      .offset(offset);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return dedupePapers([
    ...rows.map((row) => securePaperUrls(JSON.parse(row.data) as Paper)),
    ...seedPapers,
  ])
    .filter((paper) => paper.year <= new Date().getUTCFullYear())
    .map(withVenueFallback)
    .map(withSummaryFallback);
}
/** Restore a public research collection without the global library's 500-row window. */
export async function findPapersByIds(ids: string[]): Promise<Paper[]> {
  const records: Paper[] = [];
  const unique = [...new Set(ids)].slice(0, 500);
  for (let start = 0; start < unique.length; start += 80) {
    const rows = await getDb()
      .select()
      .from(paperTable)
      .where(inArray(paperTable.id, unique.slice(start, start + 80)));
    records.push(
      ...rows.map((row) => securePaperUrls(JSON.parse(row.data) as Paper)),
    );
  }
  const found = new Set(records.map((p) => p.id));
  const requested = new Set(unique);
  return [
    ...records,
    ...seedPapers.filter((p) => requested.has(p.id) && !found.has(p.id)),
  ]
    .map(withVenueFallback)
    .map(withSummaryFallback);
}
export async function findPaper(id: string): Promise<Paper | undefined> {
  try {
    const row = await getDb()
      .select()
      .from(paperTable)
      .where(eq(paperTable.id, id))
      .limit(1);
    if (row[0])
      return withSummaryFallback(
        withVenueFallback(securePaperUrls(JSON.parse(row[0].data) as Paper)),
      );
  } catch {
    /* initial preview can use the seed corpus */
  }
  const seed = seedPapers.find((p) => p.id === id);
  return seed ? withSummaryFallback(withVenueFallback(seed)) : undefined;
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
      '$.publicationVenue',json(coalesce(json_extract(excluded.data,'$.publicationVenue'),json_extract(papers.data,'$.publicationVenue'),'null')),
      '$.abstractZh',coalesce(json_extract(excluded.data,'$.abstractZh'),json_extract(papers.data,'$.abstractZh')),
      '$.abstractSourceUrl',coalesce(json_extract(excluded.data,'$.abstractSourceUrl'),json_extract(papers.data,'$.abstractSourceUrl')),
      '$.reviewAbstractZh',coalesce(json_extract(excluded.data,'$.reviewAbstractZh'),json_extract(papers.data,'$.reviewAbstractZh')),
      '$.reviewAbstractSourceUrl',coalesce(json_extract(excluded.data,'$.reviewAbstractSourceUrl'),json_extract(papers.data,'$.reviewAbstractSourceUrl')),
      '$.analysis',json(coalesce(json_extract(excluded.data,'$.analysis'),json_extract(papers.data,'$.analysis'),'null')),
      '$.repoUrl',coalesce(nullif(json_extract(excluded.data,'$.repoUrl'),''),json_extract(papers.data,'$.repoUrl'),''),
      '$.repoEvidenceUrl',coalesce(json_extract(excluded.data,'$.repoEvidenceUrl'),json_extract(papers.data,'$.repoEvidenceUrl')),
      '$.repoDiscovery',json(coalesce(json_extract(excluded.data,'$.repoDiscovery'),json_extract(papers.data,'$.repoDiscovery'),'null')),
      '$.repoAudit',json(coalesce(json_extract(excluded.data,'$.repoAudit'),json_extract(papers.data,'$.repoAudit'),'null')),
      '$.discovery',json(coalesce(json_extract(excluded.data,'$.discovery'),json_extract(papers.data,'$.discovery'),'null'))),
    updated_at=excluded.updated_at`;
  for (let offset = 0; offset < items.length; offset += 50) {
    const batch = items
      .slice(offset, offset + 50)
      .map((paper) =>
        storage
          .prepare(sql)
          .bind(paper.id, paper.title, JSON.stringify(paper), updatedAt),
      );
    await storage.batch(batch);
  }
}
function securePaperUrls(paper: Paper): Paper {
  return {
    ...paper,
    url: publicPaperUrl(paper.url),
    oaUrl: publicPaperUrl(paper.oaUrl),
    method: classify(paper.title, paper.abstract).method,
  };
}
export async function takeQuota(
  request: Request,
  action: string,
  limit: number,
  userId?: string,
): Promise<boolean> {
  if (!env.DB) return false;
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    "local";
  const identity =
    userId ||
    [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  const id = `${new Date().toISOString().slice(0, 10)}:${action}:${identity}`;
  const result = await env.DB.prepare(
    "INSERT INTO usage (id,count,updated_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at WHERE count < ? RETURNING count",
  )
    .bind(id, new Date().toISOString(), limit)
    .first();
  return Boolean(result);
}
export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
