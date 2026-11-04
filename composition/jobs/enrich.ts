import { env } from "cloudflare:workers";
import { auditRepository } from "../repositories";
import { evaluateRepository } from "../repositories";
import { inspectPaperRepository } from "../repositories";
import { lexmountExtract } from "../providers";
import { readPaper } from "../research";
import { runtime } from "../../platform/config";
import {
  allPapers,
  allPapersForEnrichment,
  findPaper,
  putPapers,
} from "../../platform/storage/papers";
import { summarizePaperZh, translateAbstractZh } from "../research";
import { needsGeneratedSummary } from "../../modules/catalog/summary-fallback";
import { fetchPubMedAbstracts } from "../../platform/sources/publications";
import type { Paper } from "../../shared/models";
type JobRow = {
  id: string;
  status: string;
  updated_at: string;
};
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
const LEASE_MS = 10 * 60 * 1000;
function needsPubMedAbstract(paper: Paper): boolean {
  return (
    !paper.analysis &&
    !paper.abstract.trim() &&
    paper.source === "PubMed" &&
    /^\d{1,12}$/.test(paper.pmid)
  );
}
function publicRepoLinks(text: string): string[] {
  const found = [
    ...text.matchAll(/https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/gi),
  ]
    .map(
      (match) =>
        `https://github.com/${match[1]}/${match[2].replace(/\.git$/i, "")}`,
    )
    .filter(
      (url) =>
        !/https:\/\/github\.com\/(?:features|topics|orgs|settings|login|signup)\//i.test(
          url,
        ),
    );
  return [...new Set(found)];
}
function chooseRepo(paper: Paper, pageText: string): string {
  const linked = publicRepoLinks(pageText);
  if (
    paper.repoUrl &&
    linked.some(
      (url) =>
        url.toLowerCase() === paper.repoUrl.replace(/\/$/, "").toLowerCase(),
    )
  )
    return linked.find(
      (url) =>
        url.toLowerCase() === paper.repoUrl.replace(/\/$/, "").toLowerCase(),
    )!;
  return linked.length === 1 ? linked[0] : "";
}
async function claim(
  id: string,
  previous: JobRow | undefined,
): Promise<boolean> {
  const now = new Date().toISOString();
  const cutoff = new Date(
    Date.now() - (previous?.status === "running" ? LEASE_MS : RETRY_AFTER_MS),
  ).toISOString();
  const result = await env
    .DB!.prepare(
      `INSERT INTO jobs (id,status,updated_at,detail) VALUES (?,'running',?,'')
    ON CONFLICT(id) DO UPDATE SET status='running', updated_at=excluded.updated_at
    WHERE jobs.updated_at < ? RETURNING id`,
    )
    .bind(id, now, cutoff)
    .first();
  return Boolean(result);
}
async function finish(id: string, status: string, detail: object) {
  await env
    .DB!.prepare("UPDATE jobs SET status=?,updated_at=?,detail=? WHERE id=?")
    .bind(status, new Date().toISOString(), JSON.stringify(detail), id)
    .run();
}
export async function enrichMissingPapers(limit = 2) {
  if (!env.DB) throw new Error("文献数据库不可用");
  if (!runtime("LEXMOUNT_API_KEY") || !runtime("LEXMOUNT_PROJECT_ID"))
    throw new Error("Lexmount Web Fetch 服务端凭据尚未配置");
  if (!runtime("DEEPSEEK_API_KEY")) throw new Error("DeepSeek API 尚未配置");
  let papers = await allPapersForEnrichment();
  let abstractsRecovered = 0;
  let abstractBackfillError = "";
  const abstractJobs = await env.DB.prepare(
    "SELECT id,status,updated_at FROM jobs WHERE id LIKE 'abstract:%'",
  ).all<JobRow>();
  const abstractJobsById = new Map(
    (abstractJobs.results || []).map((job) => [job.id, job]),
  );
  const missingPubMedAbstracts = papers.filter(needsPubMedAbstract);
  const claimedAbstracts: typeof missingPubMedAbstracts = [];
  for (const paper of missingPubMedAbstracts) {
    if (claimedAbstracts.length >= 8) break;
    const jobId = `abstract:${paper.id}`;
    if (await claim(jobId, abstractJobsById.get(jobId)))
      claimedAbstracts.push(paper);
  }
  if (claimedAbstracts.length) {
    try {
      const abstracts = await fetchPubMedAbstracts(
        claimedAbstracts.map((paper) => paper.pmid),
      );
      const recovered = claimedAbstracts
        .filter((paper) => abstracts.has(paper.pmid))
        .map((paper) => ({ ...paper, abstract: abstracts.get(paper.pmid)! }));
      if (recovered.length) {
        await putPapers(recovered);
        abstractsRecovered = recovered.length;
        const byId = new Map(recovered.map((paper) => [paper.id, paper]));
        papers = papers.map((paper) => byId.get(paper.id) || paper);
      }
      for (const paper of claimedAbstracts)
        await finish(
          `abstract:${paper.id}`,
          abstracts.has(paper.pmid) ? "done" : "partial",
          { sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/` },
        );
    } catch (error) {
      abstractBackfillError = (error as Error).message;
      for (const paper of claimedAbstracts)
        await finish(`abstract:${paper.id}`, "failed", {
          error: abstractBackfillError,
        });
    }
  }
  const jobs = await env.DB.prepare(
    "SELECT id,status,updated_at FROM jobs WHERE id LIKE 'enrich:%'",
  ).all<JobRow>();
  const byId = new Map((jobs.results || []).map((job) => [job.id, job]));
  const abstractStatuses = await env.DB.prepare(
    "SELECT id,status,updated_at FROM jobs WHERE id LIKE 'abstract:%'",
  ).all<JobRow>();
  const abstractStatusById = new Map(
    (abstractStatuses.results || []).map((job) => [job.id, job.status]),
  );
  const pending = papers
    .filter(
      (paper) =>
        // Wait for another worker's PubMed abstract claim before attempting
        // reading. Failed/partial abstract jobs may still have open full text.
        (!needsPubMedAbstract(paper) ||
          ["failed", "partial"].includes(
            abstractStatusById.get(`abstract:${paper.id}`) || "",
          )) &&
        (needsGeneratedSummary(paper) ||
          !paper.analysis ||
          (paper.abstract.trim() &&
            !paper.abstractZh &&
            !paper.reviewAbstractZh) ||
          (paper.repoUrl && !paper.repoAudit?.evaluation)),
    )
    .sort(
      (a, b) =>
        Number(Boolean(byId.get(`enrich:${a.id}`))) -
          Number(Boolean(byId.get(`enrich:${b.id}`))) ||
        Number(Boolean(a.analysis)) - Number(Boolean(b.analysis)) ||
        Number(Boolean(b.abstract.trim())) -
          Number(Boolean(a.abstract.trim())) ||
        b.citedByCount - a.citedByCount ||
        b.year - a.year,
    );
  const results: {
    id: string;
    status: string;
    summary: boolean;
    analysis: boolean;
    reviewTranslated: boolean;
    repo: string;
    errors: string[];
  }[] = [];
  for (const paper of pending) {
    if (results.length >= Math.max(1, Math.min(limit, 2))) break;
    const jobId = `enrich:${paper.id}`;
    if (!(await claim(jobId, byId.get(jobId)))) continue;
    const errors: string[] = [];
    let updated = paper;
    try {
      const target =
        paper.oaUrl && /^https:\/\/(?:www\.)?arxiv\.org\//i.test(paper.oaUrl)
          ? paper.oaUrl
          : paper.url || paper.oaUrl;
      const page = target
        ? await lexmountExtract(target).catch((error) => {
            errors.push(`公开页面：${(error as Error).message}`);
            return null;
          })
        : null;
      if (!page && !paper.abstract.trim())
        errors.push("论文暂无可分析的公开摘要或页面文字");
      const [summary, reading, translation] = await Promise.allSettled([
        !needsGeneratedSummary(paper)
          ? Promise.resolve(null)
          : summarizePaperZh(
              paper,
              page ? { text: page.text, url: page.finalUrl } : undefined,
            ),
        paper.analysis
          ? Promise.resolve(null)
          : readPaper(paper, page || undefined, !page),
        !paper.abstract.trim() || paper.abstractZh || paper.reviewAbstractZh
          ? Promise.resolve(null)
          : translateAbstractZh(paper),
      ]);
      if (summary.status === "fulfilled" && summary.value)
        updated = { ...updated, ...summary.value };
      else if (summary.status === "rejected")
        errors.push(`概述：${summary.reason?.message || "生成失败"}`);
      if (reading.status === "fulfilled" && reading.value) {
        const value = reading.value;
        updated = {
          ...updated,
          ...(value.analysis ? { analysis: value.analysis } : {}),
          fulltextStatus: value.depth === "全文" ? "全文可用" : "仅摘要",
        };
        errors.push(...value.errors);
      } else if (reading.status === "rejected")
        errors.push(`精读：${reading.reason?.message || "生成失败"}`);
      if (translation.status === "fulfilled" && translation.value)
        updated = { ...updated, ...translation.value };
      else if (translation.status === "rejected")
        errors.push(`摘要译文：${translation.reason?.message || "翻译失败"}`);
      const linkedRepo = page ? chooseRepo(paper, page.text) : "";
      const repoUrl = linkedRepo || paper.repoUrl;
      if (repoUrl) {
        try {
          const repoAudit =
            paper.repoAudit?.repoUrl === repoUrl
              ? paper.repoAudit
              : await auditRepository(
                  repoUrl,
                  linkedRepo,
                  linkedRepo && page ? page.finalUrl : "",
                );
          updated = {
            ...updated,
            repoUrl: repoAudit.repoUrl,
            repoAudit,
            ...(linkedRepo && page ? { repoEvidenceUrl: page.finalUrl } : {}),
          };
          if (!repoAudit.evaluation)
            updated.repoAudit = {
              ...repoAudit,
              evaluation: await evaluateRepository(repoAudit, updated),
            };
        } catch (error) {
          errors.push(`仓库：${(error as Error).message}`);
        }
      }
      await putPapers([updated]);
      const reviewTranslated =
        !updated.abstract.trim() ||
        Boolean(updated.abstractZh || updated.reviewAbstractZh);
      const done = Boolean(
        !needsGeneratedSummary(updated) &&
          updated.analysis &&
          reviewTranslated &&
          (!repoUrl || updated.repoAudit?.evaluation),
      );
      await finish(jobId, done ? "done" : "partial", {
        sourceUrl: page?.finalUrl || target || "",
        repoUrl: updated.repoUrl || "",
        errors,
      });
      results.push({
        id: paper.id,
        status: done ? "done" : "partial",
        summary: Boolean(updated.summaryZh),
        analysis: Boolean(updated.analysis),
        reviewTranslated,
        repo: updated.repoUrl || "",
        errors,
      });
    } catch (error) {
      errors.push((error as Error).message);
      await finish(jobId, "failed", { errors });
      results.push({
        id: paper.id,
        status: "failed",
        summary: Boolean(updated.summaryZh),
        analysis: Boolean(updated.analysis),
        reviewTranslated: Boolean(
          updated.abstractZh || updated.reviewAbstractZh,
        ),
        repo: updated.repoUrl || "",
        errors,
      });
    }
  }
  const repository = await enrichMissingRepositories(1).catch((error) => ({
    processed: 0,
    error: (error as Error).message,
  }));
  return {
    processed: results.length,
    abstractsRecovered,
    ...(abstractBackfillError ? { abstractBackfillError } : {}),
    remaining:
      pending.length -
      results.filter((result) => result.status === "done").length,
    results,
    repository,
  };
}
/** Short MCP batch for the reading backlog; repository work has its own task. */
export async function enrichMissingReadings(limit = 2) {
  if (!env.DB) throw new Error("文献数据库不可用");
  if (!runtime("LEXMOUNT_API_KEY") || !runtime("LEXMOUNT_PROJECT_ID"))
    throw new Error("Lexmount Web Fetch 服务端凭据尚未配置");
  if (!runtime("DEEPSEEK_API_KEY")) throw new Error("DeepSeek API 尚未配置");
  const papers = await allPapersForEnrichment();
  const jobs = await env.DB.prepare(
    "SELECT id,status,updated_at FROM jobs WHERE id LIKE 'enrich:%'",
  ).all<JobRow>();
  const byId = new Map((jobs.results || []).map((job) => [job.id, job]));
  const pending = papers
    .filter((paper) => !paper.analysis && Boolean(paper.abstract.trim()))
    .sort(
      (a, b) =>
        Number(Boolean(byId.get(`enrich:${a.id}`))) -
          Number(Boolean(byId.get(`enrich:${b.id}`))) ||
        b.citedByCount - a.citedByCount ||
        b.year - a.year,
    );
  const results: {
    id: string;
    analysis: boolean;
    status: string;
    depth: string;
    errors: string[];
  }[] = [];
  for (const paper of pending) {
    if (results.length >= Math.max(1, Math.min(limit, 2))) break;
    const jobId = `enrich:${paper.id}`;
    if (!(await claim(jobId, byId.get(jobId)))) continue;
    try {
      const reading = await readPaper(paper);
      if (reading.analysis)
        await putPapers([{
          ...paper,
          analysis: reading.analysis,
          fulltextStatus: reading.depth === "全文" ? "全文可用" : "仅摘要",
        }]);
      const status = reading.analysis ? "done" : "partial";
      await finish(jobId, status, {
        sourceUrl: reading.sourceUrl,
        errors: reading.errors,
      });
      results.push({
        id: paper.id,
        analysis: Boolean(reading.analysis),
        status,
        depth: reading.depth,
        errors: reading.errors,
      });
    } catch (error) {
      const message = (error as Error).message;
      await finish(jobId, "failed", { errors: [message] });
      results.push({
        id: paper.id,
        analysis: false,
        status: "failed",
        depth: "",
        errors: [message],
      });
    }
  }
  return {
    processed: results.length,
    readingsCompleted: results.filter((result) => result.analysis).length,
    remainingWithAbstract: pending.length - results.filter((result) => result.analysis).length,
    results,
  };
}
/** Owner-triggered retry for one paper after a previous incomplete reading. */
export async function retryMissingReading(paperId: string) {
  if (!env.DB) throw new Error("文献数据库不可用");
  if (!runtime("LEXMOUNT_API_KEY") || !runtime("LEXMOUNT_PROJECT_ID"))
    throw new Error("Lexmount Web Fetch 服务端凭据尚未配置");
  if (!runtime("DEEPSEEK_API_KEY")) throw new Error("DeepSeek API 尚未配置");
  const paper = await findPaper(paperId);
  if (!paper) throw new Error("论文不存在");
  if (paper.analysis) return { id: paper.id, analysis: true, cached: true, errors: [] };
  // The second revision analyzes abstract-only text for abstract-depth claims.
  const jobId = `manual-read-v2:${paper.id}`;
  const previous = await env.DB.prepare(
    "SELECT id,status,updated_at FROM jobs WHERE id = ?",
  ).bind(jobId).first<JobRow>();
  if (!(await claim(jobId, previous || undefined)))
    return { id: paper.id, analysis: false, status: "cooldown", errors: ["该论文的手动重试正在运行或等待冷却"] };
  try {
    const reading = await readPaper(paper);
    if (reading.analysis)
      await putPapers([{
        ...paper,
        analysis: reading.analysis,
        fulltextStatus: reading.depth === "全文" ? "全文可用" : "仅摘要",
      }]);
    const status = reading.analysis ? "done" : "partial";
    await finish(jobId, status, { sourceUrl: reading.sourceUrl, errors: reading.errors });
    return { id: paper.id, analysis: Boolean(reading.analysis), status, depth: reading.depth, errors: reading.errors };
  } catch (error) {
    const message = (error as Error).message;
    await finish(jobId, "failed", { errors: [message] });
    return { id: paper.id, analysis: false, status: "failed", errors: [message] };
  }
}
export async function enrichMissingRepositories(limit = 2) {
  if (!env.DB) throw new Error("文献数据库不可用");
  if (!runtime("LEXMOUNT_API_KEY") || !runtime("LEXMOUNT_PROJECT_ID"))
    throw new Error("Lexmount Web Fetch 服务端凭据尚未配置");
  const papers = await allPapers();
  const jobs = await env.DB.prepare(
    "SELECT id,status,updated_at FROM jobs WHERE id LIKE 'repo:%'",
  ).all<JobRow>();
  const byId = new Map((jobs.results || []).map((job) => [job.id, job]));
  const pending = papers
    .filter((paper) => {
      const discoveryStale =
        !paper.repoDiscovery ||
        Date.now() - Date.parse(paper.repoDiscovery.checkedAt) > 7 * 86400000;
      return (
        discoveryStale || Boolean(paper.repoUrl && !paper.repoAudit?.evaluation)
      );
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.repoUrl)) - Number(Boolean(a.repoUrl)) ||
        b.citedByCount - a.citedByCount ||
        b.year - a.year,
    );
  const results: {
    id: string;
    status: string;
    repoUrl: string;
    discovery: string;
    evaluated: boolean;
    error?: string;
  }[] = [];
  for (const paper of pending) {
    if (results.length >= Math.max(1, Math.min(limit, 2))) break;
    const jobId = `repo:${paper.id}`;
    if (!(await claim(jobId, byId.get(jobId)))) continue;
    try {
      const updated = await inspectPaperRepository(paper);
      const status = updated.repoAudit?.evaluation
        ? "done"
        : updated.repoUrl
          ? "partial"
          : updated.repoDiscovery?.status || "none";
      await finish(jobId, status, {
        repoUrl: updated.repoUrl,
        discovery: updated.repoDiscovery?.status || "",
        evaluationError: updated.repoAudit?.evaluationError || "",
      });
      results.push({
        id: paper.id,
        status,
        repoUrl: updated.repoUrl,
        discovery: updated.repoDiscovery?.status || "",
        evaluated: Boolean(updated.repoAudit?.evaluation),
        ...(updated.repoAudit?.evaluationError
          ? { error: updated.repoAudit.evaluationError }
          : {}),
      });
    } catch (error) {
      const message = (error as Error).message;
      await finish(jobId, "failed", { error: message });
      results.push({
        id: paper.id,
        status: "failed",
        repoUrl: paper.repoUrl,
        discovery: paper.repoDiscovery?.status || "",
        evaluated: false,
        error: message,
      });
    }
  }
  return { processed: results.length, pending: pending.length, results };
}
