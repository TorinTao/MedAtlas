import { getChatGPTUser } from "../../../../platform/identity/session";
import { importPaperLink } from "../../../../composition/workspace";
import { jsonError, takeQuota } from "../../../../platform/storage/papers";
import { PaperLinkError } from "../../../../modules/workspace/paper-link";
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("请先登录后导入论文链接", 401);
  const body = (await request.json().catch(() => null)) as {
    url?: unknown;
  } | null;
  if (typeof body?.url !== "string") return jsonError("请输入论文链接", 400);
  if (!(await takeQuota(request, "paper-link-import", 12, user.userId)))
    return jsonError("今日链接导入次数已用完，请明天再试", 429);
  try {
    return Response.json(await importPaperLink(user.userId, body.url), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(
      error instanceof PaperLinkError
        ? error.message
        : "论文链接导入未完成，请稍后重试；页面可能不可访问或服务暂不可用",
      error instanceof PaperLinkError ? error.status : 502,
    );
  }
}
