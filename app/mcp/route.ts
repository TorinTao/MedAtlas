import { refreshLiterature } from "../../lib/refresh";
import { runtime } from "../../lib/runtime";

const tool = {
  name: "refresh_literature",
  description: "Update the public medical multimodal Agent paper corpus toward 200–500 deduplicated papers from PubMed, arXiv and OpenAlex. Safe to retry; at most one completed update per UTC day.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

export async function POST(request: Request) {
  const rpc: any = await request.json().catch(() => ({}));
  const id = rpc.id ?? null;
  const result = (value: unknown) => Response.json({ jsonrpc: "2.0", id, result: value });
  const error = (code: number, message: string) => Response.json({ jsonrpc: "2.0", id, error: { code, message } });
  if (rpc.method === "server/discover") return result({ supportedVersions: ["2026-07-28"], capabilities: { tools: {} } });
  if (rpc.method === "tools/list") return result({ tools: [tool] });
  if (rpc.method !== "tools/call" || rpc.params?.name !== tool.name) return error(-32601, "Method not found");
  const owner = runtime("MCP_OWNER_EMAIL")?.toLowerCase();
  const caller = request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  if (!owner || !caller || caller !== owner) return result({ content: [{ type: "text", text: "只有站点所有者可以更新文献语料" }], isError: true });
  try {
    const refreshed = await refreshLiterature();
    return result({ content: [{ type: "text", text: JSON.stringify(refreshed) }] });
  } catch (cause) {
    return result({ content: [{ type: "text", text: (cause as Error).message }], isError: true });
  }
}
