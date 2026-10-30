import { runtime } from "./runtime";
import type { RepoAudit, RepoCheck } from "./types";

export async function auditRepository(repoUrl: string, expectedRepoUrl = "", paperPageUrl = ""): Promise<RepoAudit> {
  const parsed = new URL(repoUrl); const segments = parsed.pathname.split("/").filter(Boolean);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || segments.length < 2 || !/^[\w.-]+$/.test(segments[0]) || !/^[\w.-]+$/.test(segments[1])) throw new Error("请输入公开 GitHub 仓库链接");
  const owner = segments[0], repo = segments[1].replace(/\.git$/, ""); const base = `https://api.github.com/repos/${owner}/${repo}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "MedAtlas-Research/1.0", "X-GitHub-Api-Version": "2022-11-28" };
  if (runtime("GITHUB_TOKEN")) headers.Authorization = `Bearer ${runtime("GITHUB_TOKEN")}`;
  const [metaResponse, filesResponse] = await Promise.all([fetch(base, { headers, signal: AbortSignal.timeout(10000) }), fetch(`${base}/contents`, { headers, signal: AbortSignal.timeout(10000) })]);
  const canonical = `https://github.com/${owner}/${repo}`;
  if (metaResponse.status === 403 || metaResponse.status === 404 || metaResponse.status === 429) {
    const labels = ["论文页面链接", "开源许可证", "README", "根目录依赖文件", "根目录数据说明", "根目录权重说明", "根目录训练/推理入口", "近期维护"];
    return { repoUrl: canonical, checkedAt: new Date().toISOString(), checks: labels.map(label => ({ label, status: "无法确认" as const, evidence: canonical })), disclaimer: `GitHub API 返回 ${metaResponse.status}，未能取得仓库元数据；请打开证据链接人工检查。未经实际运行复现。`, ...(metaResponse.status === 404 ? { evaluationError: "仓库链接返回 404，可能已迁移或未公开" } : {}) };
  }
  if (!metaResponse.ok) throw new Error(`GitHub HTTP ${metaResponse.status}`);
  const meta = await metaResponse.json() as any; const files = filesResponse.ok ? await filesResponse.json() as any[] : [];
  const rootFiles = Array.isArray(files) ? files.map(f => ({ name: String(f.name || "").toLowerCase(), url: String(f.html_url || "") })) : [];
  const match = (pattern: RegExp) => rootFiles.find(f => pattern.test(f.name));
  const check = (label: string, ok: boolean | null, evidence: string): RepoCheck => ({ label, status: ok === null ? "无法确认" : ok ? "有" : "缺失", evidence });
  const checks: RepoCheck[] = [
    check("论文页面链接", paperPageUrl && expectedRepoUrl.replace(/\/$/, "").toLowerCase() === canonical.toLowerCase() ? true : null, paperPageUrl || expectedRepoUrl || canonical),
    check("许可证文件", match(/^(licen[sc]e|copying)(\.|$)/) ? true : filesResponse.ok ? false : null, match(/^(licen[sc]e|copying)(\.|$)/)?.url || `${canonical}?tab=License-1`),
    check("README", filesResponse.ok ? Boolean(match(/^readme(\.|$)/)) : null, match(/^readme(\.|$)/)?.url || canonical),
    check("根目录依赖文件", match(/^(requirements.*\.txt|pyproject\.toml|environment\.ya?ml|package\.json|setup\.py|poetry\.lock)$/) ? true : null, match(/^(requirements.*\.txt|pyproject\.toml|environment\.ya?ml|package\.json|setup\.py|poetry\.lock)$/)?.url || canonical),
    check("根目录数据说明", match(/^(data|dataset|datasets|data\.md)$/) ? true : null, match(/^(data|dataset|datasets|data\.md)$/)?.url || canonical),
    check("根目录权重说明", match(/^(weights|checkpoints|models|model_card\.md)$/) ? true : null, match(/^(weights|checkpoints|models|model_card\.md)$/)?.url || canonical),
    check("根目录训练/推理入口", match(/^(train|training|infer|inference|predict|scripts|src)(\.|$)/) ? true : null, match(/^(train|training|infer|inference|predict|scripts|src)(\.|$)/)?.url || canonical),
    check("近期维护", meta.pushed_at ? Date.now() - new Date(meta.pushed_at).getTime() < 365 * 86400000 : null, `${canonical}/activity`),
  ];
  return { repoUrl: canonical, checkedAt: new Date().toISOString(), checks, disclaimer: "仅检查公开元数据和仓库根目录；未安装、运行或复现实验。缺失项不等于仓库完全没有该内容。" };
}
