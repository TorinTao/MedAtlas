import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../platform/identity/session";
import { getDb } from "../../../db";
import { ideas as ideaTable } from "../../../db/schema";
import {
  collectPapers,
  searchArxiv,
  searchOpenAlex,
  searchPubMed,
} from "../../../composition/catalog";
import {
  makeFollowupQueries,
  makeIdea,
  makeResearchBrief,
  makeResearchFocus,
  type ResearchBrief,
} from "../../../composition/research";
import {
  selectEvidence,
  type ResearchFocus,
} from "../../../modules/ideas/selection";
import { dedupePapers } from "../../../modules/catalog/papers";
import {
  allPapers,
  findPaper,
  jsonError,
  putPapers,
  takeQuota,
} from "../../../platform/storage/papers";
import type { IdeaSummary, IdeasResearch, Paper } from "../../../shared/models";
import { hasDeepSeekKey } from "../../../platform/identity/model-credentials";

type Prepared = {
  query: string;
  focus: ResearchFocus;
  paperIds: string[];
  brief: ResearchBrief;
  owner: string;
  sources: string[];
  warnings: string[];
  scannedCount: number;
  preparedAt: string;
  expiresAt: string;
  drawCount: number;
  draws: IdeaSummary[];
};
async function ownerOf(request: Request, userId?: string) {
  const address =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    "local";
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(userId ? `user:${userId}` : `guest:${address}`),
    ),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function searchNearby(query: string) {
  const requests = [
    { source: "OpenAlex", run: () => searchOpenAlex(query, 16) },
    { source: "PubMed", run: () => searchPubMed(query, 8) },
    { source: "arXiv", run: () => searchArxiv(query, 6) },
  ];
  const results = await Promise.allSettled(requests.map((item) => item.run()));
  const papers: Paper[] = [],
    sources: string[] = [],
    warnings: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      papers.push(...result.value);
      if (result.value.length) sources.push(requests[index].source);
    } else
      warnings.push(
        `${requests[index].source}：${result.reason?.message || "检索失败"}`,
      );
  });
  return { papers: dedupePapers(papers), sources, warnings };
}

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({}));
  const action = body.action === "draw" ? "draw" : "prepare";
  if (!(await hasDeepSeekKey()))
    return jsonError("DeepSeek API 尚未配置，请在系统设置中添加个人 Key", 503);
  if (!env.DB) return jsonError("文献数据库不可用", 503);
  const user = await getChatGPTUser(),
    owner = await ownerOf(request, user?.userId);
  if (action === "prepare") {
    const query = String(body.query || "")
      .trim()
      .slice(0, 180);
    if (query.length < 4) return jsonError("请输入至少 4 个字符的研究方向");
    if (
      !(await takeQuota(request, "ideas-prepare", user ? 12 : 4, user?.userId))
    )
      return jsonError("今日深度调研次数已用完", 429);
    const preferredIds = (Array.isArray(body.paperIds) ? body.paperIds : [])
      .filter(
        (id: unknown): id is string =>
          typeof id === "string" && /^[\w-]{3,80}$/.test(id),
      )
      .slice(0, 24);
    try {
      let focus = await makeResearchFocus(query);
      const [live, review, stored] = await Promise.all([
        collectPapers(focus.searchQuery, "corpus"),
        searchOpenAlex(`${focus.searchQuery} review survey systematic`, 25)
          .then((papers) => ({ papers, error: "" }))
          .catch((error) => ({
            papers: [] as Paper[],
            error: `综述补充检索：${(error as Error).message}`,
          })),
        allPapers(),
      ]);
      if (!live.papers.length) return jsonError(`本次 Lexmount 文献核验未完成，暂不生成选题。${live.errors.join("；")}`, 502);
      const initial = dedupePapers([
        ...live.papers,
        ...review.papers,
        ...stored,
      ]);
      const initialEvidence = selectEvidence(focus, initial, preferredIds);
      const followupWarnings: string[] = [];
      const followupQueries = await makeFollowupQueries(
        query,
        initialEvidence,
      ).catch((error) => {
        followupWarnings.push(`相近研究检索规划：${(error as Error).message}`);
        return [];
      });
      const followupPapers: Paper[] = [];
      const followupSources = new Set<string>();
      const foundByQuery = followupQueries.map(() => [] as Paper[]);
      for (
        let queryIndex = 0;
        queryIndex < followupQueries.length;
        queryIndex++
      ) {
        const item = followupQueries[queryIndex];
        const requests = [
          { source: "OpenAlex", run: () => searchOpenAlex(item.query, 16) },
          { source: "PubMed", run: () => searchPubMed(item.query, 8) },
          { source: "arXiv", run: () => searchArxiv(item.query, 6) },
        ];
        const results = await Promise.allSettled(
          requests.map((request) => request.run()),
        );
        results.forEach((result, index) => {
          const source = requests[index].source;
          if (result.status === "fulfilled") {
            followupPapers.push(...result.value);
            foundByQuery[queryIndex].push(...result.value);
            if (result.value.length) followupSources.add(source);
          } else
            followupWarnings.push(
              `${source} 相近研究检索：${result.reason?.message || "请求失败"}`,
            );
        });
        if (queryIndex + 1 < followupQueries.length)
          await new Promise((resolve) => setTimeout(resolve, 700));
      }
      const newPapers = dedupePapers([
        ...live.papers,
        ...review.papers,
        ...followupPapers,
      ]);
      if (newPapers.length) await putPapers(newPapers);
      const corpus = dedupePapers([...newPapers, ...stored]);
      let selected = selectEvidence(
        focus,
        corpus,
        preferredIds,
        followupPapers,
      );
      if (selected.length < 6) {
        focus = await makeResearchFocus(query, corpus);
        selected = selectEvidence(focus, corpus, preferredIds, followupPapers);
        followupWarnings.push(
          "已依据候选论文的真实术语重新规划核心概念；改进目标用于比较研究空白，不强制每篇摘要同时提及。",
        );
      }
      if (selected.length < 6)
        return jsonError(
          `相关且有摘要的论文不足 6 篇（实际 ${selected.length} 篇；核心概念：${focus.conceptGroups.map((group) => group.join(" / ")).join("；")}），请调整研究方向`,
          422,
        );
      const brief = await makeResearchBrief(query, selected);
      const preparedAt = new Date().toISOString(),
        expiresAt = new Date(Date.now() + 7200000).toISOString(),
        jobId = `ideas:${crypto.randomUUID()}`;
      const sources = [
        ...new Set([
          ...live.sources,
          ...(review.papers.length ? ["OpenAlex 综述补充"] : []),
          ...[...followupSources].map((source) => `${source} 相近研究补充`),
          "站内文献库",
        ]),
      ];
      const warnings = [
        ...live.errors,
        ...(review.error ? [review.error] : []),
        ...followupWarnings,
      ];
      // Start at a different evidence-backed candidate; subsequent draws advance on the server.
      const drawCount =
        crypto.getRandomValues(new Uint32Array(1))[0] %
        brief.opportunities.length;
      const prepared: Prepared = {
        query,
        focus,
        paperIds: selected.map((p) => p.id),
        brief,
        owner,
        sources,
        warnings,
        scannedCount: corpus.length,
        preparedAt,
        expiresAt,
        drawCount,
        draws: [],
      };
      await env.DB.prepare(
        "INSERT INTO jobs (id,status,updated_at,detail) VALUES (?,?,?,?)",
      )
        .bind(jobId, "ready", preparedAt, JSON.stringify(prepared))
        .run();
      const research: IdeasResearch = {
        jobId,
        query,
        scannedCount: corpus.length,
        selectedCount: selected.length,
        sources,
        warnings,
        preparedAt,
        expiresAt,
        brief,
        followupQueries: followupQueries.map((item, index) => ({
          ...item,
          foundCount: dedupePapers(foundByQuery[index]).length,
        })),
        papers: selected.map((p) => ({
          id: p.id,
          title: p.title,
          year: p.year,
          paperType: p.paperType,
        })),
      };
      return Response.json({ research, evidencePapers: selected });
    } catch (error) {
      return jsonError((error as Error).message, 503);
    }
  }
  const jobId = String(body.jobId || ""),
    drawIndex = Number(body.drawIndex);
  if (
    !/^ideas:[\w-]{36}$/.test(jobId) ||
    !Number.isInteger(drawIndex) ||
    drawIndex < 0 ||
    drawIndex > 9
  )
    return jsonError("抽卡参数无效");
  const row = await env.DB.prepare(
    "SELECT detail FROM jobs WHERE id = ? AND status = 'ready'",
  )
    .bind(jobId)
    .first<{ detail: string }>();
  if (!row) return jsonError("调研任务已失效，请重新调研", 404);
  const prepared = JSON.parse(row.detail) as Prepared;
  if (prepared.owner !== owner || Date.now() > Date.parse(prepared.expiresAt))
    return jsonError("调研任务已过期或无权访问，请重新调研", 403);
  if (!prepared.focus || !prepared.brief.opportunities?.length)
    return jsonError("调研逻辑已更新，请刷新页面后重新调研", 409);
  if (!(await takeQuota(request, "ideas-draw", user ? 30 : 10, user?.userId)))
    return jsonError("今日抽卡次数已用完", 429);
  try {
    const reservation = await env.DB.prepare(
      "UPDATE jobs SET detail = json_set(detail, '$.drawCount', coalesce(json_extract(detail, '$.drawCount'), 0) + 1) WHERE id = ? AND status = 'ready' RETURNING detail",
    )
      .bind(jobId)
      .first<{ detail: string }>();
    if (!reservation) return jsonError("调研任务已失效，请重新调研", 404);
    const current = JSON.parse(reservation.detail) as Prepared;
    const opportunity =
      current.brief.opportunities[
        (current.drawCount - 1) % current.brief.opportunities.length
      ];
    let papers = (await Promise.all(prepared.paperIds.map(findPaper))).filter(
      Boolean,
    ) as Paper[];
    if (papers.length < 6)
      return jsonError("调研论文暂不可用，请重新调研", 503);
    const nearby = await searchNearby(opportunity.searchQuery);
    const extra = selectEvidence(prepared.focus, nearby.papers, [], [], 8);
    // Dedupe preserves the first ID, keeping existing candidate references stable.
    papers = dedupePapers([...papers, ...extra]);
    if (extra.length) await putPapers(papers);
    const previous: IdeaSummary[] = [];
    if (user) {
      const history = await env.DB.prepare(
        "SELECT data FROM ideas WHERE user_id = ? AND query = ? ORDER BY created_at DESC LIMIT 20",
      )
        .bind(user.userId, prepared.query)
        .all<{ data: string }>();
      for (const row of [...history.results].reverse()) {
        const idea = JSON.parse(row.data);
        previous.push({
          title: idea.title,
          gap: idea.gap,
          hypothesis: idea.hypothesis,
        });
      }
    } else if (Array.isArray(body.previousIdeas)) {
      for (const item of body.previousIdeas.slice(-20))
        if (
          item &&
          typeof item.title === "string" &&
          typeof item.gap === "string" &&
          typeof item.hypothesis === "string"
        )
          previous.push({
            title: item.title.slice(0, 180),
            gap: item.gap.slice(0, 1000),
            hypothesis: item.hypothesis.slice(0, 1000),
          });
    }
    previous.push(...current.draws.slice(-20));
    const distinctPrevious = [
      ...new Map(
        previous.map((item) => [`${item.gap}|${item.hypothesis}`, item]),
      ).values(),
    ].slice(-20);
    const idea = {
      ...(await makeIdea(
        prepared.query,
        papers,
        prepared.brief,
        opportunity,
        distinctPrevious,
      )),
      favorite: false,
      targetedSearch: {
        query: opportunity.searchQuery,
        foundCount: extra.length,
        sources: nearby.sources,
        warnings: [
          ...nearby.warnings,
          ...(!extra.length
            ? ["本轮未获得符合方向的补充论文；不能据此认定方案新颖。"]
            : []),
        ],
      },
    };
    if (user)
      await getDb()
        .insert(ideaTable)
        .values({
          id: idea.id,
          userId: user.userId,
          query: prepared.query,
          data: JSON.stringify(idea),
          createdAt: idea.createdAt,
        });
    await env.DB.prepare(
      "UPDATE jobs SET detail = json_insert(detail, '$.draws[#]', json(?)) WHERE id = ?",
    )
      .bind(
        JSON.stringify({
          title: idea.title,
          gap: idea.gap,
          hypothesis: idea.hypothesis,
        }),
        jobId,
      )
      .run();
    return Response.json({
      idea,
      evidencePapers: papers,
      recorded: Boolean(user),
      saved: false,
    });
  } catch (error) {
    return jsonError((error as Error).message, 503);
  }
}
