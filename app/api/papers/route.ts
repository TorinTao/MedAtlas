import { allPapers } from "../../../lib/store";

export async function GET() {
  const papers = await allPapers();
  return Response.json({ papers: papers.sort((a, b) => b.year - a.year), count: papers.length, refreshedAt: new Date().toISOString() });
}
