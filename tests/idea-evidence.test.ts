import assert from "node:assert/strict";
import test from "node:test";
import { evidenceSources, sourcePapers, validateEvidenceChain } from "../modules/ideas/evidence";
import { normalizePaper } from "../modules/catalog/papers";
import type { Paper } from "../shared/models";

const firstQuote = "The model was evaluated on an external chest radiograph dataset.";
const secondQuote = "Performance declined under distribution shifts between hospitals.";
const fullQuote = "Patient identifiers were used to prevent overlap between training and test cohorts.";
const papers = [
  normalizePaper({ id: "paper-one", title: "External imaging evaluation", abstract: firstQuote, url: "https://example.org/one", year: 2025 }),
  normalizePaper({ id: "paper-two", title: "Hospital distribution shifts", abstract: secondQuote, url: "https://example.org/two", year: 2025 }),
];
const chain = () => [
  { claim: "第一篇报告了外部数据集评估。", stance: "支持", paperIds: [papers[0].id], anchors: [{ paperId: papers[0].id, quote: firstQuote, location: "摘要", sourceUrl: "https://untrusted.example/forged" }] },
  { claim: "第二篇报告跨医院分布变化时性能下降。", stance: "反对", paperIds: [papers[1].id], anchors: [{ paperId: papers[1].id, quote: secondQuote, location: "摘要" }] },
];

test("evidence quotes match original text with whitespace normalization and trusted source URLs", () => {
  const input = chain();
  input[0].anchors[0].quote = firstQuote.replace("model was", "model \n was");
  const verified = validateEvidenceChain(input, papers);
  assert.equal(verified[0].anchors[0].quote, firstQuote);
  assert.equal(verified[0].anchors[0].sourceUrl, papers[0].url);
  assert.equal(verified[1].anchors[0].sourceUrl, papers[1].url);
  assert.equal(JSON.stringify(verified).includes("untrusted.example"), false);
});

test("real paper IDs cannot legitimize fabricated or misattributed quotes", () => {
  const fabricated = chain();
  fabricated[0].anchors[0].quote = "The system has been clinically proven to improve patient outcomes.";
  assert.throws(() => validateEvidenceChain(fabricated, papers), /摘录未出现/);
  const wrongPaper = chain();
  wrongPaper[0].anchors[0].quote = secondQuote;
  assert.throws(() => validateEvidenceChain(wrongPaper, papers), /摘录未出现/);
  const invented = chain();
  invented[0].paperIds = ["invented-paper"];
  assert.throws(() => validateEvidenceChain(invented, papers), /未提供的论文/);
});

test("all references need matching anchors and valid locations", () => {
  const missing = chain();
  missing[0].paperIds.push(papers[1].id);
  assert.throws(() => validateEvidenceChain(missing, papers), /每篇引用论文/);
  const mismatched = chain();
  mismatched[0].anchors[0].paperId = papers[1].id;
  assert.throws(() => validateEvidenceChain(mismatched, papers), /与引用论文不一致/);
  const wrongLocation = chain();
  wrongLocation[0].anchors[0].location = "全文摘录";
  assert.throws(() => validateEvidenceChain(wrongLocation, papers), /指定位置/);
});

test("full-text source excerpts require full-text analysis and never include generated findings", () => {
  const paper: Paper = { ...papers[0], analysis: { question: "问题", method: "方法", datasets: [], findings: ["模型生成的结论"], limitations: ["模型生成的局限"], evidence: [{ claim: "已按患者划分", location: "全文", excerpt: fullQuote }], depth: "全文", sourceUrl: "https://example.org/fulltext", analyzedAt: "2026-11-03" } };
  const input = chain();
  input[0].anchors[0].quote = fullQuote;
  input[0].anchors[0].location = "全文摘录";
  assert.equal(validateEvidenceChain(input, [paper, papers[1]])[0].anchors[0].sourceUrl, paper.analysis!.sourceUrl);
  assert.equal(evidenceSources(paper).length, 2);
  assert.equal(JSON.stringify(sourcePapers([paper])).includes("模型生成"), false);
  const abstractOnly: Paper = { ...paper, analysis: { ...paper.analysis!, depth: "摘要" } };
  assert.equal(evidenceSources(abstractOnly).length, 1);
  assert.throws(() => validateEvidenceChain(input, [abstractOnly, papers[1]]), /摘录未出现/);
});

test("empty, excessive, malformed or insufficient evidence fails explicitly", () => {
  for (const value of [null, {}, [], [null, null], [{}, {}], chain().slice(0, 1), Array.from({ length: 9 }, () => chain()[0])]) {
    assert.throws(() => validateEvidenceChain(value, papers));
  }
  const onePaper = [chain()[0], chain()[0]];
  assert.throws(() => validateEvidenceChain(onePaper, papers), /至少 2 篇/);
  const tooManyAnchors = chain();
  tooManyAnchors[0].anchors = Array.from({ length: 4 }, () => chain()[0].anchors[0]);
  assert.throws(() => validateEvidenceChain(tooManyAnchors, papers), /1–3 个原文锚点/);
  for (const quote of ["Too short", "x".repeat(601)]) {
    const input = chain(); input[0].anchors[0].quote = quote;
    assert.throws(() => validateEvidenceChain(input, papers), /20–600/);
  }
});

test("source input preserves the abstract up to its explicit cap", () => {
  const paper = { ...papers[0], abstract: "a".repeat(13000) };
  assert.equal(evidenceSources(paper)[0].text.length, 12000);
  assert.equal(sourcePapers([paper])[0].sources[0].text, "a".repeat(12000));
});
