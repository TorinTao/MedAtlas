import assert from "node:assert/strict";
import test from "node:test";
import { classify, dedupePapers, normalizePaper, seedPapers } from "../lib/papers";
import { safePublicUrl } from "../lib/url";

test("method legend recognizes common medical Agent and VLM terminology", () => {
  assert.equal(classify("AgentClinic: a benchmark for tool-using clinical AI agents").method, "Agent 协作");
  assert.equal(classify("A VLM-Based Automatic Radiological Reporting System").method, "视觉语言模型");
  assert.equal(classify("Retrieval-Augmented Clinical Decision Support").method, "检索增强");
});

test("method labels split formerly generic papers without guessing a method", () => {
  assert.equal(classify("Artificial Intelligence-Generated Electronic Medical Record Summarization").method, "生成式模型");
  assert.equal(classify("Multimodal Deep Learning for Diabetic Retinopathy").method, "多模态融合");
  assert.equal(classify("Machine-Learning-Powered X-ray Classification").method, "预测与分类");
  assert.equal(classify("A Benchmark for Chest X-ray Classification").method, "评测与资源");
  assert.equal(classify("Artificial Intelligence in Radiology: A Review").method, "综述与趋势");
  assert.equal(classify("Safety of alternating denosumab in children").method, "待核验");
});

test("preprint and published paper share one record with both identifiers", () => {
  const preprint = normalizePaper({ id: "arxiv-1", title: "A Multimodal Medical Agent", year: 2024, arxivId: "2401.00001", paperType: "preprint", abstract: "Short abstract" });
  const published = normalizePaper({ id: "pmid-1", title: "A Multimodal Medical Agent", year: 2025, doi: "https://doi.org/10.1000/example", pmid: "12345", abstract: "Longer published abstract text" });
  const result = dedupePapers([preprint, published]);
  assert.equal(result.length, 1);
  assert.equal(result[0].paperType, "研究论文");
  assert.equal(result[0].arxivId, "2401.00001");
  assert.equal(result[0].doi, "10.1000/example");
  assert.equal(result[0].pmid, "12345");
  assert.equal(result[0].abstract, "Longer published abstract text");
});

test("public URL gate rejects private and credentialed targets", () => {
  assert.equal(safePublicUrl("https://arxiv.org/abs/2306.00890"), true);
  for (const value of ["http://arxiv.org", "https://user:pass@arxiv.org/", "https://localhost/", "https://127.0.0.1/", "https://192.168.1.2/", "https://[::1]/"]) assert.equal(safePublicUrl(value), false);
});

test("seed corpus preserves source and stable paper identity", () => {
  assert.ok(seedPapers.length >= 10);
  assert.equal(new Set(seedPapers.map(p => p.id)).size, seedPapers.length);
  assert.ok(seedPapers.every(p => p.title && p.url && p.source));
});

test("arXiv metadata links are upgraded to HTTPS before Web Fetch", () => {
  const paper = normalizePaper({ id: "arxiv-2", title: "Clinical Image Agent", url: "http://arxiv.org/abs/2401.00002", oaUrl: "http://arxiv.org/html/2401.00002" });
  assert.equal(paper.url, "https://arxiv.org/abs/2401.00002");
  assert.equal(paper.oaUrl, "https://arxiv.org/html/2401.00002");
});
