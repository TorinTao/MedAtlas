import { hasDeepSeekKey } from "../../../../../lib/user-api-key";
import { findPaper, jsonError, putPapers, takeQuota } from "../../../../../lib/store";
import { translateAbstractZh } from "../../../../../lib/summary";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = await findPaper(id);
  if (!paper) return jsonError("论文不存在", 404);
  if (!paper.abstract.trim()) return jsonError("当前来源未提供摘要", 404);
  if (paper.abstractZh || paper.reviewAbstractZh) return Response.json({ paper, cached: true });
  if (!await hasDeepSeekKey()) return jsonError("摘要翻译服务尚未配置，请在 AI 设置中添加个人 Key", 503);
  if (!await takeQuota(request, "abstract-translation", 60)) return jsonError("今日摘要翻译次数已用完", 429);
  try {
    const translation = await translateAbstractZh(paper);
    const updated = { ...paper, ...translation };
    await putPapers([updated]);
    return Response.json({ paper: updated, cached: false });
  } catch (error) { return jsonError((error as Error).message, 503); }
}
