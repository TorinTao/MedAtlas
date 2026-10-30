import { env } from "cloudflare:workers";
import { runtime } from "./runtime";
import { allPapers, putPapers } from "./store";
import { needsVenueLookup, openAlexVenue, pubMedVenue, unknownVenue } from "./publication-venue";
import type { Paper, PublicationVenue } from "./types";

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(14000) });
  if (!response.ok) throw new Error(`发表信息来源 HTTP ${response.status}`);
  return response.json();
}

async function openAlexLookup(paper: Paper): Promise<PublicationVenue | undefined> {
  const params = new URLSearchParams({ select: "id,type,primary_location,locations" });
  const key = runtime("OPENALEX_API_KEY");
  if (key) params.set("api_key", key);
  if (/^W\d+$/.test(paper.id)) {
    const work = await getJson(`https://api.openalex.org/works/${paper.id}?${params}`);
    return openAlexVenue(work);
  }
  if (!paper.doi) return;
  params.set("filter", `doi:${paper.doi}`);
  params.set("per-page", "1");
  const data = await getJson(`https://api.openalex.org/works?${params}`);
  return data.results?.[0] ? openAlexVenue(data.results[0]) : undefined;
}

export async function backfillPublicationVenues(limit = 40) {
  if (!env.DB) throw new Error("文献数据库不可用");
  const papers = await allPapers();
  const pending = papers.filter(paper => needsVenueLookup(paper));
  if (!pending.length) return { processed: 0, remaining: 0, verified: 0, pending: 0, errors: [] as string[] };
  const selected = pending.slice(0, Math.max(1, Math.min(40, limit)));
  const found = new Map<string, PublicationVenue>();
  const errors: string[] = [];
  const pmids = [...new Set(selected.map(paper => paper.pmid).filter(Boolean))];
  let pubmedFailed = false;
  if (pmids.length) {
    try {
      const params = new URLSearchParams({ db: "pubmed", id: pmids.join(","), retmode: "json" });
      const data = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${params}`);
      for (const paper of selected) {
        const record = paper.pmid && data.result?.[paper.pmid];
        const venue = record && pubMedVenue(record, paper.pmid);
        if (venue) found.set(paper.id, venue);
      }
    } catch (cause) {
      pubmedFailed = true;
      errors.push(`PubMed：${(cause as Error).message}`);
    }
  }
  const openAlexPapers = selected.filter(paper => !found.has(paper.id) && (paper.doi || /^W\d+$/.test(paper.id)));
  let openAlexFailed = false;
  for (let offset = 0; offset < openAlexPapers.length; offset += 3) {
    const results = await Promise.allSettled(openAlexPapers.slice(offset, offset + 3).map(openAlexLookup));
    results.forEach((result, index) => {
      const paper = openAlexPapers[offset + index];
      if (result.status === "fulfilled") {
        if (result.value) found.set(paper.id, result.value);
      } else {
        openAlexFailed = true;
        if (errors.length < 4) errors.push(`OpenAlex ${paper.id}：${result.reason?.message || "请求失败"}`);
      }
    });
  }
  const updated = selected.flatMap(paper => {
    const venue = found.get(paper.id);
    if (venue) return [{ ...paper, publicationVenue: venue }];
    if ((paper.pmid && pubmedFailed) || ((paper.doi || /^W\d+$/.test(paper.id)) && openAlexFailed)) return [];
    return [{ ...paper, publicationVenue: unknownVenue(paper) }];
  });
  if (updated.length) await putPapers(updated);
  return { processed: updated.length, remaining: pending.length - updated.length, verified: updated.filter(paper => paper.publicationVenue?.type !== "待核验").length, pending: updated.filter(paper => paper.publicationVenue?.type === "待核验").length, errors };
}
