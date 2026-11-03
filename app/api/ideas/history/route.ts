import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { ideas as ideaTable } from "../../../../db/schema";
import { findPaper, jsonError, takeQuota } from "../../../../lib/store";
import type { ResearchIdea } from "../../../../lib/types";

const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const favorite = (idea: ResearchIdea) => ({ ...idea, favorite: idea.favorite === true });

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("请先登录", 401);
  const id = new URL(request.url).searchParams.get("id") || "";
  const db = getDb();
  if (id) {
    if (!validId(id)) return jsonError("选题 ID 无效");
    const rows = await db.select().from(ideaTable).where(and(eq(ideaTable.id, id), eq(ideaTable.userId, user.userId))).limit(1);
    if (!rows.length) return jsonError("抽卡记录不存在", 404);
    const idea = favorite(JSON.parse(rows[0].data) as ResearchIdea);
    const evidencePapers = (await Promise.all(idea.paperIds.slice(0, 24).map(findPaper))).filter(Boolean);
    return Response.json({ idea, evidencePapers });
  }
  const rows = await db.select().from(ideaTable).where(eq(ideaTable.userId, user.userId)).orderBy(desc(ideaTable.createdAt)).limit(100);
  return Response.json({ history: rows.map(row => {
    const idea = favorite(JSON.parse(row.data) as ResearchIdea);
    return { id: idea.id, title: idea.title, gap: idea.gap, hypothesis: idea.hypothesis, query: idea.query, createdAt: idea.createdAt, paperCount: idea.paperIds.length, favorite: idea.favorite };
  }) });
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("请先登录", 401);
  if (!env.DB) return jsonError("数据库不可用", 503);
  const body: any = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!validId(id) || typeof body.favorite !== "boolean") return jsonError("收藏参数无效");
  const row = await env.DB.prepare("UPDATE ideas SET data = json_set(data, '$.favorite', json(?)) WHERE id = ? AND user_id = ? RETURNING data").bind(JSON.stringify(body.favorite), id, user.userId).first<{ data: string }>();
  if (!row) return jsonError("抽卡记录不存在", 404);
  return Response.json({ id, favorite: (JSON.parse(row.data) as ResearchIdea).favorite === true });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("请先登录", 401);
  if (!env.DB) return jsonError("数据库不可用", 503);
  const raw = await request.text();
  if (raw.length > 50000) return jsonError("选题内容过长");
  let body: any;
  try { body = JSON.parse(raw || "{}"); } catch { return jsonError("选题内容不是有效 JSON"); }
  const idea = body.idea as ResearchIdea | undefined;
  if (!idea || !validId(String(idea.id || "")) || typeof idea.title !== "string" || idea.title.length > 180 || !idea.title.trim() || typeof idea.gap !== "string" || idea.gap.length > 1000 || typeof idea.hypothesis !== "string" || idea.hypothesis.length > 1000 || !Array.isArray(idea.paperIds) || idea.paperIds.length < 2 || idea.paperIds.length > 24 || idea.paperIds.some(id => typeof id !== "string" || !/^[\w.-]{3,80}$/.test(id))) return jsonError("抽卡历史内容无效");
  if (!await takeQuota(request, "ideas-import", 30, user.userId)) return jsonError("今日历史同步次数已用完", 429);
  const found = await Promise.all(idea.paperIds.map(findPaper));
  if (found.some(paper => !paper)) return jsonError("相关论文已不可用，请重新抽卡", 422);
  const stored = favorite({ ...idea, favorite: true, query: String(idea.query || "").slice(0, 180), createdAt: String(idea.createdAt || new Date().toISOString()).slice(0, 40) });
  const db = getDb();
  await db.insert(ideaTable).values({ id: stored.id, userId: user.userId, query: stored.query, data: JSON.stringify(stored), createdAt: stored.createdAt }).onConflictDoNothing();
  const rows = await db.select().from(ideaTable).where(and(eq(ideaTable.id, stored.id), eq(ideaTable.userId, user.userId))).limit(1);
  if (!rows.length) return jsonError("选题 ID 已被占用", 409);
  await env.DB.prepare("UPDATE ideas SET data = json_set(data, '$.favorite', json('true')) WHERE id = ? AND user_id = ?").bind(stored.id, user.userId).run();
  return Response.json({ id: stored.id, favorite: true });
}
