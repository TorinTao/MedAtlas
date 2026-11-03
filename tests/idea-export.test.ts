import assert from "node:assert/strict";
import test from "node:test";
import { formatIdeaForDiscussion } from "../modules/ideas/export";
import { normalizePaper } from "../modules/catalog/papers";
import type { ResearchIdea } from "../shared/models";

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
  for (const heading of ["## 最相近工作", "## 最小验证实验", "## 针对本方案", "## 模型审查", "原文锚点："]) assert.ok(!copied.includes(heading), heading);
});

test("copied reviewed idea includes closest work, minimum experiment, search, review, and exact evidence anchors", () => {
  const paper = normalizePaper({ id: "pmid-456", title: "External validation of radiology models", abstract: "Performance decreased on external data from another hospital.", year: 2025, url: "https://pubmed.ncbi.nlm.nih.gov/456/", source: "PubMed" });
  const idea: ResearchIdea = {
    id: "reviewed-idea", title: "外部数据中的拒答校准", query: "跨院胸片拒答", createdAt: "2026-11-03",
    gap: "尚需比较跨院拒答阈值的稳定性", hypothesis: "按验证集校准阈值可能降低选择风险", supportingEvidence: "跨院分布变化影响性能", counterEvidence: "拒答也可能使覆盖率过低",
    datasets: ["待授权的外部胸片队列"], baselines: ["固定阈值模型"], metrics: ["选择风险"], challenges: ["数据使用许可"], paperIds: [paper.id],
    closestWork: [{ paperId: paper.id, alreadyDone: "外部数据集上报告了性能变化", difference: "固定覆盖率比较两种拒答校准方法" }],
    minimumExperiment: { question: "相同覆盖率下风险是否下降", data: "两个医院的独立患者队列，需核实授权", baseline: "验证集固定阈值", intervention: "仅替换阈值校准策略", primaryMetric: "80% 覆盖率时的选择风险", successCriterion: "预注册风险差的置信区间低于零", falsificationCriterion: "风险差置信区间跨零或覆盖率约束不满足", resourceBudget: "单 GPU 推理预算 12 小时" },
    improvements: [
      { title: "校准比较", action: "锁定同一模型和测试集", risk: "阈值迁移失效", fallback: "报告负结果", priority: "核心" },
      { title: "亚组分析", action: "按年龄分组", risk: "亚组样本不足", fallback: "仅给描述性结果", priority: "可选" },
    ],
    targetedSearch: { query: "radiology selective prediction external calibration", foundCount: 7, sources: ["PubMed", "OpenAlex"], warnings: ["arXiv 暂时不可用"] },
    qualityReview: { status: "模型审查通过", summary: "主假设、对照与证伪判据一致", limitations: ["尚未人工核查全文", "数据授权待确认"], reviewedAt: "2026-11-03T11:00:00.000Z", version: "evidence-v2" },
    evidenceChain: [{ claim: "外部数据性能下降", stance: "背景", paperIds: [paper.id], anchors: [{ paperId: paper.id, quote: paper.abstract, location: "摘要", sourceUrl: paper.url }] }],
  };
  const copied = formatIdeaForDiscussion(idea, [paper]);
  const experiment = idea.minimumExperiment!;
  for (const text of [
    ...Object.values(experiment), idea.closestWork![0].alreadyDone, idea.closestWork![0].difference,
    "[核心] 校准比较", "[可选] 亚组分析", idea.targetedSearch!.query, "返回候选论文：7 篇", "PubMed、OpenAlex", "arXiv 暂时不可用",
    idea.qualityReview!.summary, idea.qualityReview!.reviewedAt, ...idea.qualityReview!.limitations, "这只是模型审查，不能保证研究新颖性",
    paper.title, "位置：摘要", paper.abstract, `来源：${paper.url}`,
  ]) assert.ok(copied.includes(text), text);
});

test("new metadata handles unloaded papers and empty search results without inventing evidence", () => {
  const idea: ResearchIdea = {
    id: "unloaded", title: "研究方案", query: "医学多模态", createdAt: "2026-11-03", gap: "空白", hypothesis: "假设", supportingEvidence: "待核查", counterEvidence: "待核查",
    datasets: [], baselines: [], metrics: [], challenges: [], paperIds: ["missing-id"],
    closestWork: [{ paperId: "missing-id", alreadyDone: "已有结果", difference: "待验证差异" }],
    targetedSearch: { query: "clinical image uncertainty", foundCount: 0, sources: [], warnings: [] },
  };
  const copied = formatIdeaForDiscussion(idea, []);
  assert.ok(copied.includes("missing-id（详情未载入）"));
  assert.ok(copied.includes("返回候选论文：0 篇"));
  assert.ok(copied.includes("本次未获得有效来源"));
  assert.ok(copied.includes("检索未发现相近工作不等于证明新颖性"));
  assert.ok(!copied.includes("undefined"));
  assert.ok(!copied.includes("## 模型审查"));
});
