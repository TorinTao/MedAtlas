import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { uploads } from "../../../../db/schema";
import { jsonError } from "../../../../lib/store";

async function owned(id: string) {
  const user = await getChatGPTUser(); if (!user) return null;
  const row = await getDb().select().from(uploads).where(and(eq(uploads.id, id), eq(uploads.userId, user.userId))).limit(1);
  return row[0] || null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const row = await owned((await context.params).id); if (!row || !env.BUCKET) return jsonError("文件不存在或无权访问", 404);
  const text = new URL(request.url).searchParams.has("text"); const object = await env.BUCKET.get(`${row.storageKey}.${text ? "txt" : "pdf"}`);
  if (!object) return jsonError("文件不存在", 404);
  return new Response(object.body, { headers: { "Content-Type": text ? "text/plain; charset=utf-8" : "application/pdf", "Content-Disposition": text ? "inline" : `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`, "Cache-Control": "private, no-store" } });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const row = await owned((await context.params).id); if (!row || !env.BUCKET) return jsonError("文件不存在或无权访问", 404);
  await Promise.all([env.BUCKET.delete(`${row.storageKey}.pdf`), env.BUCKET.delete(`${row.storageKey}.txt`), env.BUCKET.delete(`${row.storageKey}.analysis.json`)]);
  await getDb().delete(uploads).where(eq(uploads.id, row.id));
  return Response.json({ deleted: true });
}
