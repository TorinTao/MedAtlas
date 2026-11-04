import { makeResearchFocus } from "../../../composition/research";
import { dedupePapers } from "../../../modules/catalog/papers";
import { collectPapers, englishQuery } from "../../../composition/catalog";
import {
  allPapers,
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
  let searchQuery = englishQuery(query);
  const planningWarnings: string[] = [];
  if (/[\u3400-\u9fff]/.test(searchQuery)) {
    try {
      searchQuery = (await makeResearchFocus(query)).searchQuery;
    } catch {
      return jsonError(
        "研究方向暂未成功转换为英文检索式，请重试或使用英文关键词",
        503,
      );
    }
  }
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
  const stored = await allPapers();
  const papers = dedupePapers([...result.papers, ...stored])
    .slice(0, 500)
    .map((paper) => {
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
    papers,
    matchingCount: result.papers.length,
    lexmountCount: result.papers.filter(
      (paper) => paper.discovery?.method === "Lexmount Web Fetch",
    ).length,
    sources: result.sources,
    warnings: [...planningWarnings, ...result.errors],
    fetchedAt: new Date().toISOString(),
  });
}
