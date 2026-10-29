import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { ideas as ideaTable } from "../../../db/schema";
import { makeIdeas } from "../../../lib/ideas";
import { findPaper, jsonError, takeQuota } from "../../../lib/store";
import type { Paper } from "../../../lib/types";
import { runtime } from "../../../lib/runtime";

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({})); const query = String(body.query || "").trim().slice(0, 180);
  const ids: string[] = [...new Set<string>((Array.isArray(body.paperIds) ? body.paperIds : []).filter((id: unknown): id is string => typeof id === "string" && /^[\w-]{3,80}$/.test(id)))].slice(0, 12);
  if (query.length < 4 || ids.length < 2) return jsonError("请提供研究方向和至少两篇论文");
  if (!runtime("DEEPSEEK_API_KEY")) return jsonError("DeepSeek API 尚未配置，请联系站点维护者", 503);
  const user = await getChatGPTUser();
  if (!await takeQuota(request, "ideas", user ? 6 : 2, user?.userId)) return jsonError("今日选题生成次数已用完", 429);
  const papers = (await Promise.all(ids.map(findPaper))).filter(Boolean) as Paper[];
  if (papers.length < 2) return jsonError("引用的论文不在本站检索结果中", 400);
  try {
    const ideas = await makeIdeas(query, papers);
    if (user) for (const idea of ideas) await getDb().insert(ideaTable).values({ id: idea.id, userId: user.userId, query, data: JSON.stringify(idea), createdAt: idea.createdAt });
    return Response.json({ ideas, saved: Boolean(user) });
  } catch (error) { return jsonError((error as Error).message, 503); }
}
