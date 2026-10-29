import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { jobs } from "../db/schema";
import { collectPapers, searchOpenAlex } from "./collect";
import { dedupePapers } from "./papers";
import { allPapers, putPapers } from "./store";

// Three cross-source searches plus distinct historical, modality and task slices.
// Kept below 500 visible records after deduplication and merging with the seed set.
const CORE_QUERIES = [
  "medical multimodal agent radiology clinical notes",
  "medical vision language model radiology report",
  "multimodal clinical decision support agent",
];
const DEPTH_QUERIES = [
  "medical imaging clinical text multimodal review survey",
  "radiology report generation vision language model",
  "medical visual question answering benchmark",
  "chest x-ray clinical notes electronic health record multimodal",
  "medical imaging agent retrieval augmented generation clinical",
];

export async function refreshLiterature() {
  const db = getDb();
  const id = `daily:${new Date().toISOString().slice(0, 10)}`;
  const existing = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  const requiredSources = ["PubMed", "arXiv", "OpenAlex"];
  if (existing[0]?.status === "done") {
    const oldSources: string[] = JSON.parse(existing[0].detail || "{}").sources || [];
    if (requiredSources.every(source => oldSources.includes(source))) return { status: "already_done", detail: existing[0].detail };
  }
  const core = await Promise.all(CORE_QUERIES.map(query => collectPapers(query, "corpus")));
  const depth = await Promise.allSettled(DEPTH_QUERIES.map(query => searchOpenAlex(query, 50)));
  const depthPapers = depth.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const papers = dedupePapers([...core.flatMap(r => r.papers), ...depthPapers]);
  if (!papers.length) throw new Error("来源暂不可用");
  await putPapers(papers);
  const visibleCount = (await allPapers()).length;
  const sources = [...new Set(core.flatMap(r => r.sources).concat(depthPapers.length ? ["OpenAlex"] : []))];
  const errors = core.flatMap(r => r.errors).concat(depth.flatMap((r, i) => r.status === "rejected" ? [`OpenAlex ${DEPTH_QUERIES[i]}: ${r.reason?.message || "请求失败"}`] : []));
  const status = requiredSources.every(source => sources.includes(source)) && visibleCount >= 200 ? "done" : "partial";
  const detail = JSON.stringify({ fetched: papers.length, visibleCount, target: "200–500", sources, errors });
  await db.insert(jobs).values({ id, status, updatedAt: new Date().toISOString(), detail }).onConflictDoUpdate({ target: jobs.id, set: { status, updatedAt: new Date().toISOString(), detail } });
  return { status, count: visibleCount, fetched: papers.length, detail };
}
