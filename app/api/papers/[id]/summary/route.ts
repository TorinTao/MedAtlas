import { hasDeepSeekKey } from "../../../../../lib/user-api-key";
import { findPaper, jsonError, putPapers, takeQuota } from "../../../../../lib/store";
import { summarizePaperZh } from "../../../../../lib/summary";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = await findPaper(id);
  if (!paper) return jsonError("论文不存在", 404);
  if (paper.summaryZh) return Response.json({ paper, cached: true });
  if (!await hasDeepSeekKey()) return jsonError("中文概述服务尚未配置，请在 AI 设置中添加个人 Key", 503);
  if (!await takeQuota(request, "summary", 50)) return jsonError("今日中文概述次数已用完", 429);
  try {
    const summary = await summarizePaperZh(paper);
    const updated = { ...paper, ...summary };
    await putPapers([updated]);
    return Response.json({ paper: updated, cached: false });
  } catch (error) { return jsonError((error as Error).message, 503); }
}
