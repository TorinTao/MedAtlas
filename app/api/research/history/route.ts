import { getChatGPTUser } from "../../../../platform/identity/session";
import {
  listDirections,
  saveDirection,
} from "../../../../platform/storage/research-directions";
import { parseResearchScope } from "../../../../modules/atlas/research-scope";
import { jsonError } from "../../../../platform/storage/papers";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return jsonError("请先登录", 401);
  try {
    return Response.json(
      { directions: await listDirections(user.userId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return jsonError("研究方向历史暂时无法加载", 503);
  }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("请先登录", 401);
  const body = await request.json().catch(() => null);
  const scope = parseResearchScope(JSON.stringify(body));
  if (!scope) return jsonError("研究方向或论文集合无效", 400);
  try {
    return Response.json(
      { direction: await saveDirection(user.userId, scope) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return jsonError("研究方向暂未同步到账户，已保留本地记录，请稍后重试", 503);
  }
}
