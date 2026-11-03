import { backfillMissingSummaries } from "../../../../composition/jobs/summaries";
import { runtime } from "../../../../platform/config";
import { jsonError } from "../../../../platform/storage/papers";

export async function POST(request: Request) {
  const token = runtime("SUMMARY_BACKFILL_TOKEN");
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) return jsonError("未授权", 401);
  try { return Response.json(await backfillMissingSummaries()); }
  catch (error) { return jsonError((error as Error).message, 502); }
}
