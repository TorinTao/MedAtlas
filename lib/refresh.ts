import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { jobs } from "../db/schema";
import { collectPapers } from "./collect";
import { putPapers } from "./store";

export async function refreshLiterature() {
  const db = getDb();
  const id = `daily:${new Date().toISOString().slice(0, 10)}`;
  const existing = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (existing[0]?.status === "done") return { status: "already_done", detail: existing[0].detail };
  const queries = ["medical multimodal agent radiology clinical notes", "medical vision language model radiology report", "multimodal clinical decision support agent"];
  const results = await Promise.all(queries.map(collectPapers));
  const papers = results.flatMap(r => r.papers);
  if (!papers.length) throw new Error("来源暂不可用");
  await putPapers(papers);
  const detail = JSON.stringify({ count: papers.length, sources: [...new Set(results.flatMap(r => r.sources))], errors: results.flatMap(r => r.errors) });
  await db.insert(jobs).values({ id, status: "done", updatedAt: new Date().toISOString(), detail }).onConflictDoUpdate({ target: jobs.id, set: { status: "done", updatedAt: new Date().toISOString(), detail } });
  return { status: "done", count: papers.length, detail };
}
