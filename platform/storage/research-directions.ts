import { eq, desc } from "drizzle-orm";
import { getDb } from "../../db";
import { researchDirections } from "../../db/schema";
import {
  directionKey,
  parseDirectionHistory,
  type ResearchScope,
  type ResearchDirection,
} from "../../modules/atlas/research-scope";
export async function listDirections(
  userId: string,
): Promise<ResearchDirection[]> {
  const rows = await getDb()
    .select()
    .from(researchDirections)
    .where(eq(researchDirections.userId, userId))
    .orderBy(desc(researchDirections.updatedAt));
  return rows.flatMap((row) => parseDirectionHistory(`[${row.data}]`));
}
export async function saveDirection(
  userId: string,
  scope: ResearchScope,
): Promise<ResearchDirection> {
  const record = { ...scope, updatedAt: new Date().toISOString() };
  const id = JSON.stringify([userId, directionKey(scope.query)]);
  await getDb()
    .insert(researchDirections)
    .values({
      id,
      userId,
      data: JSON.stringify(record),
      updatedAt: record.updatedAt,
    })
    .onConflictDoUpdate({
      target: researchDirections.id,
      set: { data: JSON.stringify(record), updatedAt: record.updatedAt },
    });
  return record;
}
