import assert from "node:assert/strict";
import test from "node:test";
import { createIdeasService } from "../../modules/ideas/service";
import { normalizePaper } from "../../modules/catalog/papers";
test("ideas service uses an injected model without runtime secrets", async () => {
  const service = createIdeasService(async () => ({
    searchQuery: "chest radiograph report generation",
    conceptGroups: [
      ["chest", "radiograph"],
      ["report", "reports"],
    ],
  }));
  assert.equal(
    (await service.makeResearchFocus("胸片报告")).conceptGroups.length,
    2,
  );
});
test("research planning retries invalid paper references once with concrete feedback", async () => {
  const papers = ["one", "two"].map((id) =>
    normalizePaper({
      id,
      title: `Paper ${id}`,
      abstract: "Synthetic source evidence.",
    }),
  );
  let calls = 0;
  const service = createIdeasService(async (_, input) => {
    calls++;
    if (calls === 2) assert.match(JSON.parse(input).revisionFeedback, /论文ID/);
    return {
      landscape: "待检验的研究现状",
      cautions: ["仅摘要", "检索不完整"],
      opportunities: Array.from({ length: 3 }, (_, i) => ({
        gap: `待验证空白${i}`,
        mechanism: `具体机制${i}`,
        nearestPaperIds: calls === 1 ? ["fake", "two"] : ["one", "two"],
        searchQuery: "radiology report generation factuality",
      })),
    };
  });
  const result = await service.makeResearchBrief("方向", papers);
  assert.equal(calls, 2);
  assert.equal(result.opportunities.length, 3);
});
test("a permanently invalid generation is bounded and cannot enter history as a valid card", async () => {
  let calls = 0;
  const service = createIdeasService(async () => {
    calls++;
    return { idea: { title: "Incomplete" } };
  });
  const candidate = {
    id: "one",
    gap: "gap",
    mechanism: "mechanism",
    nearestPaperIds: ["one", "two"],
    searchQuery: "radiology report generation",
  };
  const stages: string[] = [];
  await assert.rejects(
    service.makeIdea(
      "topic",
      [],
      {
        landscape: "x",
        gaps: ["x"],
        cautions: ["x"],
        opportunities: [candidate],
      },
      candidate,
      [],
      {},
      (stage) => { stages.push(stage); },
    ),
    /方案证据核验未通过/,
  );
  assert.equal(calls, 2);
  assert.deepEqual(stages, ["drafting", "verifying", "revising", "verifying"]);
});
