import { auditRepository } from "../../../lib/repo-audit";
import { evaluateRepository } from "../../../lib/repo-evaluation";
import { findPaper, jsonError, takeQuota } from "../../../lib/store";

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({}));
  const repoUrl = String(body.repoUrl || "").slice(0, 300); const paperId = String(body.paperId || "");
  if (!repoUrl) return jsonError("请输入仓库链接");
  if (!await takeQuota(request, "repo", 12)) return jsonError("今日仓库评价次数已用完", 429);
  const paper = paperId ? await findPaper(paperId) : undefined;
  try {
    const audit = await auditRepository(repoUrl, paper?.repoUrl, paper?.repoEvidenceUrl);
    try { audit.evaluation = await evaluateRepository(audit, paper); }
    catch (error) { audit.evaluationError = (error as Error).message; }
    return Response.json({ audit });
  }
  catch (error) { return jsonError((error as Error).message, 502); }
}
