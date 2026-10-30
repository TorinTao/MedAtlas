import { runtime } from "../../../../lib/runtime";
import { backfillPublicationVenues } from "../../../../lib/venue-backfill";

export async function POST(request: Request) {
  const token = runtime("SUMMARY_BACKFILL_TOKEN");
  if (!token || request.headers.get("Authorization") !== `Bearer ${token}`) return Response.json({ error: "未授权" }, { status: 401 });
  try { return Response.json(await backfillPublicationVenues()); }
  catch (cause) { return Response.json({ error: (cause as Error).message }, { status: 502 }); }
}
