import { findPaper, jsonError, putPapers, takeQuota } from "../../../../../lib/store";
import { readPaper } from "../../../../../lib/reading";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = await findPaper(id); if (!paper) return jsonError("论文不存在", 404);
  if (paper.analysis) return Response.json({ paper, analysis: paper.analysis, cached: true, lexmountUsed: false, errors: [] });
  if (!await takeQuota(request, "read", 18)) return jsonError("今日精读次数已用完", 429);
  const result = await readPaper(paper);
  const updated = { ...paper, fulltextStatus: result.depth === "全文" ? "全文可用" as const : "仅摘要" as const, ...(result.analysis ? { analysis: result.analysis } : {}) };
  try { await putPapers([updated]); } catch { /* still return the result */ }
  return Response.json({ paper: updated, ...result });
}
