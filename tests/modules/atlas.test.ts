import assert from "node:assert/strict";
import test from "node:test";
import { relatedPapers, coreTimeline } from "../../modules/atlas/relations";
import { normalizePaper } from "../../modules/catalog/papers";
test("atlas handles empty and single-paper corpora independently of search services", () => {
  assert.deepEqual(coreTimeline([]), []);
  const p = normalizePaper({
    id: "only",
    title: "Medical report generation",
    year: 2025,
  });
  assert.deepEqual(relatedPapers([p], p), []);
});

import {
  parseResearchScope,
  papersInScope,
} from "../../modules/atlas/research-scope";
test("switching research direction replaces atlas membership and excludes old history papers", () => {
  const old = normalizePaper({ id: "old", title: "Chest X ray", year: 2025 });
  const next = normalizePaper({
    id: "next",
    title: "Pathology agent",
    year: 2025,
  });
  const all = [old, next];
  assert.deepEqual(
    papersInScope(all, { query: "胸片报告", paperIds: ["old"] }).map(
      (p) => p.id,
    ),
    ["old"],
  );
  assert.deepEqual(
    papersInScope(all, { query: "病理多模态", paperIds: ["next"] }).map(
      (p) => p.id,
    ),
    ["next"],
  );
  assert.deepEqual(
    papersInScope([old], { query: "病理多模态", paperIds: ["next"] }),
    [],
  );
});
test("scope persists only valid query and paper IDs and never falls back to all papers for an empty restored collection", () => {
  const scope = parseResearchScope(
    JSON.stringify({ query: "病理多模态", paperIds: ["next", "next"] }),
  );
  assert.deepEqual(scope, { query: "病理多模态", paperIds: ["next"] });
  assert.equal(parseResearchScope("{broken"), null);
  assert.equal(
    parseResearchScope(JSON.stringify({ query: "病理多模态", paperIds: [5] })),
    null,
  );
  assert.deepEqual(papersInScope([], scope), []);
});

import {
  mergeDirectionHistory,
  parseDirectionHistory,
} from "../../modules/atlas/research-scope";
test("direction history preserves previous labels and replaces only the same direction", () => {
  const a = {
    query: "Chest report",
    paperIds: ["old-a"],
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const b = {
    query: "Pathology agent",
    paperIds: ["b"],
    updatedAt: "2026-02-01T00:00:00Z",
  };
  const refreshed = {
    query: " chest   report ",
    paperIds: ["new-a"],
    updatedAt: "2026-03-01T00:00:00Z",
  };
  const merged = mergeDirectionHistory([a, b], [refreshed]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].paperIds, ["new-a"]);
  assert.deepEqual(merged[1].paperIds, ["b"]);
  assert.equal(
    parseDirectionHistory(
      JSON.stringify([...merged, { query: "bad", paperIds: [] }]),
    ).length,
    2,
  );
});
