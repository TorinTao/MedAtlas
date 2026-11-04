import type { Paper } from "../../shared/models";
export const RESEARCH_SCOPE_KEY = "medatlas-research-scope-v1";
export type ResearchScope = { query: string; paperIds: string[] };
export function parseResearchScope(raw: string | null): ResearchScope | null {
  try {
    const value: unknown = JSON.parse(raw || "null");
    if (!value || typeof value !== "object") return null;
    const { query, paperIds } = value as ResearchScope;
    if (
      typeof query !== "string" ||
      query.trim().length < 4 ||
      query.length > 180 ||
      !Array.isArray(paperIds) ||
      !paperIds.length ||
      paperIds.length > 500 ||
      !paperIds.every(
        (id) => typeof id === "string" && id.length > 0 && id.length <= 180,
      )
    )
      return null;
    return { query: query.trim(), paperIds: [...new Set(paperIds)] };
  } catch {
    return null;
  }
}
export function papersInScope(
  papers: Paper[],
  scope: ResearchScope | null,
): Paper[] {
  if (!scope) return papers;
  const ids = new Set(scope.paperIds);
  return papers.filter((p) => ids.has(p.id));
}
