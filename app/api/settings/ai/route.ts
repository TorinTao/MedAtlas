import { getChatGPTUser } from "../../../../platform/identity/session";
import { deletePersonalDeepSeekKey, personalDeepSeekStatus, savePersonalDeepSeekKey } from "../../../../platform/identity/model-credentials";
import { runtime } from "../../../../platform/config";
import { takeQuota } from "../../../../platform/storage/papers";

const noStore = { "Cache-Control": "private, no-store" };
function response(data: object, status = 200) { return Response.json(data, { status, headers: noStore }); }
async function currentUser() { return getChatGPTUser(); }

async function verifyKey(apiKey: string) {
  const upstream = await fetch("https://api.deepseek.com/user/balance", {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(12000),
  });
  if (upstream.status === 401 || upstream.status === 403) throw new Error("DeepSeek 拒绝了此 API Key，请核对后重试");
  if (!upstream.ok) throw new Error(`DeepSeek 验证暂不可用（HTTP ${upstream.status}），请稍后重试`);
  const result = await upstream.json() as { is_available?: boolean };
  return { valid: true, available: result.is_available === true };
}

export async function GET() {
  const user = await currentUser(); if (!user) return response({ error: "请先登录" }, 401);
  try { return response({ ...(await personalDeepSeekStatus(user.userId)), siteFallback: Boolean(runtime("DEEPSEEK_API_KEY")), model: "deepseek-flash" }); }
  catch { return response({ error: "无法读取个人 API 设置" }, 503); }
}

async function keyFrom(request: Request) {
  const body = await request.json().catch(() => ({})) as { apiKey?: unknown };
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (apiKey.length < 20 || apiKey.length > 256 || /\s/.test(apiKey)) throw new Error("请输入有效的 DeepSeek API Key");
  return apiKey;
}

export async function POST(request: Request) {
  const user = await currentUser(); if (!user) return response({ error: "请先登录" }, 401);
  if (!await takeQuota(request, "ai-key-verify", 8, user.userId)) return response({ error: "今日连接测试次数已用完" }, 429);
  try { return response(await verifyKey(await keyFrom(request))); }
  catch (error) { return response({ error: (error as Error).message }, 422); }
}

export async function PUT(request: Request) {
  const user = await currentUser(); if (!user) return response({ error: "请先登录" }, 401);
  if (!await takeQuota(request, "ai-key-save", 8, user.userId)) return response({ error: "今日保存次数已用完" }, 429);
  try {
    const apiKey = await keyFrom(request);
    const verified = await verifyKey(apiKey);
    await savePersonalDeepSeekKey(user.userId, apiKey);
    return response({ ...verified, ...(await personalDeepSeekStatus(user.userId)), model: "deepseek-flash" });
  } catch (error) { return response({ error: (error as Error).message }, 422); }
}

export async function DELETE() {
  const user = await currentUser(); if (!user) return response({ error: "请先登录" }, 401);
  try { await deletePersonalDeepSeekKey(user.userId); return response({ configured: false, siteFallback: Boolean(runtime("DEEPSEEK_API_KEY")) }); }
  catch { return response({ error: "删除个人 API Key 失败" }, 503); }
}
