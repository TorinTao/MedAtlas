import type { Paper } from "../../shared/models";
import { dedupePapers } from "./papers";
import {
  classifyLiteraturePaper,
  planLiteratureSearch,
  type LiteratureRole,
  type SearchFocus,
} from "./search-plan";
import type { CatalogResult } from "./lex-first";
export type SearchDiagnostics = {
  queries: {
    query: string;
    role: LiteratureRole;
    candidates: number;
    accepted: number;
    status: "ok" | "empty" | "failed";
  }[];
  description: string;
  matched: number;
  roles: Record<LiteratureRole, number>;
};
type Collect = (
  query: string,
  breadth: "query" | "corpus",
  accepts: (p: Paper) => boolean,
) => Promise<CatalogResult>;
const roleLimits: Record<LiteratureRole, number> = {
  核心研究: 100,
  历史脉络: 28,
  邻近研究: 36,
  跨领域启发: 18,
};
const roles: LiteratureRole[] = [
  "核心研究",
  "历史脉络",
  "邻近研究",
  "跨领域启发",
];
export function createResearchSearch(collect: Collect) {
  return async function search(query: string, focus: SearchFocus) {
    const plan = planLiteratureSearch(query, focus);
    const papers: Paper[] = [],
      sources = new Set<string>(),
      errors: string[] = [];
    const paths: SearchDiagnostics["queries"] = [];
    // Keep the original focused paths first, then broaden to historical and
    // transferable work without submitting every source request at once.
    for (const group of [plan.paths.slice(0, 4), plan.paths.slice(4)]) {
      const results = await Promise.allSettled(
        group.map((path) =>
          collect(
            path.query,
            "corpus",
            (paper) => classifyLiteraturePaper(paper, plan) === path.role,
          ),
        ),
      );
      results.forEach((result, index) => {
        const path = group[index];
        if (result.status === "rejected") {
          paths.push({
            query: path.query,
            role: path.role,
            candidates: 0,
            accepted: 0,
            status: "failed",
          });
          errors.push(
            `${path.query}: ${result.reason instanceof Error ? result.reason.message : "检索失败"}`,
          );
          return;
        }
        const accepted = result.value.papers.filter(
          (paper) => classifyLiteraturePaper(paper, plan) === path.role,
        );
        papers.push(...accepted);
        result.value.sources.forEach((source) => sources.add(source));
        errors.push(...result.value.errors);
        paths.push({
          query: path.query,
          role: path.role,
          candidates: result.value.candidateCount ?? result.value.papers.length,
          accepted: accepted.length,
          status: accepted.length ? "ok" : "empty",
        });
      });
    }
    const unique = dedupePapers(papers);
    const selected: Paper[] = [];
    const paperRoles: Record<string, LiteratureRole> = {};
    const roleCounts = Object.fromEntries(
      roles.map((role) => [role, 0]),
    ) as Record<LiteratureRole, number>;
    for (const role of roles) {
      const candidates = unique
        .filter((paper) => classifyLiteraturePaper(paper, plan) === role)
        .sort(
          (a, b) =>
            b.relevance - a.relevance || b.citedByCount - a.citedByCount,
        );
      for (const paper of candidates.slice(0, roleLimits[role])) {
        selected.push(paper);
        paperRoles[paper.id] = role;
        roleCounts[role]++;
      }
    }
    return {
      papers: selected,
      paperRoles,
      sources: [...sources],
      errors: [...new Set(errors)],
      diagnostics: {
        queries: paths,
        description: plan.description,
        matched: selected.length,
        roles: roleCounts,
      },
    };
  };
}
