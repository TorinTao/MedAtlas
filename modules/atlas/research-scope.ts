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

export const RESEARCH_HISTORY_KEY = "medatlas-research-history-v1";
export type ResearchDirection = ResearchScope & { updatedAt: string };
export const directionKey = (query: string) =>
  query.trim().replace(/\s+/g, " ").toLowerCase();
export function parseDirectionHistory(raw: string | null): ResearchDirection[] {
  try {
    const values: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(values)) return [];
    return mergeDirectionHistory(
      values.flatMap((value) => {
        const scope = parseResearchScope(JSON.stringify(value));
        if (!scope) return [];
        const updatedAt =
          typeof value.updatedAt === "string" &&
          Number.isFinite(Date.parse(value.updatedAt))
            ? value.updatedAt
            : new Date(0).toISOString();
        return [{ ...scope, updatedAt }];
      }),
    );
  } catch {
    return [];
  }
}
export function mergeDirectionHistory(
  ...groups: ResearchDirection[][]
): ResearchDirection[] {
  const byQuery = new Map<string, ResearchDirection>();
  for (const entry of groups.flat()) {
    const key = directionKey(entry.query),
      previous = byQuery.get(key);
    if (
      !previous ||
      Date.parse(entry.updatedAt) >= Date.parse(previous.updatedAt)
    )
      byQuery.set(key, entry);
  }
  return [...byQuery.values()].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}
