import test from "node:test";
import assert from "node:assert/strict";
import { normalizePaper } from "../../modules/catalog/papers";
import {
  planLiteratureSearch,
  matchesLiteraturePlan,
  classifyLiteraturePaper,
} from "../../modules/catalog/search-plan";
import { createResearchSearch } from "../../modules/catalog/research-search";
import { createLexFirstCatalog } from "../../modules/catalog/lex-first";
const focus = {
  searchQuery: "medical agent memory management",
  conceptGroups: [["medical agent"], ["memory management"]],
};
const paper = (id: string, title: string, abstract: string) =>
  normalizePaper({ id, title, abstract: abstract.repeat(4), year: 2025 });
const relevant = paper(
  "memory",
  "Clinical agents with persistent memory",
  "We study agentic language models for clinical decisions using persistent memory and patient history. ",
);
test("medical agent memory uses multiple short queries and accepts conceptual synonyms", () => {
  const plan = planLiteratureSearch("医学Agent + Memory管理", focus);
  assert.equal(plan.queries.length, 9);
  assert.ok(plan.paths.filter(path => path.role === "核心研究").every(path => path.query.split(" ").length <= 5));
  assert.equal(matchesLiteraturePlan(relevant, plan), true);
  assert.equal(
    matchesLiteraturePlan(
      paper(
        "drug",
        "Episodic memory in patients",
        "Pharmacological agents improve episodic memory in medical patients. ",
      ),
      plan,
    ),
    false,
  );
  assert.equal(
    matchesLiteraturePlan(
      paper(
        "gpu",
        "GPU memory for medical language models",
        "Medical large language models reduce GPU memory consumption and memory footprint. ",
      ),
      plan,
    ),
    false,
  );
  assert.equal(
    matchesLiteraturePlan(
      paper(
        "general",
        "Agent memory management",
        "Agentic language models use persistent memory in software tasks. ",
      ),
      plan,
    ),
    false,
  );
});
test("image plus clinical text includes radiology/report terminology without dropping either modality", () => {
  const plan = planLiteratureSearch("医学影像 + 病历文本 Agent", {
    searchQuery: "medical imaging clinical notes agent",
    conceptGroups: [["medical imaging"], ["clinical notes"], ["agent"]],
  });
  assert.equal(
    matchesLiteraturePlan(
      paper(
        "report",
        "Radiology report generation",
        "A multimodal language model generates reports from chest X ray images for radiology. ",
      ),
      plan,
    ),
    true,
  );
  assert.equal(
    matchesLiteraturePlan(
      paper(
        "text",
        "Medical record summarization",
        "A language model summarizes clinical notes in medical records. ",
      ),
      plan,
    ),
    false,
  );
});
test("unrelated primary hits do not prevent supplemental candidate search", async () => {
  let supplementary = 0;
  const unrelated = Array.from({ length: 8 }, (_, i) =>
    paper(
      String(i),
      `Unrelated study number ${i}`,
      "We investigate biology without the requested topic. ",
    ),
  );
  const pipeline = createLexFirstCatalog({
    primary: async () => ({
      papers: unrelated,
      sources: ["Lexmount"],
      errors: [],
    }),
    fallback: async () => {
      supplementary++;
      return { papers: [relevant], sources: ["API candidates"], errors: [] };
    },
    verify: async (p) => p,
  });
  const result = await pipeline.collectPapers(
    "topic",
    "corpus",
    (p) => p.id === "memory",
  );
  assert.equal(supplementary, 1);
  assert.deepEqual(
    result.papers.map((p) => p.id),
    ["memory"],
  );
  assert.equal(result.candidateCount, 9);
});
test("query failures remain visible while synonyms deduplicate across successful paths", async () => {
  let calls = 0;
  const search = createResearchSearch(async () => {
    calls++;
    if (calls === 1) throw Error("429");
    return {
      papers: [relevant],
      sources: ["Lexmount"],
      errors: [],
      candidateCount: 12,
    };
  });
  const result = await search("医学Agent + Memory管理", focus);
  assert.equal(calls, 9);
  assert.equal(result.papers.length, 1);
  assert.equal(result.diagnostics.queries[0].status, "failed");
  assert.equal(result.diagnostics.matched, 1);
});

test("broader paths add historical, adjacent and transferable work without admitting biological or hardware memory", async () => {
  const plan = planLiteratureSearch("医学Agent + Memory管理", focus);
  const history = {
    ...paper(
      "history",
      "Clinical decision support review",
      "Machine learning for clinical decision support used longitudinal patient records and historical patient information. ",
    ),
    year: 2018,
  };
  const adjacent = paper(
    "adjacent",
    "Medical language agents for clinical workflow",
    "Clinical language model agents support medical workflow reasoning and electronic health records without a persistent memory module. ",
  );
  const inspiration = paper(
    "inspiration",
    "Episodic memory retrieval for autonomous agents",
    "Autonomous language model agents use episodic memory retrieval for multi-step software reasoning and planning. ",
  );
  const biology = paper(
    "biology",
    "Episodic memory in medical patients",
    "Pharmacological agents alter episodic memory in clinical patients in a randomized biomedical study. ",
  );
  const hardware = paper(
    "hardware",
    "GPU memory for healthcare models",
    "Medical language models reduce GPU memory consumption and memory footprint for efficient inference. ",
  );
  assert.equal(classifyLiteraturePaper(history, plan), "历史脉络");
  assert.equal(classifyLiteraturePaper(adjacent, plan), "邻近研究");
  assert.equal(classifyLiteraturePaper(inspiration, plan), "跨领域启发");
  assert.equal(classifyLiteraturePaper(biology, plan), null);
  assert.equal(classifyLiteraturePaper(hardware, plan), null);
  const candidates = [
    relevant,
    history,
    adjacent,
    inspiration,
    biology,
    hardware,
  ];
  const search = createResearchSearch(async (_query, _breadth, accepts) => ({
    papers: candidates.filter(accepts),
    sources: ["Lexmount"],
    errors: [],
    candidateCount: candidates.length,
  }));
  const result = await search("医学Agent + Memory管理", focus);
  assert.deepEqual(result.diagnostics.roles, {
    核心研究: 1,
    历史脉络: 1,
    邻近研究: 1,
    跨领域启发: 1,
  });
  assert.equal(result.papers.length, 4);
  assert.equal(result.paperRoles.inspiration, "跨领域启发");
  assert.equal(
    result.papers.some((p) => p.id === "biology" || p.id === "hardware"),
    false,
  );
});
