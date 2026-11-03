import assert from "node:assert/strict";
import test from "node:test";
import { classify, dedupePapers, normalizePaper, seedPapers } from "../modules/catalog/papers";
import { safePublicUrl } from "../shared/public-url";
import { coreTimeline, relatedPapers } from "../modules/atlas/relations";
import { githubRepositories } from "../shared/github-links";
import { githubDomEvidence } from "../modules/repositories/dom";
import { needsGeneratedSummary, withSummaryFallback } from "../modules/catalog/summary-fallback";
import { arxivVenue, crossrefVenue, openAlexVenue, pubMedVenue } from "../modules/catalog/publication-venue";
import { normalizeFollowupQueries } from "../modules/ideas/followup-queries";

test("follow-up research queries reject URLs and duplicates", () => {
  assert.deepEqual(normalizeFollowupQueries([
    { query: "radiology report generation retrieval augmented baseline", purpose: "相近方法" },
    { query: "radiology report generation retrieval augmented baseline", purpose: "重复" },
    { query: "https://private.example/path", purpose: "不应访问" },
  ]), [{ query: "radiology report generation retrieval augmented baseline", purpose: "相近方法" }]);
});

test("publication venue stays separate from retrieval source and prefers formal publication", () => {
  const conference = openAlexVenue({ id: "https://openalex.org/W123", type: "conference-paper", primary_location: { source: { display_name: "Proceedings of EMNLP", type: "conference" } } });
  assert.deepEqual(conference, { name: "Proceedings of EMNLP", type: "会议", evidenceUrl: "https://openalex.org/W123" });
  assert.equal(pubMedVenue({ fulljournalname: "Radiology" }, "123")?.name, "Radiology");
  assert.equal(crossrefVenue({ DOI: "10.18653/v1/2021.acl-long.459", type: "proceedings-article", "container-title": ["Proceedings of ACL"] })?.type, "会议");
  const longVenue = "Proceedings of the " + "International Conference on Medical Natural Language Processing ".repeat(4);
  assert.equal(crossrefVenue({ DOI: "10.1000/long", type: "proceedings-article", "container-title": [longVenue] })?.name, longVenue.trim());
  const preprint = normalizePaper({ id: "arxiv-123", title: "Medical Agent", source: "arXiv", arxivId: "2401.12345", paperType: "preprint", publicationVenue: arxivVenue("2401.12345") });
  const published = normalizePaper({ id: "pmid-123", title: "Medical Agent", source: "PubMed", pmid: "123", publicationVenue: pubMedVenue({ fulljournalname: "Radiology" }, "123") });
  const merged = dedupePapers([preprint, published])[0];
  assert.equal(merged.source, "PubMed");
  assert.equal(merged.publicationVenue?.type, "期刊");
  assert.equal(merged.publicationVenue?.name, "Radiology");
});

test("every visible paper has a Chinese overview before AI backfill", () => {
  const missing = normalizePaper({ id: "pending-summary", title: "Medical Image Reasoning", abstract: "We investigate medical image reasoning." });
  const visible = withSummaryFallback(missing);
  assert.match(visible.summaryZh || "", /[\u3400-\u9fff]/);
  assert.equal(visible.summaryBasis, "元数据");
  assert.equal(needsGeneratedSummary(visible), true);
  const generated = { ...visible, summaryZh: "研究医学图像推理。", summaryBasis: "摘要" as const };
  assert.equal(withSummaryFallback(generated).summaryZh, generated.summaryZh);
  assert.equal(needsGeneratedSummary(generated), false);
});

test("paper code links are normalized without guessing from multiple candidates", () => {
  assert.deepEqual(githubRepositories("Code: https://github.com/wang-zhanyu/R2GenGPT. See https://github.com/wang-zhanyu/R2GenGPT/tree/main"), ["https://github.com/wang-zhanyu/R2GenGPT"]);
  assert.deepEqual(githubRepositories("https://github.com/features/actions"), []);
  const paper = normalizePaper({ id: "code-link", title: "Medical Image Report Agent", abstract: "Code available at https://github.com/example/medical-agent." });
  assert.equal(paper.repoUrl, "https://github.com/example/medical-agent");
  assert.equal(normalizePaper({ id: "ambiguous", title: "Medical Image Report Agent", abstract: "https://github.com/a/one and https://github.com/b/two" }).repoUrl, "");
});

test("GitHub DOM fallback exposes file and README evidence without inventing absent files", () => {
  const html = '<a href="/lab/model/blob/main/LICENSE">LICENSE</a><a href="/lab/model/blob/main/train.py">train.py</a><article class="markdown-body"><h1>Model</h1><p>Run training</p></article>';
  const evidence = githubDomEvidence(html, "https://github.com/lab/model");
  assert.deepEqual(evidence.files.map(file => file.name), ["license", "train.py"]);
  assert.equal(evidence.files[0].url, "https://github.com/lab/model/blob/main/LICENSE");
  assert.equal(evidence.readme, "Model Run training");
});

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

test("related-work lines require evidence beyond a shared category", () => {
  const selected = normalizePaper({ id: "a", title: "Radiology Report Generation with Knowledge Graphs", year: 2023, citedByCount: 30 });
  const related = normalizePaper({ id: "b", title: "Knowledge Graphs for Radiology Report Generation", year: 2024, citedByCount: 25 });
  const unrelated = normalizePaper({ id: "c", title: "Clinical Image Classification with Neural Networks", year: 2024, citedByCount: 20 });
  assert.deepEqual(relatedPapers([selected, related, unrelated], selected).map(item => item.paper.id), ["b"]);
});

test("core timeline uses citation impact and chronological order", () => {
  const early = normalizePaper({ id: "early", title: "Early work", year: 2020, citedByCount: 120 });
  const late = normalizePaper({ id: "late", title: "Later work", year: 2024, citedByCount: 220 });
  const minor = normalizePaper({ id: "minor", title: "Minor work", year: 2022, citedByCount: 2 });
  assert.deepEqual(coreTimeline([late, minor, early]).map(paper => paper.id), ["early", "late"]);
});
