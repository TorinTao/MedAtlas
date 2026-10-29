import { refreshLiterature } from "../../lib/refresh";
import { enrichMissingPapers } from "../../lib/enrich";
import { runtime } from "../../lib/runtime";

const refreshTool = {
  name: "refresh_literature",
  description: "Update the public medical multimodal Agent paper corpus toward 200–500 deduplicated papers from PubMed, arXiv and OpenAlex. Safe to retry; at most one completed update per UTC day.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};
const enrichTool = {
  name: "enrich_missing_papers",
  description: "Enrich up to two papers missing a Chinese overview or detailed reading. Use Lexmount Web Fetch on public paper pages, generate evidence-aware analysis, and statically audit a linked public GitHub repository when one can be identified. Persists results and retries incomplete work later.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

export async function POST(request: Request) {
  const rpc: any = await request.json().catch(() => ({}));
  const id = rpc.id ?? null;
  const result = (value: unknown) => Response.json({ jsonrpc: "2.0", id, result: value });
  const error = (code: number, message: string) => Response.json({ jsonrpc: "2.0", id, error: { code, message } });
  if (rpc.method === "server/discover") return result({ supportedVersions: ["2026-07-28"], capabilities: { tools: {} } });
  if (rpc.method === "tools/list") return result({ tools: [refreshTool, enrichTool] });
  if (rpc.method !== "tools/call" || ![refreshTool.name, enrichTool.name].includes(rpc.params?.name)) return error(-32601, "Method not found");
  const owner = runtime("MCP_OWNER_EMAIL")?.toLowerCase();
  const caller = request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  if (!owner || !caller || caller !== owner) return result({ content: [{ type: "text", text: "只有站点所有者可以更新文献语料" }], isError: true });
  try {
    const updated = rpc.params.name === refreshTool.name ? await refreshLiterature() : await enrichMissingPapers();
    return result({ content: [{ type: "text", text: JSON.stringify(updated) }] });
  } catch (cause) {
    return result({ content: [{ type: "text", text: (cause as Error).message }], isError: true });
  }
}
