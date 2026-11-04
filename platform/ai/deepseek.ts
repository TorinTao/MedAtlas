import type { JsonModel, ModelOptions } from "../../shared/ports";
export function createDeepSeekModel(
  resolveKey: () => Promise<string>,
  http: typeof fetch = fetch,
): JsonModel {
  return async function deepseekJson(
    system: string,
    user: string,
    options: ModelOptions = {},
  ): Promise<unknown> {
    const key = await resolveKey();
    if (!key) throw new Error("DeepSeek API 尚未配置");
    for (let attempt = 0; attempt < 2; attempt++) {
      // DeepSeek JSON mode can replace a non-JSON response with whitespace.
      // A plain-text retry retains the explicit JSON instruction and lets us
      // validate the actual response instead of accepting an empty result.
      const response = await http("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "deepseek-flash",
          thinking: { type: options.thinking ? "enabled" : "disabled" },
          ...(options.thinking
            ? { reasoning_effort: options.reasoningEffort || "high" }
            : {}),
          messages: [
            { role: "system", content: `${system}\n只输出一个完整、有效的 JSON 对象，不要代码围栏或解释。` },
            { role: "user", content: user },
          ],
          response_format: { type: attempt ? "text" : "json_object" },
          max_tokens: attempt ? Math.min(64000, (options.maxTokens || 8000) * 2) : (options.maxTokens || 8000),
          stream: false,
        }),
        signal: AbortSignal.timeout(options.timeoutMs || 60000),
      });
      if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
      const data = (await response.json()) as {
        choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
      };
      const choice = data.choices?.[0];
      const reason = choice?.finish_reason;
      if (reason === "content_filter") throw new Error("DeepSeek 拒绝了本次内容，请调整输入后重试");
      if (reason === "length") {
        if (!attempt) continue;
        throw new Error("DeepSeek 输出达到长度上限，请减少本次输入后重试");
      }
      const content = choice?.message?.content?.trim();
      if (!content) {
        if (!attempt) continue;
        throw new Error(`DeepSeek 连续返回空白内容（结束原因：${reason || "未知"}），请稍后重试`);
      }
      try {
        const plain = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
        return JSON.parse(plain);
      } catch (error) {
        if (!attempt) continue;
        throw new SyntaxError(`DeepSeek 连续返回无效 JSON：${(error as Error).message}`);
      }
    }
    throw new Error("DeepSeek 请求未完成");
  };
}
