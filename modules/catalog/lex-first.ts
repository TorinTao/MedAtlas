import type { Paper } from "../../shared/models";
import { dedupePapers } from "./papers";
export type CatalogResult = {
  papers: Paper[];
  sources: string[];
  errors: string[];
  candidateCount?: number;
};
type Search = (
  query: string,
  breadth?: "query" | "corpus",
) => Promise<CatalogResult>;
/** A current request must obtain Lexmount evidence; old stored tags never count. */
export function createLexFirstCatalog(deps: {
  primary: Search;
  fallback: Search;
  verify: (paper: Paper, query: string) => Promise<Paper>;
}) {
  async function collectPapers(
    query: string,
    breadth: "query" | "corpus" = "query",
    accepts: (paper: Paper) => boolean = () => true,
  ): Promise<CatalogResult> {
    const primary = await deps.primary(query, breadth);
    const relevantPrimary = primary.papers.filter(accepts);
    if (relevantPrimary.length >= 8)
      return {
        ...primary,
        papers: relevantPrimary,
        candidateCount: primary.papers.length,
      };
    const fallback = await deps.fallback(query, breadth);
    const known = new Set(relevantPrimary.map((p) => p.id));
    const candidates = dedupePapers(fallback.papers)
      .filter((p) => !known.has(p.id) && accepts(p))
      .slice(0, 9);
    const verified: Paper[] = [];
    const failures: string[] = [];
    for (let offset = 0; offset < candidates.length; offset += 3) {
      const batch = await Promise.allSettled(
        candidates.slice(offset, offset + 3).map((p) => deps.verify(p, query)),
      );
      batch.forEach((result, i) => {
        if (result.status === "fulfilled") verified.push(result.value);
        else
          failures.push(
            `${candidates[offset + i].id}: ${result.reason instanceof Error ? result.reason.message : "页面核验失败"}`,
          );
      });
    }
    return {
      candidateCount: dedupePapers([...primary.papers, ...fallback.papers])
        .length,
      papers: dedupePapers([...relevantPrimary, ...verified]),
      sources: [
        ...new Set([
          ...primary.sources,
          ...(verified.length
            ? ["Lexmount 论文页面核验", ...fallback.sources]
            : []),
        ]),
      ],
      errors: [
        ...primary.errors,
        ...fallback.errors,
        ...(failures.length
          ? [
              `Lexmount 有 ${failures.length} 个候选页面未通过核验：${failures.slice(0, 3).join("；")}`,
            ]
          : []),
      ],
    };
  }
  return { collectPapers };
}
