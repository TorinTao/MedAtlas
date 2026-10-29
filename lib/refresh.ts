import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { jobs } from "../db/schema";
import { collectPapers } from "./collect";
import { putPapers } from "./store";

export async function refreshLiterature() {
  const db = getDb();
  const id = `daily:${new Date().toISOString().slice(0, 10)}`;
  const existing = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  const requiredSources = ["PubMed", "arXiv", "OpenAlex"];
  if (existing[0]?.status === "done") {
    const oldSources: string[] = JSON.parse(existing[0].detail || "{}").sources || [];
    if (requiredSources.every(source => oldSources.includes(source))) return { status: "already_done", detail: existing[0].detail };
  }
  const queries = ["medical multimodal agent radiology clinical notes", "medical vision language model radiology report", "multimodal clinical decision support agent"];
  const results = [];
  for (const query of queries) results.push(await collectPapers(query));
  const papers = results.flatMap(r => r.papers);
  if (!papers.length) throw new Error("来源暂不可用");
  await putPapers(papers);
  const sources = [...new Set(results.flatMap(r => r.sources))];
  const status = requiredSources.every(source => sources.includes(source)) ? "done" : "partial";
  const detail = JSON.stringify({ count: papers.length, sources, errors: results.flatMap(r => r.errors) });
  await db.insert(jobs).values({ id, status, updatedAt: new Date().toISOString(), detail }).onConflictDoUpdate({ target: jobs.id, set: { status, updatedAt: new Date().toISOString(), detail } });
  return { status, count: papers.length, detail };
}
