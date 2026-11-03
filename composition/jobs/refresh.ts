import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { jobs } from "../../db/schema";
import { collectPapers, searchOpenAlex, searchPubMed } from "../catalog";
import { dedupePapers } from "../../modules/catalog/papers";
import { allPapers, putPapers } from "../../platform/storage/papers";
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
  const requiredSources = ["OpenAlex", "PubMed", "arXiv"];
  if (existing[0]?.status === "done") {
    const oldSources: string[] =
      JSON.parse(existing[0].detail || "{}").sources || [];
    if (requiredSources.every((source) => oldSources.includes(source)))
      return { status: "already_done", detail: existing[0].detail };
  }
  const core = [];
  const depth = [];
  // PubMed's unauthenticated E-utilities limit is strict; pace the batches.
  for (const query of CORE_QUERIES) {
    core.push(await collectPapers(query, "corpus"));
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  for (const query of DEPTH_QUERIES) {
    const [openalex, pubmed] = await Promise.allSettled([
      searchOpenAlex(query, 50),
      searchPubMed(query, 40),
    ]);
    depth.push({ query, openalex, pubmed });
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  const depthPapers = depth.flatMap((r) =>
    [r.openalex, r.pubmed].flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
  );
  const papers = dedupePapers([
    ...core.flatMap((r) => r.papers),
    ...depthPapers,
  ]);
  if (!papers.length) throw new Error("来源暂不可用");
  await putPapers(papers);
  const visibleCount = (await allPapers()).length;
  const sources = [
    ...new Set(
      core
        .flatMap((r) => r.sources)
        .concat(
          depth
            .flatMap((r) => [
              r.openalex.status === "fulfilled" ? "OpenAlex" : "",
              r.pubmed.status === "fulfilled" ? "PubMed" : "",
            ])
            .filter(Boolean),
        ),
    ),
  ];
  const errors = core
    .flatMap((r) => r.errors)
    .concat(
      depth.flatMap((r) =>
        [
          r.openalex.status === "rejected"
            ? `OpenAlex ${r.query}: ${r.openalex.reason?.message || "请求失败"}`
            : "",
          r.pubmed.status === "rejected"
            ? `PubMed ${r.query}: ${r.pubmed.reason?.message || "请求失败"}`
            : "",
        ].filter(Boolean),
      ),
    );
  const status =
    requiredSources.every((source) => sources.includes(source)) &&
    errors.length === 0 &&
    visibleCount >= 200
      ? "done"
      : "partial";
  const detail = JSON.stringify({
    fetched: papers.length,
    visibleCount,
    target: "200–500",
    sources,
    errors,
  });
  await db
    .insert(jobs)
    .values({ id, status, updatedAt: new Date().toISOString(), detail })
    .onConflictDoUpdate({
      target: jobs.id,
      set: { status, updatedAt: new Date().toISOString(), detail },
    });
  return { status, count: visibleCount, fetched: papers.length, detail };
}
