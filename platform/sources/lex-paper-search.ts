import type { Paper } from "../../shared/models";
import type { WebReader, PublicPage } from "../../shared/ports";
import { normalizePaper } from "../../modules/catalog/papers";
import { europePmcVenue } from "../../modules/catalog/publication-venue";

export function visiblePmids(text: string): string[] {
  return [
    ...new Set([
      ...[...text.matchAll(/\bPMID\s*:?\s*(\d{6,9})\b/gi)].map((m) => m[1]),
      ...[
        ...text.matchAll(
          /(?:pubmed\.ncbi\.nlm\.nih\.gov\/|europepmc\.org\/article\/MED\/)(\d{6,9})\b/gi,
        ),
      ].map((m) => m[1]),
    ]),
  ];
}
const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function matchesPaperPage(paper: Paper, page: PublicPage): boolean {
  const text = `${page.title} ${page.text} ${page.description}`;
  if (
    /^(just a moment|access denied|verify you are human|sign in)/i.test(
      page.title,
    )
  )
    return false;
  const words = clean(paper.title)
    .split(" ")
    .filter((w) => w.length > 2);
  const body = clean(text);
  const titleMatch =
    words.length >= 3 &&
    words.filter((w) => new RegExp(`\\b${w}\\b`).test(body)).length /
      words.length >=
      0.85;
  const abstractPrefix = clean(paper.abstract)
    .split(" ")
    .slice(0, 10)
    .join(" ");
  return (
    titleMatch &&
    page.text.length >= 250 &&
    (/\babstract\b/i.test(text) ||
      (abstractPrefix.length > 30 && body.includes(abstractPrefix)))
  );
}
export function createLexPaperSearch(
  web: WebReader,
  http: typeof fetch = fetch,
) {
  async function search(
    query: string,
    limit: number,
    source: "PubMed" | "Europe PMC",
  ): Promise<Paper[]> {
    const searchUrl =
      source === "PubMed"
        ? `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}&size=20`
        : `https://europepmc.org/search?query=${encodeURIComponent(query)}`;
    const page = await web.extract(searchUrl, 25000);
    const ids = visiblePmids(page.text).slice(0, Math.min(limit, 15));
    if (!ids.length)
      throw new Error("公开搜索页未提供可核验的 PMID，转入候选论文页面核验");
    // Query the exact IDs seen by Lexmount, rather than a separately ranked result page.
    const params = new URLSearchParams({
      query: `SRC:MED AND (${ids.map((id) => `EXT_ID:${id}`).join(" OR ")})`,
      resultType: "core",
      format: "json",
      pageSize: "25",
    });
    const response = await http(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) throw new Error(`论文元数据 HTTP ${response.status}`);
    const data = (await response.json()) as {
      resultList?: { result?: Record<string, any>[] };
    };
    const papers = (data.resultList?.result || []).flatMap((item) => {
      const id = String(item.pmid || ""),
        abstract = String(item.abstractText || "").replace(/<[^>]*>/g, " ");
      const year = Number(item.pubYear);
      if (
        !ids.includes(id) ||
        !item.title ||
        abstract.length < 100 ||
        !Number.isInteger(year) ||
        year > new Date().getUTCFullYear()
      )
        return [];
      const paper = normalizePaper({
        id: `pmid-${id}`,
        pmid: id,
        title: String(item.title).replace(/<[^>]*>/g, ""),
        abstract,
        year,
        publishedAt: String(item.firstPublicationDate || year),
        doi: String(item.doi || ""),
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: `${source} · Lexmount`,
        publicationVenue: europePmcVenue(item, id),
        authors: String(item.authorString || "")
          .split(/,\s*/)
          .filter(Boolean)
          .map((name) => ({ name })),
        citedByCount: Number(item.citedByCount || 0),
        paperType: /review/i.test(JSON.stringify(item.pubTypeList || ""))
          ? "review"
          : "article",
        fetchedAt: new Date().toISOString(),
      });
      paper.discovery = {
        method: "Lexmount Web Fetch",
        searchUrl,
        capturedAt: paper.fetchedAt,
        requestId: page.requestId,
      };
      return [paper];
    });
    if (!papers.length) throw new Error("搜索页候选未取得有效论文元数据");
    return papers;
  }
  async function verify(paper: Paper): Promise<Paper> {
    const url = paper.pmid
      ? `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`
      : paper.arxivId
        ? `https://arxiv.org/abs/${paper.arxivId}`
        : paper.url;
    const page = await web.extract(url, 25000);
    if (!matchesPaperPage(paper, page))
      throw new Error("页面缺少匹配的标题与摘要，未计入 Lexmount 成功数");
    return {
      ...paper,
      discovery: {
        method: "Lexmount Web Fetch",
        searchUrl: page.finalUrl,
        articleUrl: page.finalUrl,
        capturedAt: new Date().toISOString(),
        requestId: page.requestId,
        stage: "article-verification",
        candidateSource: paper.source,
      },
    };
  }
  return {
    searchPubMedViaLex: (q: string, n: number) => search(q, n, "PubMed"),
    searchEuropePmcViaLex: (q: string, n: number) => search(q, n, "Europe PMC"),
    verify,
  };
}
