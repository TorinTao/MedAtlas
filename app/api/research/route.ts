import { collectPapers, englishQuery } from "../../../lib/collect";
import { allPapers, jsonError, putPapers, takeQuota } from "../../../lib/store";

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({})); const query = String(body.query || "").trim().slice(0, 180);
  if (query.length < 4) return jsonError("请输入至少 4 个字符的研究方向");
  if (!await takeQuota(request, "research", 12)) return jsonError("今日公开检索次数已用完，请明天再试", 429);
  const result = await collectPapers(query);
  if (!result.papers.length) return jsonError(`暂未检索到论文。${result.errors.join("；")}`, 502);
  try { await putPapers(result.papers); } catch { /* return live results even when storage is temporarily unavailable */ }
  const terms = [...new Set((englishQuery(query).toLowerCase().match(/[a-z0-9]+/g) || []).filter(term => term.length > 2))];
  const papers = (await allPapers()).map(paper => {
    const text = `${paper.title} ${paper.abstract}`.toLowerCase();
    const matched = terms.filter(term => text.includes(term)).length;
    return { ...paper, relevance: Math.min(1, 0.18 + 0.82 * matched / Math.max(terms.length, 1)) };
  });
  return Response.json({ query, papers, matchingCount: result.papers.length, sources: result.sources, warnings: result.errors, fetchedAt: new Date().toISOString() });
}
