import type { Paper } from "./types";

export function withSummaryFallback(paper: Paper): Paper {
  if (paper.summaryZh?.trim()) return paper;
  const title = paper.title.trim().replace(/\s+/g, " ").slice(0, 150);
  return {
    ...paper,
    summaryZh: `论文围绕“${title}”展开研究；具体贡献、方法和结果仍需依据摘要或全文核验。`,
    summaryBasis: "元数据",
  };
}

export function needsGeneratedSummary(paper: Paper): boolean {
  return !paper.summaryZh?.trim() || paper.summaryBasis === "元数据";
}
