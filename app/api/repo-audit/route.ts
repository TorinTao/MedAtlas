import { auditRepository } from "../../../lib/repo-audit";
import { findPaper, jsonError, takeQuota } from "../../../lib/store";

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({}));
  const repoUrl = String(body.repoUrl || "").slice(0, 300); const paperId = String(body.paperId || "");
  if (!repoUrl) return jsonError("请输入仓库链接");
  if (!await takeQuota(request, "repo", 24)) return jsonError("今日仓库审核次数已用完", 429);
  const paper = paperId ? await findPaper(paperId) : undefined;
  try { return Response.json({ audit: await auditRepository(repoUrl, paper?.repoUrl) }); }
  catch (error) { return jsonError((error as Error).message, 502); }
}
