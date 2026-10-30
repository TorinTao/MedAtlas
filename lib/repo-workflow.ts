import { auditRepository } from "./repo-audit";
import { discoverPaperRepository } from "./repo-discovery";
import { evaluateRepository } from "./repo-evaluation";
import { putPapers } from "./store";
import type { Paper } from "./types";

export async function inspectPaperRepository(paper: Paper, force = false): Promise<Paper> {
  let updated = paper;
  const stale = !paper.repoDiscovery || Date.now() - Date.parse(paper.repoDiscovery.checkedAt) > 7 * 86400000;
  if (force || stale) {
    try {
      const discovery = await discoverPaperRepository(paper);
      updated = { ...updated, repoDiscovery: discovery };
      if (discovery.repoUrl) updated = { ...updated, repoUrl: discovery.repoUrl, repoEvidenceUrl: discovery.sourceUrl };
      await putPapers([updated]);
    } catch (error) { if (!paper.repoUrl) throw error; }
  }
  if (!updated.repoUrl) return updated;
  const lowEvidence = updated.repoAudit?.checks.slice(1).every(check => check.status === "无法确认");
  const audit = !force && !lowEvidence && updated.repoAudit?.repoUrl.toLowerCase() === updated.repoUrl.toLowerCase()
    ? updated.repoAudit
    : await auditRepository(updated.repoUrl, updated.repoEvidenceUrl ? updated.repoUrl : "", updated.repoEvidenceUrl || "");
  if (!audit.evaluation && !audit.evaluationError?.includes("404")) {
    try { audit.evaluation = await evaluateRepository(audit, updated); delete audit.evaluationError; }
    catch (error) { audit.evaluationError = (error as Error).message; }
  }
  updated = { ...updated, repoAudit: audit };
  await putPapers([updated]);
  return updated;
}
