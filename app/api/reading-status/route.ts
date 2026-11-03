import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../platform/identity/session";
import { getDb } from "../../../db";
import { readPapers } from "../../../db/schema";
import { allPapers, findPaper, jsonError } from "../../../platform/storage/papers";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return jsonError("请先登录", 401);
  const rows = await getDb().select({ paperId: readPapers.paperId }).from(readPapers).where(eq(readPapers.userId, user.userId)).limit(500);
  return Response.json({ paperIds: rows.map(row => row.paperId) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("请先登录", 401);
  const body: any = await request.json().catch(() => ({}));
  const db = getDb();
  if (Array.isArray(body.paperIds)) {
    if (body.read === false || body.paperIds.length > 500) return jsonError("批量标记参数无效");
    const known = new Set((await allPapers()).map(paper => paper.id));
    const ids = [...new Set<string>((body.paperIds as unknown[]).filter((id: unknown): id is string => typeof id === "string" && known.has(id)))];
    for (let index = 0; index < ids.length; index += 50) {
      await db.insert(readPapers).values(ids.slice(index, index + 50).map(id => ({ id: `${user.userId}:${id}`, userId: user.userId, paperId: id, readAt: new Date().toISOString() }))).onConflictDoNothing();
    }
    return Response.json({ paperIds: ids, read: true });
  }
  const paperId = String(body.paperId || "");
  if (!paperId || paperId.length > 180 || !await findPaper(paperId)) return jsonError("论文不存在", 404);
  if (body.read === false) await db.delete(readPapers).where(and(eq(readPapers.userId, user.userId), eq(readPapers.paperId, paperId)));
  else await db.insert(readPapers).values({ id: `${user.userId}:${paperId}`, userId: user.userId, paperId, readAt: new Date().toISOString() }).onConflictDoNothing();
  return Response.json({ paperId, read: body.read !== false });
}
