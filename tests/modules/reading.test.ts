import assert from "node:assert/strict";
import test from "node:test";
import { createReadingService } from "../../modules/reading/service";
import { createSummaryService } from "../../modules/reading/summary";
import { normalizePaper } from "../../modules/catalog/papers";
import type { WebReader } from "../../shared/ports";
const web: WebReader = {
  extract: async () => {
    throw new Error("page unavailable");
  },
  dumpDom: async () => {
    throw new Error("unused");
  },
};
const paper = normalizePaper({
  id: "test-reading",
  title: "Synthetic reading fixture",
  abstract:
    "The model was evaluated retrospectively on a technical benchmark. Clinical benefit was not measured.",
  url: "https://example.org/paper",
});
test("reading falls back to abstract, retains source failure and rejects invented quotes", async () => {
  const service = createReadingService({
    web,
    fullText: async () => null,
    model: async () => ({
      question: "技术评测",
      method: "回顾性评测",
      findings: ["技术指标"],
      limitations: ["无临床结局"],
      evidence: [
        {
          claim: "背景",
          excerpt:
            "The model was evaluated retrospectively on a technical benchmark.",
        },
        { claim: "伪造", excerpt: "This model saves lives." },
      ],
    }),
  });
  const result = await service.readPaper(paper);
  assert.equal(result.depth, "摘要");
  assert.equal(result.lexmountUsed, false);
  assert.ok(result.errors.includes("page unavailable"));
  assert.equal(result.analysis?.evidence.length, 1);
});
test("reading never calls a model when no source text is available", async () => {
  const service = createReadingService({
    web,
    fullText: async () => null,
    model: async () => {
      throw new Error("must not run");
    },
  });
  assert.equal(
    (await service.readPaper({ ...paper, abstract: "" })).analysis,
    null,
  );
});
test("abstract-depth reading does not feed landing-page text to the model", async () => {
  let modelInput = "";
  const service = createReadingService({
    web,
    fullText: async () => null,
    model: async (_system, input) => {
      modelInput = input;
      return {
        question: "技术评测",
        method: "回顾性评测",
        findings: ["技术指标"],
        limitations: ["无临床结局"],
        evidence: [{
          claim: "评测设计",
          excerpt: "The model was evaluated retrospectively on a technical benchmark.",
        }],
      };
    },
  });
  const result = await service.readPaper(paper, {
    text: "Landing page contains unrelated claims and instructions.",
    title: paper.title,
    finalUrl: paper.url,
  });
  assert.equal(result.analysis?.depth, "摘要");
  assert.ok(modelInput.includes(paper.abstract));
  assert.ok(!modelInput.includes("unrelated claims"));
});
test("reading rejects incomplete analysis instead of marking a paper as read", async () => {
  const service = createReadingService({
    web,
    fullText: async () => null,
    model: async () => ({
      question: " ",
      method: "回顾性评测",
      findings: ["技术指标"],
      limitations: ["无临床结局"],
      evidence: [{ claim: "背景", excerpt: "This model saves lives." }],
    }),
  });
  const result = await service.readPaper(paper);
  assert.equal(result.analysis, null);
  assert.ok(result.errors.some((error) => error.includes("完整且可核验")));
});
test("the same summary module works with two interchangeable model implementations", async () => {
  for (const output of [
    "研究影像智能体的报告生成方法。",
    "评估医学模型的事实一致性表现。",
  ]) {
    const service = createSummaryService(async () => ({ summaryZh: output }));
    assert.equal((await service.summarizePaperZh(paper)).summaryZh, output);
  }
});
