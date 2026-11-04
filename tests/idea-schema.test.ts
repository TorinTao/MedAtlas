import assert from "node:assert/strict";
import test from "node:test";
import { validateIdea } from "../modules/ideas/schema";
import { normalizePaper } from "../modules/catalog/papers";

const papers = [
  normalizePaper({ id: "retrieval-study", title: "Retrieval for Radiology Report Generation", year: 2025, url: "https://example.org/retrieval", abstract: "Retrieval improved factual consistency in generated radiology reports on an internal retrospective test set. External hospital validation was not performed." }),
  normalizePaper({ id: "shift-study", title: "Hospital Shift in Radiology Report Generation", year: 2025, url: "https://example.org/shift", abstract: "Report generation accuracy declined under hospital distribution shift. The study evaluated patient-level separation and measured factual errors." }),
  normalizePaper({ id: "calibration-study", title: "Calibration of Radiology Report Models", year: 2024, url: "https://example.org/calibration", abstract: "Calibration reduced overconfident predictions in a retrospective radiology report benchmark. Clinical outcomes were not measured." }),
];
const query = "胸片报告生成的跨院事实一致性";

function validDraft() {
  return {
    title: "检索可信度门控能否降低跨院胸片报告事实错误",
    gap: "现有检索方法的跨院事实一致性仍需要独立验证。",
    hypothesis: "根据检索可信度关闭低质量证据可能降低外院报告事实错误。",
    supportingEvidence: "检索研究在内部回顾性测试中报告了事实一致性改善。",
    counterEvidence: "分布变化研究发现外院报告生成准确度会下降。",
    datasets: ["经授权的双院胸片与配对报告，获取权限待确认"],
    baselines: ["固定同一生成模型，采用无门控检索基线"],
    metrics: ["盲法标注的每报告事实错误率"],
    challenges: ["外院影像和报告访问资格尚待确认"],
    improvements: ["可信度门控", "温度标定", "缺失模态实验", "检索规模消融", "运行成本分析"].map((title, index) => ({
      title, action: `实验 ${index + 1} 固定生成器并单独比较该因素的影响。`,
      risk: "外院分布差异可能使实验中的改善无法重复。",
      fallback: "保持原始无门控检索基线并记录负结果。",
      priority: index === 0 ? "核心" : "可选",
    })),
    fullPlan: {
      data: "使用获得访问授权后的双院影像与配对报告。",
      cohortAndSplit: "按患者分离训练验证测试集，外院数据仅用于最终测试。",
      method: "固定报告生成器，通过检索可信度控制证据进入上下文。",
      baselines: "对照使用相同生成器和检索库但不启用可信度门控。",
      evaluation: "主指标为盲法标注的每报告事实错误率，并报告置信区间。",
      controls: "固定提示词与检索预算，使用患者级配对重采样比较。",
      ethics: "先确认数据协议和伦理要求，仅报告离线技术性能。",
    },
    expectedConclusions: ["若事实错误率降低且区间排除零，则支持当前技术假设。", "若事实错误率未降低或发生恶化，则不支持门控机制。"],
    feasibility: {
      rating: "中", rationale: "方法实现所需资源有限，但外院数据权限尚待确认。",
      resources: ["一张 24 GB GPU 与人工事实标注预算"], blockers: ["外院数据权限与标注人员排期"],
    },
    closestWork: [
      { paperId: papers[0].id, alreadyDone: "已有研究报告检索能够改善内部测试的事实一致性。", difference: "本方案只验证可信度门控对外院数据事实错误的影响。" },
      { paperId: papers[1].id, alreadyDone: "已有研究测量了医院分布变化下的报告生成性能。", difference: "本方案增加固定生成器条件下门控机制的配对对照。" },
    ],
    minimumExperiment: {
      question: "可信度门控是否降低独立外院测试中的报告事实错误率。",
      data: "经授权的独立外院测试集，患者与训练集完全分离。",
      baseline: "使用同一冻结生成器和同一检索库的无门控基线。",
      intervention: "只增加检索可信度阈值，阈值由训练医院验证集确定。",
      primaryMetric: "盲法标注的每报告事实错误率，并给出配对置信区间。",
      successCriterion: "与基线相比错误率降低且差值的配对置信区间排除零。",
      falsificationCriterion: "错误率未降低或置信区间包含零时不支持当前假设。",
      resourceBudget: "一张 24 GB GPU，两周实验时间，标注成本另行估算。",
    },
    paperIds: [papers[0].id, papers[1].id],
    evidenceChain: [
      { claim: "检索曾在内部回顾性测试中改善报告事实一致性。", stance: "支持", paperIds: [papers[0].id], anchors: [{ paperId: papers[0].id, quote: "Retrieval improved factual consistency in generated radiology reports on an internal retrospective test set.", location: "摘要", sourceUrl: "https://untrusted.example/model-supplied" }] },
      { claim: "医院分布变化下的报告生成准确度存在下降风险。", stance: "反对", paperIds: [papers[1].id], anchors: [{ paperId: papers[1].id, quote: "Report generation accuracy declined under hospital distribution shift.", location: "摘要", sourceUrl: papers[1].url }] },
    ],
  };
}

