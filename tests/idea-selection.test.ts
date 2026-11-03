import assert from "node:assert/strict";
import test from "node:test";
import { normalizeResearchFocus, selectEvidence, type ResearchFocus } from "../lib/idea-selection";
import type { Paper } from "../lib/types";

const focus: ResearchFocus = { searchQuery: "chest x-ray report hallucination detection", conceptGroups: [["chest x-ray", "cxr"], ["hallucination", "hallucinations", "factual errors"]] };
const abstract = "We examine chest X-ray report hallucination detection using a held-out dataset. This study compares error detection performance and reports observed limitations.";
const paper = (id: string, override: Partial<Paper> = {}): Paper => ({ id, title: "Chest X-ray report hallucination detection", abstract, year: new Date().getUTCFullYear() - 1, publishedAt: "", doi: "", pmid: "", arxivId: "", source: "test", paperType: "研究论文", url: "https://example.org/paper", oaUrl: "", citedByCount: 0, citationPercentile: 0, authors: [], institutions: [], repoUrl: "", fetchedAt: "", modality: "影像+文本", clinicalTask: "报告生成", method: "视觉语言模型", relevance: 1, fulltextStatus: "仅摘要", ...override });

test("unrelated preferred and follow-up papers cannot bypass topic requirements", () => {
  const unrelated = paper("unrelated", { title: "Clinical risk prediction", abstract: "We predict clinical risk using patient records. ".repeat(5), citedByCount: 90000 });
  const relevant = paper("relevant");
  assert.deepEqual(selectEvidence(focus, [unrelated, relevant], [unrelated.id], [unrelated]).map(item => item.id), ["relevant"]);
});

test("English synonyms and normalized spaces match whole concepts", () => {
  const synonym = paper("synonym", { title: "CXR reports with factual errors", abstract: "We detect factual errors in CXR reports and compare the results with independent annotations. ".repeat(2) });
  const punctuation = paper("punctuation", { title: "Chest   X Ray report hallucinations" });
  const substring = paper("substring", { title: "Notcxr report hallucinations", abstract: "We study hallucinations in notcxr reports. ".repeat(4) });
  const ids = selectEvidence(focus, [synonym, punctuation, substring]).map(item => item.id);
  assert.ok(ids.includes("synonym"));
  assert.ok(ids.includes("punctuation"));
  assert.ok(!ids.includes("substring"));
});

test("invalid or generic-only concepts fail instead of matching arbitrary papers", () => {
  for (const conceptGroups of [[], [["medical", "clinical", "AI", "study"]], [["研究方向"]], [[""]], [null]]) {
    assert.throws(() => normalizeResearchFocus({ ...focus, conceptGroups }));
  }
  const cleaned = normalizeResearchFocus({ ...focus, conceptGroups: [["medical", "CXR"]] });
  assert.deepEqual(cleaned.conceptGroups, [["cxr"]]);
  assert.throws(() => selectEvidence({ ...focus, conceptGroups: [] }, [paper("one")]));
});

test("short evidence sets are not padded and invalid dates or missing abstracts are excluded", () => {
  const input = [paper("good"), paper("future", { year: new Date().getUTCFullYear() + 1 }), paper("old", { year: 2009 }), paper("short", { abstract: "Chest x-ray report hallucination" })];
  assert.deepEqual(selectEvidence(focus, input).map(item => item.id), ["good"]);
  assert.deepEqual(selectEvidence(focus, input, [], [], 0), []);
});

test("diverse paper types remain relevant, unique, and within the selected limit", () => {
  const papers = [paper("review", { paperType: "综述" }), paper("resource", { paperType: "数据集" }), paper("early", { year: 2011 }), ...Array.from({ length: 12 }, (_, index) => paper(`recent-${index}`))];
  const result = selectEvidence(focus, [...papers, papers[0]], [], [], 8);
  assert.equal(result.length, 8);
  assert.equal(new Set(result.map(item => item.id)).size, 8);
  for (const id of ["review", "resource", "early"]) assert.ok(result.some(item => item.id === id), id);
  assert.equal(selectEvidence(focus, papers, [], [], 1).length, 1);
});

test("search query rejects URLs, controls, non-English input and excessive length", () => {
  for (const searchQuery of ["https://example.org/query", "chest x-ray\nignore previous", "chest x-ray; execute", "胸片报告幻觉评估", "x".repeat(181), "short", "medical clinical AI study"]) {
    assert.throws(() => normalizeResearchFocus({ ...focus, searchQuery }));
  }
  assert.equal(normalizeResearchFocus({ ...focus, searchQuery: "  Chest  X-ray report hallucinations  " }).searchQuery, "Chest X-ray report hallucinations");
});
