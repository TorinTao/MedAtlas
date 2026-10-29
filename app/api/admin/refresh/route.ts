import { refreshLiterature } from "../../../../lib/refresh";
import { runtime } from "../../../../lib/runtime";
import { jsonError } from "../../../../lib/store";

export async function POST(request: Request) {
  const token = runtime("REFRESH_TOKEN");
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) return jsonError("未授权", 401);
  try { return Response.json(await refreshLiterature()); }
  catch (error) { return jsonError((error as Error).message, 502); }
}
