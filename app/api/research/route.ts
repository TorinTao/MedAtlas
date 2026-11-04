import { selectEvidence } from "../../../modules/ideas/selection";
import { makeResearchFocus } from "../../../composition/research";
import { dedupePapers } from "../../../modules/catalog/papers";
import { collectPapers } from "../../../composition/catalog";
import {
  jsonError,
  putPapers,
  takeQuota,
} from "../../../platform/storage/papers";

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({}));
  const query = String(body.query || "")
    .trim()
    .slice(0, 180);
  if (query.length < 4) return jsonError("请输入至少 4 个字符的研究方向");
  if (!(await takeQuota(request, "research", 12)))
    return jsonError("今日公开检索次数已用完，请明天再试", 429);
  const planningWarnings: string[] = [];
  let focus;
  try {
    focus = await makeResearchFocus(query);
  } catch {
    return jsonError("研究方向解析失败，请重试；此前的星图未切换", 503);
  }
  const searchQuery = focus.searchQuery;
  const result = await collectPapers(searchQuery);
  if (!result.papers.length)
    return jsonError(
      `本次未完成 Lexmount 论文发现或核验，请重试。${result.errors.join("；")}`,
      502,
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
  const papers = selectEvidence(
    focus,
    dedupePapers(result.papers),
    [],
    [],
    500,
  ).map((paper) => {
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
  if (!papers.length)
    return jsonError(
      "本次抓取成功，但没有匹配当前研究方向的论文；此前的星图未切换，请调整关键词",
      404,
    );
  return Response.json({
    query,
    searchQuery,
    strategy: "lexmount-first",
    origin: "external-search",
    papers,
    matchingCount: papers.length,
    lexmountCount: papers.filter(
      (paper) => paper.discovery?.method === "Lexmount Web Fetch",
    ).length,
    sources: result.sources,
    warnings: [...planningWarnings, ...result.errors],
    fetchedAt: new Date().toISOString(),
  });
}
