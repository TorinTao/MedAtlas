import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(path.join(tmpdir(), "medatlas-pubmed-abstracts-"));
let fetchPubMedAbstracts;
try {
  const outfile = path.join(temp, "publications.mjs");
  await build({
    entryPoints: ["platform/sources/publications.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    plugins: [{
      name: "runtime-config",
      setup(plugin) {
        plugin.onResolve({ filter: /^\.\.\/config$/ }, ({ importer }) =>
          importer.endsWith("platform/sources/publications.ts")
            ? { path: "config", namespace: "pubmed-test" }
            : null,
        );
        plugin.onLoad({ filter: /.*/, namespace: "pubmed-test" }, () => ({
          contents: "export const runtime = () => '';",
        }));
      },
    }],
  });
  ({ fetchPubMedAbstracts } = await import(pathToFileURL(outfile)));
} finally {
  await rm(temp, { recursive: true, force: true });
}

test("PubMed backfill extracts labeled abstracts for multiple exact PMIDs", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(new URL(url));
    return new Response(`
      <PubmedArticleSet>
        <PubmedArticle><MedlineCitation><PMID>123</PMID><Article><Abstract>
          <AbstractText Label="BACKGROUND">Chest &amp; clinical imaging.</AbstractText>
          <AbstractText Label="RESULTS">The model improved report quality.</AbstractText>
        </Abstract></Article></MedlineCitation></PubmedArticle>
        <PubmedArticle><MedlineCitation><PMID>456</PMID><Article><Abstract>
          <AbstractText>Agent &lt;benchmark&gt; evaluation.</AbstractText>
        </Abstract></Article></MedlineCitation></PubmedArticle>
        <PubmedArticle><MedlineCitation><PMID>789</PMID><Article><Abstract>
          <AbstractText>Unrequested record.</AbstractText>
        </Abstract></Article></MedlineCitation></PubmedArticle>
      </PubmedArticleSet>
    `, { status: 200 });
  };
  try {
    const abstracts = await fetchPubMedAbstracts(["123", "456", "123", "bad"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].hostname, "eutils.ncbi.nlm.nih.gov");
    assert.equal(calls[0].searchParams.get("id"), "123,456");
    assert.equal(abstracts.get("123"), "Chest & clinical imaging. The model improved report quality.");
    assert.equal(abstracts.get("456"), "Agent <benchmark> evaluation.");
    assert.equal(abstracts.has("789"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PubMed backfill reports an upstream failure without inventing an abstract", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(fetchPubMedAbstracts(["123"]), /PubMed abstract HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
