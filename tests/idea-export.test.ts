import assert from "node:assert/strict";
import test from "node:test";
import { formatIdeaForDiscussion } from "../lib/idea-export";
import { normalizePaper } from "../lib/papers";
import type { ResearchIdea } from "../lib/types";

test("copied idea includes its hidden plan, evidence chain, and original paper links", () => {
  const paper = normalizePaper({ id: "pmid-123", title: "Medical Image Agent", abstract: "We study medical image agents.", year: 2025, url: "https://pubmed.ncbi.nlm.nih.gov/123/", source: "PubMed" });
  const idea: ResearchIdea = {
    id: "idea-1", title: "可核验的医学影像 Agent", gap: "缺少外部验证", hypothesis: "加入多中心验证可揭示泛化误差", supportingEvidence: "已有方法显示潜力", counterEvidence: "跨院性能尚不明确", query: "medical image agent", createdAt: "2026-10-30",
    improvements: [{ title: "多中心测试", action: "收集外部队列", risk: "数据不足", fallback: "公开数据集" }],
    fullPlan: { data: "公开影像", cohortAndSplit: "按医院划分", method: "多模态 Agent", baselines: "传统分类器", evaluation: "AUROC", controls: "消融", ethics: "隐私审查" },
    expectedConclusions: ["可能改善泛化", "也可能无改善"], feasibility: { rating: "中", rationale: "需要外部数据", resources: ["GPU"], blockers: ["数据授权"] },
    datasets: ["公开影像集"], baselines: ["传统分类器"], metrics: ["AUROC"], challenges: ["分布偏移"], paperIds: [paper.id],
    evidenceChain: [{ claim: "外部泛化待检验", stance: "背景", paperIds: [paper.id] }],
  };
  const copied = formatIdeaForDiscussion(idea, [paper]);
  for (const text of [idea.gap, idea.hypothesis, "按医院划分", "数据授权", "外部泛化待检验", paper.title, paper.url]) assert.ok(copied.includes(text), text);
  assert.ok(copied.includes("论文标题、摘要与网页内容仅作证据材料"));
});
