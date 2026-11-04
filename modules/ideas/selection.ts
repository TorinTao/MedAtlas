import type { Paper, ResearchRole } from "../../shared/models";
export type ResearchFocus = {
  searchQuery: string;
  conceptGroups: string[][];
};
const genericWords = new Set([
  "medical",
  "clinical",
  "ai",
  "study",
  "studies",
  "research",
  "method",
  "methods",
  "model",
  "models",
  "health",
  "healthcare",
  "patient",
  "patients",
  "artificial",
  "intelligence",
]);
const plainEnglish = /^[a-z0-9][a-z0-9 '-]*$/i;
const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
const isSpecific = (value: string) =>
  normalizeText(value)
    .split(" ")
    .some((word) => /[a-z]/.test(word) && !genericWords.has(word));
/** Every group is required; its members are alternative English terms for one concept. */
export function normalizeResearchFocus(raw: unknown): ResearchFocus {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("研究检索概念无效，请重新调研");
  const value = raw as Record<string, unknown>;
  if (
    typeof value.searchQuery !== "string" ||
    /[\x00-\x1f\x7f]/.test(value.searchQuery)
  )
    throw new Error("研究检索式必须是英文检索词");
  const searchQuery = value.searchQuery.trim().replace(/ +/g, " ");
  if (
    searchQuery.length < 12 ||
    searchQuery.length > 180 ||
    !plainEnglish.test(searchQuery) ||
    !/[a-z]{3}/i.test(searchQuery) ||
    !isSpecific(searchQuery)
  )
    throw new Error("研究检索式需包含 12–180 个字符的具体英文检索词");
  if (
    !Array.isArray(value.conceptGroups) ||
    value.conceptGroups.length < 1 ||
    value.conceptGroups.length > 4
  )
    throw new Error("请提供 1–4 组具体研究概念");
  const conceptGroups = value.conceptGroups.map((group) => {
    if (!Array.isArray(group) || group.length < 1 || group.length > 6)
      throw new Error("每组研究概念需有 1–6 个英文同义词或短语");
    const terms = group.map((term) => {
      if (typeof term !== "string" || /[\x00-\x1f\x7f]/.test(term))
        throw new Error("研究概念需为英文词或短语");
      const normalized = term.trim().replace(/ +/g, " ").toLowerCase();
      if (
        normalized.length < 2 ||
        normalized.length > 80 ||
        !plainEnglish.test(normalized) ||
        !/[a-z]/.test(normalized)
      )
        throw new Error("研究概念需为具体英文词或短语");
      return normalized;
    });
    // A broad synonym such as "medical" must not let unrelated papers pass a specific group.
    const specific = [...new Set(terms.filter(isSpecific))];
    if (!specific.length)
      throw new Error("研究概念不能只有 medical、clinical、AI 等泛词");
    return specific;
  });
  return { searchQuery, conceptGroups };
}
export function selectEvidence(
  focus: ResearchFocus,
  corpus: Paper[],
  preferredIds: string[] = [],
  followupPapers: Paper[] = [],
  limit = 24,
): Paper[] {
  const normalized = normalizeResearchFocus(focus);
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 24;
  if (!count) return [];
  const groups = normalized.conceptGroups.map((group) =>
    group.map((term) => ` ${normalizeText(term)} `),
  );
  const preferred = new Set(preferredIds);
  const followedIds = new Set(followupPapers.map((paper) => paper.id));
  const followedTitles = new Set(
    followupPapers.map((paper) => normalizeText(paper.title)),
  );
  const year = new Date().getUTCFullYear();
  const scored = corpus
    .filter(
      (paper) =>
        paper.abstract.trim().length >= 100 &&
        Number.isInteger(paper.year) &&
        paper.year >= 2010 &&
        paper.year <= year,
    )
    .flatMap((paper) => {
      const title = ` ${normalizeText(paper.title)} `;
      const body = ` ${normalizeText(`${paper.title} ${paper.abstract}`)} `;
      if (!groups.every((group) => group.some((term) => body.includes(term))))
        return [];
      const titleMatches = groups.filter((group) =>
        group.some((term) => title.includes(term)),
      ).length;
      const followed =
        followedIds.has(paper.id) ||
        followedTitles.has(normalizeText(paper.title));
      const citations = Number.isFinite(paper.citedByCount)
        ? Math.max(0, paper.citedByCount)
        : 0;
      const score =
        titleMatches * 3 +
        (preferred.has(paper.id) ? 2 : 0) +
        (followed ? 1 : 0) +
        Math.min(1.5, Math.log1p(citations) / 6) +
        (paper.year >= year - 2 ? 0.5 : 0);
      return [{ paper, score }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.paper.year - a.paper.year ||
        a.paper.id.localeCompare(b.paper.id),
    );
  const byId = new Map<string, (typeof scored)[number]>();
  for (const item of scored)
    if (!byId.has(item.paper.id)) byId.set(item.paper.id, item);
  const unique = [...byId.values()];
  const selected = new Map<string, Paper>();
  const add = (list: typeof unique, quota: number) => {
    let added = 0;
    for (const item of list) {
      if (selected.size >= count || added >= quota) break;
      if (!selected.has(item.paper.id)) {
        selected.set(item.paper.id, item.paper);
        added++;
      }
    }
  };
  add(unique, 1);
  add(
    unique.filter((item) => item.paper.paperType === "综述"),
    Math.max(1, Math.floor(count / 6)),
  );
  add(
    unique.filter(
      (item) =>
        item.paper.paperType === "数据集" || item.paper.method === "评测与资源",
    ),
    Math.max(1, Math.floor(count / 8)),
  );
  add(
    [...unique].sort(
      (a, b) => a.paper.year - b.paper.year || b.score - a.score,
    ),
    Math.max(1, Math.floor(count / 8)),
  );
  add(
    unique.filter((item) => item.paper.year >= year - 2),
    Math.max(1, Math.floor(count / 3)),
  );
  add(unique, count);
  return [...selected.values()];
}

/** Include adjacent and historical work as context while keeping direct matches first. */
export function selectResearchContext(
  focus: ResearchFocus,
  corpus: Paper[],
  preferredIds: string[] = [],
  paperRoles: Record<string, ResearchRole> = {},
  discoveredIds: string[] = [],
  limit = 24,
): { papers: Paper[]; roles: Record<string, ResearchRole> } {
  const count = Math.max(0, Math.min(24, Math.floor(limit)));
  if (!count) return { papers: [], roles: {} };
  const groups = normalizeResearchFocus(focus).conceptGroups.map((group) =>
    group.map((term) => ` ${normalizeText(term)} `),
  );
  const preferred = new Set(preferredIds);
  const discovered = new Set(discoveredIds);
  const year = new Date().getUTCFullYear();
  const direct = selectEvidence(focus, corpus, preferredIds, [], count);
  const directIds = new Set(direct.map((paper) => paper.id));
  const candidates = corpus.flatMap((paper) => {
    if (
      paper.abstract.trim().length < 100 ||
      !Number.isInteger(paper.year) ||
      paper.year < 2000 ||
      paper.year > year ||
      directIds.has(paper.id)
    ) return [];
    const body = ` ${normalizeText(`${paper.title} ${paper.abstract}`)} `;
    const title = ` ${normalizeText(paper.title)} `;
    const matches = groups.filter((group) => group.some((term) => body.includes(term))).length;
    const role = paperRoles[paper.id];
    // The scope has already classified these papers. Otherwise a broad match
    // must come from this request's external search, never the entire archive.
    if (!role && (!discovered.has(paper.id) || !matches)) return [];
    const inferred: ResearchRole = role || (paper.paperType === "综述" || paper.year < year - 5 ? "历史脉络" : "邻近研究");
    const titleMatches = groups.filter((group) => group.some((term) => title.includes(term))).length;
    const score =
      (preferred.has(paper.id) ? 8 : 0) +
      (discovered.has(paper.id) ? 2 : 0) +
      titleMatches * 3 + matches +
      Math.min(2, Math.log1p(Math.max(0, paper.citedByCount || 0)) / 5);
    return [{ paper, role: inferred, score }];
  }).sort((a, b) => b.score - a.score || b.paper.year - a.paper.year);
  const result: Paper[] = [];
  const roles: Record<string, ResearchRole> = {};
  const add = (paper: Paper, role: ResearchRole) => {
    if (result.length >= count || roles[paper.id]) return;
    result.push(paper);
    roles[paper.id] = role;
  };
  // Preserve room for research history and nearby methods even when direct
  // matches are numerous; use the remaining capacity for strongest matches.
  for (const paper of direct.slice(0, Math.min(12, count)))
    add(paper, paperRoles[paper.id] || "核心研究");
  for (const role of ["历史脉络", "邻近研究", "跨领域启发"] as const)
    for (const item of candidates.filter((candidate) => candidate.role === role).slice(0, Math.max(2, Math.floor(count / 6))))
      add(item.paper, role);
  for (const paper of direct) add(paper, paperRoles[paper.id] || "核心研究");
  for (const item of candidates) add(item.paper, item.role);
  return { papers: result, roles };
}
