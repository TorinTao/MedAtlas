import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { uploads } from "../../../db/schema";
import { jsonError, takeQuota } from "../../../lib/store";
import { PDF_MAX_BYTES, PDF_MAX_PAGES, PDF_MAX_TEXT } from "../../../lib/pdf-upload";

export async function POST(request: Request) {
  const user = await getChatGPTUser(); if (!user) return jsonError("请先登录后上传 PDF", 401);
  if (!env.BUCKET || !env.DB) return jsonError("文件存储或数据库尚未就绪", 503);
  const form = await request.formData().catch(() => null); const file = form?.get("file"); const text = String(form?.get("text") || "").trim(); const pages = Number(form?.get("pages") || 0);
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf") || file.size > PDF_MAX_BYTES || file.size < 100 || !Number.isInteger(pages) || pages < 1 || pages > PDF_MAX_PAGES || text.length < 100 || text.length > PDF_MAX_TEXT) return jsonError("请上传不超过 20 MB、100 页且可提取 100–200000 字符文字的 PDF");
  const bytes = new Uint8Array(await file.arrayBuffer()); if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return jsonError("文件不是有效 PDF");
  if (!await takeQuota(request, "upload", 5, user.userId)) return jsonError("今日上传次数已用完", 429);
  const id = crypto.randomUUID(); const storageKey = `users/${encodeURIComponent(user.userId)}/${id}`;
  try {
    await env.BUCKET.put(`${storageKey}.pdf`, bytes, { httpMetadata: { contentType: "application/pdf" } });
    await env.BUCKET.put(`${storageKey}.txt`, text, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
    await getDb().insert(uploads).values({ id, userId: user.userId, fileName: file.name.slice(0, 180), fileSize: file.size, pageCount: pages, storageKey, createdAt: new Date().toISOString() });
  } catch {
    await Promise.allSettled([env.BUCKET.delete(`${storageKey}.pdf`), env.BUCKET.delete(`${storageKey}.txt`)]);
    return jsonError("PDF 保存失败，请稍后重试", 503);
  }
  return Response.json({ id, fileName: file.name, pageCount: pages });
}
