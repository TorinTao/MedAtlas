import { backfillMissingSummaries } from "../../../../lib/summary-backfill";
import { runtime } from "../../../../lib/runtime";
import { jsonError } from "../../../../lib/store";

export async function POST(request: Request) {
  const token = runtime("SUMMARY_BACKFILL_TOKEN");
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) return jsonError("未授权", 401);
  try { return Response.json(await backfillMissingSummaries()); }
  catch (error) { return jsonError((error as Error).message, 502); }
}
