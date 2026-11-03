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
          { role: "system", content: `${system}\n只输出有效 JSON。` },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        max_tokens: options.maxTokens || 8000,
        stream: false,
      }),
      signal: AbortSignal.timeout(options.timeoutMs || 60000),
    });
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek 返回空内容");
    if (data.choices?.[0]?.finish_reason === "length")
      throw new Error("DeepSeek JSON 超出长度限制，请缩小论文范围后重试");
    return JSON.parse(content);
  };
}