test("a complete idea retains its experiment and source-verified evidence", () => {
  const draft = validDraft();
  const idea = validateIdea(draft, papers, query);
  assert.equal(idea.query, query);
  assert.ok(idea.id);
  assert.ok(Number.isFinite(Date.parse(idea.createdAt)));
  assert.deepEqual(idea.minimumExperiment, draft.minimumExperiment);
  assert.deepEqual(idea.closestWork, draft.closestWork);
  assert.deepEqual(idea.paperIds, [papers[0].id, papers[1].id]);
  assert.equal(idea.evidenceChain?.[0].anchors?.[0].sourceUrl, papers[0].url);
  assert.equal(idea.evidenceChain?.[0].anchors?.[0].quote, draft.evidenceChain[0].anchors[0].quote);
});

test("unknown references are rejected rather than silently removed", () => {
  const unknownReference = validDraft();
  unknownReference.paperIds.push("unprovided-paper");
  assert.throws(() => validateIdea(unknownReference, papers, query), /不存在的论文/);

  const unknownClosestWork = validDraft();
  unknownClosestWork.closestWork[0].paperId = "unprovided-paper";
  assert.throws(() => validateIdea(unknownClosestWork, papers, query), /不存在的论文/);
});

test("a valid paper ID cannot legitimize a fabricated quotation", () => {
  const draft = validDraft();
  draft.evidenceChain[0].anchors[0].quote = "A prospective trial proved that retrieval reduced patient mortality by fifty percent.";
  assert.throws(() => validateIdea(draft, papers, query), /摘录未出现在/);
});

test("every closest-work comparison needs an original-source anchor", () => {
  const draft = validDraft();
  // The evidence chain is independently valid, but does not cite this third paper.
  draft.closestWork[1].paperId = papers[2].id;
  assert.throws(() => validateIdea(draft, papers, query), /相近工作比较必须有原文证据/);
});

test("an idea cannot treat four or more improvements as core contributions", () => {
  const draft = validDraft();
  draft.improvements.slice(0, 4).forEach(item => { item.priority = "核心"; });
  assert.throws(() => validateIdea(draft, papers, query), /1–3 项核心改进/);
});

test("a minimum experiment and its falsification criterion are required", () => {
  const { minimumExperiment: _minimumExperiment, ...missingExperiment } = validDraft();
  assert.throws(() => validateIdea(missingExperiment, papers, query), /minimumExperiment/);

  const draft = validDraft();
  draft.minimumExperiment.falsificationCriterion = "";
  assert.throws(() => validateIdea(draft, papers, query), /minimumExperiment\.falsificationCriterion/);
});

test("missing summary metric reuses the model's explicit primary metric", () => {
  const { metrics: _metrics, ...draft } = validDraft();
  assert.deepEqual(validateIdea(draft, papers, query).metrics, [draft.minimumExperiment.primaryMetric]);
  for (const malformed of [[""], [{ name: "accuracy" }], []]) {
    const withMalformedList = validDraft() as Record<string, unknown>;
    withMalformedList.metrics = malformed;
    assert.deepEqual(validateIdea(withMalformedList, papers, query).metrics, [draft.minimumExperiment.primaryMetric]);
  }
  const missingEverywhere = validDraft();
  delete (missingEverywhere as Partial<typeof missingEverywhere>).metrics;
  missingEverywhere.minimumExperiment.primaryMetric = "";
  assert.throws(() => validateIdea(missingEverywhere, papers, query), /metrics/);
});
