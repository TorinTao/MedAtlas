import { findPaper, jsonError, putPapers, takeQuota } from "../../../../../lib/store";
import { readPaper } from "../../../../../lib/reading";
import { runtime } from "../../../../../lib/runtime";
import { hasDeepSeekKey } from "../../../../../lib/user-api-key";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = await findPaper(id); if (!paper) return jsonError("论文不存在", 404);
  if (paper.analysis) return Response.json({ paper, analysis: paper.analysis, cached: true, lexmountUsed: false, errors: [] });
  if (!runtime("LEXMOUNT_API_KEY") || !runtime("LEXMOUNT_PROJECT_ID")) return jsonError("Lexmount Web Fetch 服务端凭据尚未配置", 503);
  if (!await hasDeepSeekKey()) return jsonError("DeepSeek API 尚未配置，请在 AI 设置中添加个人 Key", 503);
  if (!await takeQuota(request, "read", 18)) return jsonError("今日精读次数已用完", 429);
  const result = await readPaper(paper);
  const updated = { ...paper, fulltextStatus: result.depth === "全文" ? "全文可用" as const : "仅摘要" as const, ...(result.analysis ? { analysis: result.analysis } : {}) };
  try { await putPapers([updated]); } catch { /* still return the result */ }
  return Response.json({ paper: updated, ...result });
}
