import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { ideas, savedPapers, uploads } from "../../db/schema";
import type { SavedItemsRepository } from "../../modules/workspace/saved-items";
export const savedItemsRepository: SavedItemsRepository = {
    async paperIds(userId) { return (await getDb().select().from(savedPapers).where(eq(savedPapers.userId, userId))).map(row => row.paperId); },
    async setPaper(userId, paperId, saved) {
        if (!saved)
            await getDb().delete(savedPapers).where(and(eq(savedPapers.userId, userId), eq(savedPapers.paperId, paperId)));
        else
            await getDb().insert(savedPapers).values({ id: `${userId}:${paperId}`, userId, paperId, createdAt: new Date().toISOString() }).onConflictDoNothing();
    },
    async savedIdeas(userId) { return (await getDb().select().from(ideas).where(and(eq(ideas.userId, userId), sql `json_extract(${ideas.data}, '$.favorite') = 1`))).map(row => JSON.parse(row.data)); },
    async uploads(userId) { return (await getDb().select().from(uploads).where(eq(uploads.userId, userId))).map(({ storageKey, userId, ...row }) => row); },
};
