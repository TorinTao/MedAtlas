import { createResearchSearch } from "../../../modules/catalog/research-search";
import { makeResearchFocus } from "../../../composition/research";
import { collectPapers } from "../../../composition/catalog";
import { jsonError, putPapers } from "../../../platform/storage/papers";

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({}));
  const query = String(body.query || "")
    .trim()
    .slice(0, 180);
  if (query.length < 4) return jsonError("请输入至少 4 个字符的研究方向");
  const planningWarnings: string[] = [];
  let focus;
  try {
    focus = await makeResearchFocus(query);
  } catch {
    return jsonError("研究方向解析失败，请重试；此前的星图未切换", 503);
  }
  const searchQuery = focus.searchQuery;
  const result = await createResearchSearch(collectPapers)(query, focus);
  if (!result.papers.length)
    return Response.json(
      {
        error:
          "已尝试多路外部检索，但本轮没有同时通过 Lexmount 核验与主题筛选的论文；此前星图已保留。可展开检索详情查看各路径结果。",
        diagnostics: result.diagnostics,
        warnings: result.errors,
      },
      { status: 502 },
    );
  try {
    await putPapers(result.papers);
  } catch {
    planningWarnings.push("本次结果已获取，但暂未保存到文献库");
  }
  const terms = [
    ...new Set(
      (searchQuery.toLowerCase().match(/[a-z0-9]+/g) || []).filter(
        (term) => term.length > 2,
      ),
    ),
  ];
  const papers = result.papers.map((paper) => {
    const text = `${paper.title} ${paper.abstract}`.toLowerCase();
    const matched = terms.filter((term) => text.includes(term)).length;
    return {
      ...paper,
      relevance: Math.min(
        1,
        0.18 + (0.82 * matched) / Math.max(terms.length, 1),
      ),
    };
  });
  return Response.json({
    query,
    searchQuery,
    strategy: "lexmount-first",
    origin: "external-search",
    diagnostics: result.diagnostics,
    papers,
    matchingCount: papers.length,
    lexmountCount: papers.filter(
      (paper) => paper.discovery?.method === "Lexmount Web Fetch",
    ).length,
    sources: result.sources,
    warnings: [
      ...planningWarnings,
      ...result.errors,
      ...(papers.length < 10
        ? [
            "本轮已完成多路外部检索，但通过核验且匹配主题的论文仍较少；这不代表该领域只有这些文献。",
          ]
        : []),
    ],
    fetchedAt: new Date().toISOString(),
  });
}
