import test from "node:test";
import assert from "node:assert/strict";
import { createLexFirstCatalog } from "../../modules/catalog/lex-first";
import {
  createLexPaperSearch,
  matchesPaperPage,
  visiblePmids,
} from "../../platform/sources/lex-paper-search";
import { normalizePaper, dedupePapers } from "../../modules/catalog/papers";
import type { PublicPage } from "../../shared/ports";
const paper = normalizePaper({
  id: "fixture",
  title: "Multimodal clinical agent evaluation",
  abstract:
    "This work evaluates multimodal clinical agents against established baselines using public benchmark data. ".repeat(
      3,
    ),
  year: 2025,
  url: "https://arxiv.org/abs/2306.00890",
});
const result = (papers = [] as (typeof paper)[]) => ({
  papers,
  sources: [],
  errors: [],
});
const page: PublicPage = {
  title: paper.title,
  text: `Abstract ${paper.abstract}`,
  description: "",
  finalUrl: paper.url,
  author: "",
  publishTime: "",
  requestId: "fixture-request",
};
test("Lexmount primary runs before candidate APIs, which are skipped when sufficient", async () => {
  let fallback = 0;
  const service = createLexFirstCatalog({
    primary: async () =>
      result(
        Array.from({ length: 8 }, (_, i) => ({ ...paper, id: String(i) })),
      ),
    fallback: async () => {
      fallback++;
      return result();
    },
    verify: async () => {
      throw Error("must not run");
    },
  });
  assert.equal((await service.collectPapers("topic")).papers.length, 8);
  assert.equal(fallback, 0);
});
test("old Lexmount tags cannot substitute for a fresh failed verification", async () => {
  const order: string[] = [];
  const tagged = {
    ...paper,
    discovery: {
      method: "Lexmount Web Fetch" as const,
      searchUrl: paper.url,
      requestId: "old",
      capturedAt: "2020-01-01",
    },
  };
  const service = createLexFirstCatalog({
    primary: async () => {
      order.push("lex");
      return result();
    },
    fallback: async () => {
      order.push("api");
      return result([tagged]);
    },
    verify: async () => {
      order.push("verify");
      throw Error("429");
    },
  });
  const r = await service.collectPapers("topic");
  assert.deepEqual(order, ["lex", "api", "verify"]);
  assert.equal(r.papers.length, 0);
  assert.match(r.errors.join(" "), /429/);
});
test("fallback retains only currently verified candidates and their provenance", async () => {
  const service = createLexFirstCatalog({
    primary: async () => result(),
    fallback: async () => result([paper]),
    verify: createLexPaperSearch({
      extract: async () => page,
      dumpDom: async () => {
        throw Error("unused");
      },
    }).verify,
  });
  const r = await service.collectPapers("topic");
  assert.equal(r.papers.length, 1);
  assert.equal(r.papers[0].discovery?.requestId, "fixture-request");
  assert.equal(r.papers[0].discovery?.searchUrl, page.finalUrl);
});
test("page verification rejects interstitials and unrelated articles", () => {
  assert.equal(matchesPaperPage(paper, page), true);
  assert.equal(
    matchesPaperPage(paper, { ...page, title: "Just a moment" }),
    false,
  );
  assert.equal(
    matchesPaperPage(paper, {
      ...page,
      title: "Unrelated subject",
      text: "Abstract " + "Unrelated science. ".repeat(30),
    }),
    false,
  );
});
test("PMID extraction tolerates page format changes; metadata must match visible IDs", async () => {
  assert.deepEqual(
    visiblePmids(
      "PMID 12345678 https://pubmed.ncbi.nlm.nih.gov/12345678/ PMID: 23456789",
    ),
    ["12345678", "23456789"],
  );
  const search = createLexPaperSearch(
    {
      extract: async () => ({ ...page, text: "Results\nPMID: 12345678" }),
      dumpDom: async () => {
        throw Error("unused");
      },
    },
    async (url) => {
      assert.match(String(url), /EXT_ID%3A12345678/);
      return Response.json({
        resultList: {
          result: [
            {
              pmid: "12345678",
              title: paper.title,
              abstractText: paper.abstract,
              pubYear: "2025",
            },
            {
              pmid: "99999999",
              title: "Not seen",
              abstractText: paper.abstract,
              pubYear: "2025",
            },
          ],
        },
      });
    },
  );
  const r = await search.searchPubMedViaLex("topic", 12);
  assert.equal(r.length, 1);
  assert.equal(r[0].pmid, "12345678");
  assert.equal(r[0].discovery?.requestId, "fixture-request");
});
test("merging stored metadata cannot replace newer Lexmount provenance", () => {
  const discovery = {
    method: "Lexmount Web Fetch" as const,
    searchUrl: paper.url,
    requestId: "new",
    capturedAt: "2026-11-04T01:00:00Z",
  };
  const r = dedupePapers([
    { ...paper, discovery },
    {
      ...paper,
      discovery: {
        ...discovery,
        requestId: "old",
        capturedAt: "2026-10-01T01:00:00Z",
      },
    },
  ]);
  assert.equal(r[0].discovery?.requestId, "new");
});
