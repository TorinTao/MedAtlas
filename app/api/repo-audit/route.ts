import {  auditRepository  } from "../../../composition/repositories";
import {  evaluateRepository  } from "../../../composition/repositories";
import {  inspectPaperRepository  } from "../../../composition/repositories";
import { findPaper, jsonError, takeQuota } from "../../../platform/storage/papers";

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({}));
  const repoUrl = String(body.repoUrl || "").slice(0, 300); const paperId = String(body.paperId || "");
  if (!repoUrl && !paperId) return jsonError("请选择论文或输入仓库链接");
  if (!await takeQuota(request, "repo", 12)) return jsonError("今日仓库评价次数已用完", 429);
  const paper = paperId ? await findPaper(paperId) : undefined;
  if (paperId && !paper) return jsonError("论文不存在", 404);
  try {
    if (!repoUrl && paper) {
      const updated = await inspectPaperRepository(paper, body.refresh === true);
      return Response.json({ paper: updated, audit: updated.repoAudit || null, discovery: updated.repoDiscovery || null });
    }
    const audit = await auditRepository(repoUrl, paper?.repoUrl, paper?.repoEvidenceUrl);
    try { audit.evaluation = await evaluateRepository(audit, paper); }
    catch (error) { audit.evaluationError = (error as Error).message; }
    return Response.json({ audit });
  }
  catch (error) { return jsonError((error as Error).message, 502); }
}
