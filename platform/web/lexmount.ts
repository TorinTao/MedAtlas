import { safePublicUrl } from "../../shared/public-url";
import type { WebReader } from "../../shared/ports";
export function createLexmountReader(
  config: () => {
    key: string;
    projectId: string;
    baseUrl?: string;
  },
  http: typeof fetch = fetch,
): WebReader {
  async function lexmountExtract(
    url: string,
    timeoutMs = 30000,
  ): Promise<{
    text: string;
    title: string;
    finalUrl: string;
    description: string;
    author: string;
    publishTime: string;
    requestId: string;
  }> {
    if (!safePublicUrl(url)) throw new Error("仅支持公开 HTTPS 论文页面");
    const key = config().key;
    const projectId = config().projectId;
    if (!key || !projectId) throw new Error("Lexmount Web Fetch 尚未配置");
    const base = config().baseUrl || "https://api.lexmount.cn";
    const response = await http(`${base.replace(/\/$/, "")}/v1/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
        "X-Project-Id": projectId,
      },
      body: JSON.stringify({ extract: { url } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Lexmount HTTP ${response.status}`);
    const data = (await response.json()) as any;
    if (data.error)
      throw new Error(
        `Lexmount 提取失败: ${typeof data.error === "string" ? data.error : data.error.message || "未知错误"}`,
      );
    const result = data.result || data;
    return {
      text: String(result.main_text || "").slice(0, 80000),
      title: String(result.title || ""),
      finalUrl: String(result.final_url || url),
      description: String(result.description || "").slice(0, 6000),
      author: String(result.author || "").slice(0, 2000),
      publishTime: String(result.publish_time || ""),
      requestId: String(result.request_id || data.request_id || ""),
    };
  }
  async function lexmountDumpDom(url: string): Promise<{
    html: string;
    finalUrl: string;
  }> {
    if (!safePublicUrl(url)) throw new Error("仅支持公开 HTTPS 页面");
    const key = config().key;
    const projectId = config().projectId;
    if (!key || !projectId) throw new Error("Lexmount Web Fetch 尚未配置");
    const base = config().baseUrl || "https://api.lexmount.cn";
    const response = await http(`${base.replace(/\/$/, "")}/v1/dom/dump`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
        "X-Project-Id": projectId,
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Lexmount DOM HTTP ${response.status}`);
    const data = (await response.json()) as any;
    if (data.error)
      throw new Error(
        `Lexmount DOM 提取失败: ${typeof data.error === "string" ? data.error : data.error.message || "未知错误"}`,
      );
    const result = data.result || data;
    const html = String(result.html || "").slice(0, 750000);
    if (!html) throw new Error("Lexmount 未返回网页 DOM");
    return { html, finalUrl: String(result.final_url || url) };
  }
  return { extract: lexmountExtract, dumpDom: lexmountDumpDom };
}
