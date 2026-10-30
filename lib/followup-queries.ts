export type FollowupQuery = { query: string; purpose: string };

export function normalizeFollowupQueries(value: unknown): FollowupQuery[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    const query = typeof item?.query === "string" ? item.query.replace(/\s+/g, " ").trim() : "";
    const purpose = typeof item?.purpose === "string" ? item.purpose.trim().slice(0, 60) : "";
    const key = query.toLowerCase();
    if (query.length < 12 || query.length > 140 || !/[a-z]{4}/i.test(query) || /https?:\/\/|[\r\n<>]/i.test(query) || seen.has(key)) return [];
    seen.add(key);
    return [{ query, purpose: purpose || "相近工作核验" }];
  }).slice(0, 3);
}
