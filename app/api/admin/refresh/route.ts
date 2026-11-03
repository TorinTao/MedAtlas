import { refreshLiterature } from "../../../../composition/jobs/refresh";
import { runtime } from "../../../../platform/config";
import { jsonError } from "../../../../platform/storage/papers";

export async function POST(request: Request) {
  const token = runtime("REFRESH_TOKEN");
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`)
    return jsonError("未授权", 401);
  try {
    return Response.json(await refreshLiterature());
  } catch (error) {
    return jsonError((error as Error).message, 502);
  }
}
