import {
  allPapers,
  findPapersByIds,
  jsonError,
} from "../../../platform/storage/papers";

export async function GET() {
  const papers = await allPapers();
  return Response.json({
    papers: papers.sort((a, b) => b.year - a.year),
    count: papers.length,
    refreshedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  if (
    !body ||
    !Array.isArray(body.ids) ||
    body.ids.length > 500 ||
    !body.ids.every(
      (id: unknown) =>
        typeof id === "string" && id.length > 0 && id.length <= 180,
    )
  )
    return jsonError("论文集合参数无效", 400);
  try {
    const papers = await findPapersByIds(body.ids as string[]);
    return Response.json({ papers, count: papers.length });
  } catch {
    return jsonError("当前研究方向的论文暂时无法加载，请稍后重试", 503);
  }
}
