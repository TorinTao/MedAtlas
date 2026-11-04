import assert from "node:assert/strict";
import test from "node:test";
import {
  createPaperLinkImporter,
  publicPaperLink,
} from "../../modules/workspace/paper-link";
import type { Paper } from "../../shared/models";
import type { PublicPage } from "../../shared/ports";
const title = "Memory management for clinical language agents";
const abstract =
  "We study memory management for clinical language agents using longitudinal records. Our experiments compare retrieval strategies on a public benchmark and report accuracy and resource use.";
function fixture(
  options: {
    invented?: boolean;
    failEnrich?: boolean;
    challenge?: boolean;
  } = {},
) {
  const rows = new Map<string, Paper>(),
    saved = new Map<string, Set<string>>();
  let reads = 0;
  const page: PublicPage = {
    title,
    text: abstract,
    description: "",
    author: "Test Author",
    publishTime: "2024",
    requestId: "lex-test-request",
    finalUrl: "https://arxiv.org/abs/2401.12345",
  };
  const run = createPaperLinkImporter({
    web: {
      extract: async () => {
        reads++;
        return options.challenge ? { ...page, title: "Just a moment" } : page;
      },
      dumpDom: async () => ({ html: "", finalUrl: "" }),
    },
    model: async () => ({
      isPaper: true,
      title,
      abstract: options.invented
        ? abstract + " Unverified clinical benefit."
        : abstract,
      year: 2024,
    }),
    papers: {
      all: async () => [...rows.values()],
      find: async (id) => rows.get(id),
      put: async (papers) => {
        papers.forEach((p) => rows.set(p.id, p));
      },
    },
    items: {
      setPaper: async (user, id) => {
        const set = saved.get(user) || new Set<string>();
        set.add(id);
        saved.set(user, set);
      },
    },
    enrich: async (paper) => {
      if (options.failEnrich) throw Error("unavailable");
      return {
        paper: { ...paper, summaryZh: "研究临床智能体的记忆管理。" },
        warnings: [],
      };
    },
  });
  return { run, rows, saved, reads: () => reads };
}
test("normalizes arXiv PDF and DOI and rejects private or signed URLs", () => {
  assert.equal(
    publicPaperLink("https://arxiv.org/pdf/2401.12345v2.pdf?download=1"),
    "https://arxiv.org/abs/2401.12345v2",
  );
  assert.equal(
    publicPaperLink("10.1000/example"),
    "https://doi.org/10.1000/example",
  );
  for (const url of [
    "http://example.org/a",
    "https://127.0.0.1/a",
    "https://private.local/a",
    "https://example.org/a?token=secret",
    "https://example.org/a.pdf",
  ])
    assert.throws(() => publicPaperLink(url));
});
test("imports evidence, saves only to owner, and deduplicates repeat imports", async () => {
  const f = fixture();
  const result = await f.run("owner", "https://arxiv.org/pdf/2401.12345.pdf");
  assert.equal(result.paper.summaryZh, "研究临床智能体的记忆管理。");
  assert.equal(result.paper.discovery?.requestId, "lex-test-request");
  assert.equal(result.paper.year, 2024);
  assert.equal(result.lexmountUsed, true);
  assert.equal(f.saved.get("other"), undefined);
  assert.equal(
    (await f.run("owner", "https://arxiv.org/abs/2401.12345v2")).alreadyKnown,
    true,
  );
  assert.equal(f.rows.size, 1);
  assert.equal(f.saved.get("owner")?.size, 1);
});
test("unauthenticated and private URLs never reach external provider", async () => {
  const f = fixture();
  await assert.rejects(f.run("", "https://arxiv.org/abs/2401.12345"));
  await assert.rejects(f.run("owner", "https://10.0.0.1/a"));
  assert.equal(f.reads(), 0);
});
test("fabricated abstract and access challenge never become saved papers", async () => {
  for (const options of [{ invented: true }, { challenge: true }]) {
    const f = fixture(options);
    await assert.rejects(f.run("owner", "https://arxiv.org/abs/2401.12345"));
    assert.equal(f.rows.size, 0);
    assert.equal(f.saved.size, 0);
  }
});
test("translation outage preserves verified paper with explicit retry warning", async () => {
  const f = fixture({ failEnrich: true });
  const result = await f.run("owner", "https://arxiv.org/abs/2401.12345");
  assert.equal(f.rows.size, 1);
  assert.equal(result.warnings.length, 1);
});
