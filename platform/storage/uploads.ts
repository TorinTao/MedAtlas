import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { uploads } from "../../db/schema";
import type { UploadRepository, PrivateFiles } from "../../modules/workspace/documents";
export const uploadRepository: UploadRepository = {
    async findOwned(userId, id) { return (await getDb().select().from(uploads).where(and(eq(uploads.id, id), eq(uploads.userId, userId))).limit(1))[0]; },
    async insert(row) { await getDb().insert(uploads).values(row); },
    async remove(userId, id) { await getDb().delete(uploads).where(and(eq(uploads.id, id), eq(uploads.userId, userId))); },
};
function bucket() { if (!env.BUCKET)
    throw new Error("文件存储尚未就绪"); return env.BUCKET; }
export const privateFiles: PrivateFiles = {
    async put(key, value, contentType) { await bucket().put(key, value, { httpMetadata: { contentType } }); },
    async get(key) { return bucket().get(key); },
    async delete(key) { await bucket().delete(key); },
};
