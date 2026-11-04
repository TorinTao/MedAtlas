import { backgroundTasks } from "../../composition/automation";
import { runtime } from "../../platform/config";

const refreshTool = {
  name: "refresh_literature",
  description:
    "Update the public medical multimodal Agent paper corpus toward 200–500 deduplicated papers from PubMed, arXiv and OpenAlex. Safe to retry; at most one completed update per UTC day.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};
const enrichTool = {
  name: "enrich_missing_papers",
  description:
    "Enrich up to two papers missing a Chinese overview or detailed reading, translate review abstracts, and evaluate linked GitHub repositories. Lexmount Web Fetch reads public paper and repository pages; DeepSeek produces evidence-aware Chinese explanations. Persists results and retries incomplete work later.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};
const readingsTool = {
  name: "enrich_missing_readings",
  description:
    "Complete evidence-checked detailed readings for up to two public papers with English abstracts. Saves results, skips recently claimed papers, and leaves repository evaluation to its separate task.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};
const repoTool = {
  name: "enrich_missing_repositories",
  description:
    "Discover GitHub links from public paper pages with Lexmount Web Fetch, inspect repository files and metadata, and produce a Chinese evidence-based completeness evaluation for up to two papers. Persist no-link and ambiguous findings without claiming code is absent.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};
const summaryTool = {
  name: "backfill_paper_summaries",
  description:
    "Generate and persist Chinese overviews for up to sixteen public papers whose only overview is the temporary metadata fallback. Use DeepSeek on each paper title and abstract; repeat on future scheduled runs until none remain.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};
const venueTool = {
  name: "backfill_publication_venues",
  description:
    "Look up verified journal, conference, or preprint platform metadata for up to forty papers from PubMed and OpenAlex. Preserve evidence links; mark unresolved venues as pending verification. Repeat on future scheduled runs.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

export async function POST(request: Request) {
  const rpc: any = await request.json().catch(() => ({}));
  const id = rpc.id ?? null;
  const result = (value: unknown) =>
    Response.json({ jsonrpc: "2.0", id, result: value });
  const error = (code: number, message: string) =>
    Response.json({ jsonrpc: "2.0", id, error: { code, message } });
  if (rpc.method === "server/discover")
    return result({
      supportedVersions: ["2026-07-28"],
      capabilities: { tools: {} },
    });
  if (rpc.method === "tools/list")
    return result({
      tools: [refreshTool, enrichTool, readingsTool, repoTool, summaryTool, venueTool],
    });
  if (
    rpc.method !== "tools/call" ||
    ![
      refreshTool.name,
      enrichTool.name,
      readingsTool.name,
      repoTool.name,
      summaryTool.name,
      venueTool.name,
    ].includes(rpc.params?.name)
  )
    return error(-32601, "Method not found");
  const owner = runtime("MCP_OWNER_EMAIL").trim().toLowerCase();
  const caller = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (!owner || !caller || caller !== owner)
    return result({
      content: [{
        type: "text",
        text: !owner
          ? "站点所有者邮箱尚未配置，无法更新文献语料"
          : !caller
            ? "站点未收到已验证的用户邮箱，无法更新文献语料"
            : `当前插件登录邮箱 ${caller} 与配置的站点所有者邮箱不一致`,
      }],
      isError: true,
    });
  try {
    const executed = await backgroundTasks.run(rpc.params.name);
    return result({
      content: [
        {
          type: "text",
          text: executed.ok ? JSON.stringify(executed.result) : executed.error,
        },
      ],
      ...(!executed.ok ? { isError: true } : {}),
    });
  } catch (cause) {
    return result({
      content: [{ type: "text", text: (cause as Error).message }],
      isError: true,
    });
  }
}
