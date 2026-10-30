import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { ideas as ideaTable } from "../../../db/schema";
import { collectPapers, englishQuery, searchArxiv, searchOpenAlex, searchPubMed } from "../../../lib/collect";
import { makeFollowupQueries, makeIdea, makeResearchBrief, type ResearchBrief } from "../../../lib/ideas";
import { dedupePapers } from "../../../lib/papers";
import { allPapers, findPaper, jsonError, putPapers, takeQuota } from "../../../lib/store";
import type { IdeasResearch, Paper } from "../../../lib/types";
import { hasDeepSeekKey } from "../../../lib/user-api-key";

type Prepared = { query: string; paperIds: string[]; brief: ResearchBrief; owner: string; sources: string[]; warnings: string[]; scannedCount: number; preparedAt: string; expiresAt: string };
async function ownerOf(request: Request, userId?: string) {
  const address = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId ? `user:${userId}` : `guest:${address}`)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function selectEvidence(query: string, corpus: Paper[], preferredIds: string[], followupPapers: Paper[] = []): Paper[] {
  const terms = [...new Set((englishQuery(query).toLowerCase().match(/[a-z0-9]+/g) || []).filter(term => term.length > 2 && !["medical", "clinical", "agent"].includes(term)))];
  const preferred = new Set(preferredIds);
  const followed = new Set(followupPapers.map(paper => paper.id));
  const followedTitles = new Set(followupPapers.map(paper => paper.title.toLowerCase().replace(/[^a-z0-9]+/g, "")));
  const isFollowed = (paper: Paper) => followed.has(paper.id) || followedTitles.has(paper.title.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  const scored = corpus.filter(p => p.abstract.length >= 100 && p.year >= 2010 && p.year <= new Date().getUTCFullYear()).map(p => {
    const title = p.title.toLowerCase(), body = p.abstract.toLowerCase();
    const matches = terms.filter(term => title.includes(term) || body.includes(term)).length;
    const topical = terms.length ? matches / terms.length : p.relevance;
    const score = topical * 10 + terms.filter(term => title.includes(term)).length * 1.8 + (preferred.has(p.id) ? 4 : 0) + (isFollowed(p) ? 2 : 0) + (p.paperType === "综述" ? 1.5 : 0) + (p.paperType === "数据集" ? 0.8 : 0) + (p.year >= 2024 ? 0.5 : 0) + Math.min(1, Math.log1p(p.citedByCount) / 8);
    return { paper: p, score, topical };
  }).filter(item => item.topical >= 0.25 || preferred.has(item.paper.id) || isFollowed(item.paper)).sort((a, b) => b.score - a.score);
  const selected = new Map<string, Paper>();
  const add = (list: typeof scored, count: number) => list.slice(0, count).forEach(item => selected.set(item.paper.id, item.paper));
  add(scored.filter(item => item.paper.paperType === "综述"), 4);
  add(scored.filter(item => item.paper.paperType === "数据集" || item.paper.method === "评测与资源"), 3);
  add([...scored].sort((a, b) => a.paper.year - b.paper.year || b.score - a.score), 3);
  add(scored.filter(item => item.paper.year >= 2024), 7);
  add(scored.filter(item => isFollowed(item.paper)), 5);
  for (const item of scored) { if (selected.size >= 24) break; selected.set(item.paper.id, item.paper); }
  return [...selected.values()].slice(0, 24);
}

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({}));
  const action = body.action === "draw" ? "draw" : "prepare";
  if (!await hasDeepSeekKey()) return jsonError("DeepSeek API 尚未配置，请在 AI 设置中添加个人 Key", 503);
  if (!env.DB) return jsonError("文献数据库不可用", 503);
  const user = await getChatGPTUser(), owner = await ownerOf(request, user?.userId);
  if (action === "prepare") {
    const query = String(body.query || "").trim().slice(0, 180);
    if (query.length < 4) return jsonError("请输入至少 4 个字符的研究方向");
    if (!await takeQuota(request, "ideas-prepare", user ? 12 : 4, user?.userId)) return jsonError("今日深度调研次数已用完", 429);
    const preferredIds = (Array.isArray(body.paperIds) ? body.paperIds : []).filter((id: unknown): id is string => typeof id === "string" && /^[\w-]{3,80}$/.test(id)).slice(0, 24);
    try {
      const [live, review, stored] = await Promise.all([
        collectPapers(query, "corpus"),
        searchOpenAlex(`${englishQuery(query)} review survey systematic`, 25).then(papers => ({ papers, error: "" })).catch(error => ({ papers: [] as Paper[], error: `综述补充检索：${(error as Error).message}` })),
        allPapers(),
      ]);
      const initial = dedupePapers([...live.papers, ...review.papers, ...stored]);
      const initialEvidence = selectEvidence(query, initial, preferredIds);
      const followupWarnings: string[] = [];
      const followupQueries = await makeFollowupQueries(query, initialEvidence).catch(error => {
        followupWarnings.push(`相近研究检索规划：${(error as Error).message}`);
        return [];
      });
      const followupPapers: Paper[] = [];
      const followupSources = new Set<string>();
      const foundByQuery = followupQueries.map(() => [] as Paper[]);
      for (let queryIndex = 0; queryIndex < followupQueries.length; queryIndex++) {
        const item = followupQueries[queryIndex];
        const requests = [
          { source: "OpenAlex", run: () => searchOpenAlex(item.query, 16) },
          { source: "PubMed", run: () => searchPubMed(item.query, 8) },
          { source: "arXiv", run: () => searchArxiv(item.query, 6) },
        ];
        const results = await Promise.allSettled(requests.map(request => request.run()));
        results.forEach((result, index) => {
          const source = requests[index].source;
          if (result.status === "fulfilled") {
            followupPapers.push(...result.value);
            foundByQuery[queryIndex].push(...result.value);
            if (result.value.length) followupSources.add(source);
          } else followupWarnings.push(`${source} 相近研究检索：${result.reason?.message || "请求失败"}`);
        });
        if (queryIndex + 1 < followupQueries.length) await new Promise(resolve => setTimeout(resolve, 700));
      }
      const newPapers = dedupePapers([...live.papers, ...review.papers, ...followupPapers]);
      if (newPapers.length) await putPapers(newPapers);
      const corpus = dedupePapers([...newPapers, ...stored]);
      const selected = selectEvidence(query, corpus, preferredIds, followupPapers);
      if (selected.length < 6) return jsonError("相关且有摘要的论文不足 6 篇，请调整研究方向", 422);
      const brief = await makeResearchBrief(query, selected);
      const preparedAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 3600000).toISOString(), jobId = `ideas:${crypto.randomUUID()}`;
      const sources = [...new Set([...live.sources, ...(review.papers.length ? ["OpenAlex 综述补充"] : []), ...[...followupSources].map(source => `${source} 相近研究补充`), "站内文献库"])];
      const warnings = [...live.errors, ...(review.error ? [review.error] : []), ...followupWarnings];
      const prepared: Prepared = { query, paperIds: selected.map(p => p.id), brief, owner, sources, warnings, scannedCount: corpus.length, preparedAt, expiresAt };
      await env.DB.prepare("INSERT INTO jobs (id,status,updated_at,detail) VALUES (?,?,?,?)").bind(jobId, "ready", preparedAt, JSON.stringify(prepared)).run();
      const research: IdeasResearch = { jobId, query, scannedCount: corpus.length, selectedCount: selected.length, sources, warnings, preparedAt, expiresAt, brief, followupQueries: followupQueries.map((item, index) => ({ ...item, foundCount: dedupePapers(foundByQuery[index]).length })), papers: selected.map(p => ({ id: p.id, title: p.title, year: p.year, paperType: p.paperType })) };
      return Response.json({ research, evidencePapers: selected });
    } catch (error) { return jsonError((error as Error).message, 503); }
  }
  const jobId = String(body.jobId || ""), drawIndex = Number(body.drawIndex);
  if (!/^ideas:[\w-]{36}$/.test(jobId) || !Number.isInteger(drawIndex) || drawIndex < 0 || drawIndex > 9) return jsonError("抽卡参数无效");
  const row = await env.DB.prepare("SELECT detail FROM jobs WHERE id = ? AND status = 'ready'").bind(jobId).first<{ detail: string }>();
  if (!row) return jsonError("调研任务已失效，请重新调研", 404);
  const prepared = JSON.parse(row.detail) as Prepared;
  if (prepared.owner !== owner || Date.now() > Date.parse(prepared.expiresAt)) return jsonError("调研任务已过期或无权访问，请重新调研", 403);
  if (!await takeQuota(request, "ideas-draw", user ? 30 : 10, user?.userId)) return jsonError("今日抽卡次数已用完", 429);
  try {
    const papers = (await Promise.all(prepared.paperIds.map(findPaper))).filter(Boolean) as Paper[];
    if (papers.length < 6) return jsonError("调研论文暂不可用，请重新调研", 503);
    const excludedTitles = (Array.isArray(body.excludedTitles) ? body.excludedTitles : []).filter((title: unknown): title is string => typeof title === "string").map((title: string) => title.slice(0, 180)).slice(0, 10);
    const idea = await makeIdea(prepared.query, papers, prepared.brief, drawIndex, excludedTitles);
    if (user) await getDb().insert(ideaTable).values({ id: idea.id, userId: user.userId, query: prepared.query, data: JSON.stringify(idea), createdAt: idea.createdAt });
    return Response.json({ idea, saved: Boolean(user) });
  } catch (error) { return jsonError((error as Error).message, 503); }
}
