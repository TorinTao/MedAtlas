import type { Paper } from "../../shared/models";
import { dedupePapers } from "./papers";
import {
  matchesLiteraturePlan,
  planLiteratureSearch,
  type SearchFocus,
} from "./search-plan";
import type { CatalogResult } from "./lex-first";
export type SearchDiagnostics = {
  queries: {
    query: string;
    candidates: number;
    accepted: number;
    status: "ok" | "empty" | "failed";
  }[];
  description: string;
  matched: number;
};
type Collect = (
  query: string,
  breadth: "query" | "corpus",
  accepts: (p: Paper) => boolean,
) => Promise<CatalogResult>;
export function createResearchSearch(collect: Collect) {
  return async function search(query: string, focus: SearchFocus) {
    const plan = planLiteratureSearch(query, focus);
    const papers: Paper[] = [],
      sources = new Set<string>(),
      errors: string[] = [];
    const paths: {
      query: string;
      candidates: number;
      accepted: number;
      status: "ok" | "empty" | "failed";
    }[] = [];
    // Four short paths run concurrently. Each collector bounds candidate verification to nine pages.
    const results = await Promise.allSettled(
      plan.queries.map((q) =>
        collect(q, "corpus", (p) => matchesLiteraturePlan(p, plan)),
      ),
    );
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        paths.push({
          query: plan.queries[i],
          candidates: 0,
          accepted: 0,
          status: "failed",
        });
        errors.push(
          `${plan.queries[i]}: ${result.reason instanceof Error ? result.reason.message : "检索失败"}`,
        );
        return;
      }
      const accepted = result.value.papers.filter((p) =>
        matchesLiteraturePlan(p, plan),
      );
      papers.push(...accepted);
      result.value.sources.forEach((s) => sources.add(s));
      errors.push(...result.value.errors);
      paths.push({
        query: plan.queries[i],
        candidates: result.value.candidateCount ?? result.value.papers.length,
        accepted: accepted.length,
        status: accepted.length ? "ok" : "empty",
      });
    });
    return {
      papers: dedupePapers(papers),
      sources: [...sources],
      errors: [...new Set(errors)],
      diagnostics: {
        queries: paths,
        description: plan.description,
        matched: dedupePapers(papers).length,
      },
    };
  };
}
