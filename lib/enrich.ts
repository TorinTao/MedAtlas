import { env } from "cloudflare:workers";
import { auditRepository } from "./repo-audit";
import { evaluateRepository } from "./repo-evaluation";
import { lexmountExtract, readPaper } from "./reading";
import { runtime } from "./runtime";
import { allPapers, putPapers } from "./store";
import { summarizePaperZh, translateReviewAbstractZh } from "./summary";
import type { Paper } from "./types";

type JobRow = { id: string; status: string; updated_at: string };
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
const LEASE_MS = 10 * 60 * 1000;

function publicRepoLinks(text: string): string[] {
  const found = [...text.matchAll(/https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/gi)]
    .map(match => `https://github.com/${match[1]}/${match[2].replace(/\.git$/i, "")}`)
    .filter(url => !/https:\/\/github\.com\/(?:features|topics|orgs|settings|login|signup)\//i.test(url));
  return [...new Set(found)];
}

function chooseRepo(paper: Paper, pageText: string): string {
  const linked = publicRepoLinks(pageText);
  if (paper.repoUrl && linked.some(url => url.toLowerCase() === paper.repoUrl.replace(/\/$/, "").toLowerCase())) return linked.find(url => url.toLowerCase() === paper.repoUrl.replace(/\/$/, "").toLowerCase())!;
  return linked.length === 1 ? linked[0] : "";
}

async function claim(id: string, previous: JobRow | undefined): Promise<boolean> {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - (previous?.status === "running" ? LEASE_MS : RETRY_AFTER_MS)).toISOString();
  const result = await env.DB!.prepare(`INSERT INTO jobs (id,status,updated_at,detail) VALUES (?,'running',?,'')
    ON CONFLICT(id) DO UPDATE SET status='running', updated_at=excluded.updated_at
    WHERE jobs.updated_at < ? RETURNING id`).bind(id, now, cutoff).first();
  return Boolean(result);
}

async function finish(id: string, status: string, detail: object) {
  await env.DB!.prepare("UPDATE jobs SET status=?,updated_at=?,detail=? WHERE id=?")
    .bind(status, new Date().toISOString(), JSON.stringify(detail), id).run();
}

export async function enrichMissingPapers(limit = 2) {
  if (!env.DB) throw new Error("文献数据库不可用");
  if (!runtime("LEXMOUNT_API_KEY") || !runtime("LEXMOUNT_PROJECT_ID")) throw new Error("Lexmount Web Fetch 服务端凭据尚未配置");
  if (!runtime("DEEPSEEK_API_KEY")) throw new Error("DeepSeek API 尚未配置");

  const papers = await allPapers();
  const jobs = await env.DB.prepare("SELECT id,status,updated_at FROM jobs WHERE id LIKE 'enrich:%'").all<JobRow>();
  const byId = new Map((jobs.results || []).map(job => [job.id, job]));
  const pending = papers.filter(paper => !paper.summaryZh || !paper.analysis || (paper.paperType === "综述" && paper.abstract.trim() && !paper.reviewAbstractZh) || (paper.repoUrl && !paper.repoAudit?.evaluation))
    .sort((a, b) => Number(Boolean(byId.get(`enrich:${a.id}`))) - Number(Boolean(byId.get(`enrich:${b.id}`))) || b.citedByCount - a.citedByCount || b.year - a.year);
  const results: { id: string; status: string; summary: boolean; analysis: boolean; reviewTranslated: boolean; repo: string; errors: string[] }[] = [];

  for (const paper of pending) {
    if (results.length >= Math.max(1, Math.min(limit, 2))) break;
    const jobId = `enrich:${paper.id}`;
    if (!await claim(jobId, byId.get(jobId))) continue;
    const errors: string[] = [];
    let updated = paper;
    try {
      const target = paper.oaUrl && /^https:\/\/(?:www\.)?arxiv\.org\//i.test(paper.oaUrl) ? paper.oaUrl : paper.url || paper.oaUrl;
      if (!target) throw new Error("论文没有公开页面链接");
      const page = await lexmountExtract(target);
      if (!page.text.trim()) throw new Error("Lexmount 未返回可分析的公开页面文字");
      const [summary, reading, translation] = await Promise.allSettled([
        paper.summaryZh ? Promise.resolve(null) : summarizePaperZh(paper, { text: page.text, url: page.finalUrl }),
        paper.analysis ? Promise.resolve(null) : readPaper(paper, page),
        paper.paperType !== "综述" || !paper.abstract.trim() || paper.reviewAbstractZh ? Promise.resolve(null) : translateReviewAbstractZh(paper),
      ]);
      if (summary.status === "fulfilled" && summary.value) updated = { ...updated, ...summary.value };
      else if (summary.status === "rejected") errors.push(`概述：${summary.reason?.message || "生成失败"}`);
      if (reading.status === "fulfilled" && reading.value) {
        const value = reading.value;
        updated = { ...updated, ...(value.analysis ? { analysis: value.analysis } : {}), fulltextStatus: value.depth === "全文" ? "全文可用" : "仅摘要" };
        errors.push(...value.errors);
      } else if (reading.status === "rejected") errors.push(`精读：${reading.reason?.message || "生成失败"}`);
      if (translation.status === "fulfilled" && translation.value) updated = { ...updated, ...translation.value };
      else if (translation.status === "rejected") errors.push(`综述译文：${translation.reason?.message || "翻译失败"}`);

      const linkedRepo = chooseRepo(paper, page.text);
      const repoUrl = linkedRepo || paper.repoUrl;
      if (repoUrl) {
        try {
          const repoAudit = paper.repoAudit?.repoUrl === repoUrl ? paper.repoAudit : await auditRepository(repoUrl, linkedRepo, linkedRepo ? page.finalUrl : "");
          updated = { ...updated, repoUrl: repoAudit.repoUrl, repoAudit, ...(linkedRepo ? { repoEvidenceUrl: page.finalUrl } : {}) };
          if (!repoAudit.evaluation) updated.repoAudit = { ...repoAudit, evaluation: await evaluateRepository(repoAudit, updated) };
        } catch (error) { errors.push(`仓库：${(error as Error).message}`); }
      }
      await putPapers([updated]);
      const reviewTranslated = updated.paperType !== "综述" || !updated.abstract.trim() || Boolean(updated.reviewAbstractZh);
      const done = Boolean(updated.summaryZh && updated.analysis && reviewTranslated && (!repoUrl || updated.repoAudit?.evaluation));
      await finish(jobId, done ? "done" : "partial", { sourceUrl: page.finalUrl, repoUrl: updated.repoUrl || "", errors });
      results.push({ id: paper.id, status: done ? "done" : "partial", summary: Boolean(updated.summaryZh), analysis: Boolean(updated.analysis), reviewTranslated, repo: updated.repoUrl || "", errors });
    } catch (error) {
      errors.push((error as Error).message);
      await finish(jobId, "failed", { errors });
      results.push({ id: paper.id, status: "failed", summary: Boolean(updated.summaryZh), analysis: Boolean(updated.analysis), reviewTranslated: Boolean(updated.reviewAbstractZh), repo: updated.repoUrl || "", errors });
    }
  }
  return { processed: results.length, remaining: pending.length - results.filter(result => result.status === "done").length, results };
}
