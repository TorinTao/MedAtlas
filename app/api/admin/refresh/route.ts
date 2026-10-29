import { getDb } from "../../../../db";
import { jobs } from "../../../../db/schema";
import { collectPapers } from "../../../../lib/collect";
import { runtime } from "../../../../lib/runtime";
import { jsonError, putPapers } from "../../../../lib/store";

export async function POST(request: Request) {
  const token = runtime("REFRESH_TOKEN");
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) return jsonError("未授权", 401);
  const db = getDb(); const id = `daily:${new Date().toISOString().slice(0, 10)}`;
  const existing = await db.select().from(jobs).where((await import("drizzle-orm")).eq(jobs.id, id)).limit(1);
  if (existing[0]?.status === "done") return Response.json({ status: "already_done", detail: existing[0].detail });
  const queries = ["medical multimodal agent radiology clinical notes", "medical vision language model radiology report", "multimodal clinical decision support agent"];
  const results = await Promise.all(queries.map(collectPapers));
  const papers = results.flatMap(r => r.papers);
  if (!papers.length) return jsonError("来源暂不可用", 502);
  await putPapers(papers);
  await db.insert(jobs).values({ id, status: "done", updatedAt: new Date().toISOString(), detail: JSON.stringify({ count: papers.length, sources: [...new Set(results.flatMap(r => r.sources))] }) }).onConflictDoUpdate({ target: jobs.id, set: { status: "done", updatedAt: new Date().toISOString(), detail: JSON.stringify({ count: papers.length }) } });
  return Response.json({ status: "done", count: papers.length });
}
