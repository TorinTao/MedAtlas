import { and, eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { ideas, savedPapers, uploads } from "../../../db/schema";
import { findPaper, jsonError } from "../../../lib/store";

export async function GET() {
  const user = await getChatGPTUser(); if (!user) return jsonError("请先登录", 401);
  const db = getDb();
  const [saved, ideaRows, uploadRows] = await Promise.all([db.select().from(savedPapers).where(eq(savedPapers.userId, user.userId)), db.select().from(ideas).where(and(eq(ideas.userId, user.userId), sql`json_extract(${ideas.data}, '$.favorite') = 1`)), db.select().from(uploads).where(eq(uploads.userId, user.userId))]);
  return Response.json({ savedPapers: (await Promise.all(saved.map(row => findPaper(row.paperId)))).filter(Boolean), ideas: ideaRows.map(row => JSON.parse(row.data)), uploads: uploadRows.map(({ storageKey, ...row }) => row) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser(); if (!user) return jsonError("请先登录", 401);
  const body: any = await request.json().catch(() => ({})); const id = String(body.paperId || "");
  const paper = await findPaper(id); if (!paper) return jsonError("论文不存在", 404);
  const key = `${user.userId}:${id}`; const db = getDb();
  if (body.saved === false) await db.delete(savedPapers).where(and(eq(savedPapers.userId, user.userId), eq(savedPapers.paperId, id)));
  else await db.insert(savedPapers).values({ id: key, userId: user.userId, paperId: id, createdAt: new Date().toISOString() }).onConflictDoNothing();
  return Response.json({ paperId: id, saved: body.saved !== false });
}
