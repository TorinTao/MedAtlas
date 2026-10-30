import type { Paper, PublicationVenue } from "./types";

type OpenAlexSource = { display_name?: string; type?: string };
type OpenAlexLocation = { source?: OpenAlexSource | null };
type OpenAlexWork = { id?: string; type?: string; primary_location?: OpenAlexLocation | null; locations?: OpenAlexLocation[] };

const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);

export function openAlexVenue(work: OpenAlexWork): PublicationVenue | undefined {
  const candidates = [work.primary_location, ...(work.locations || [])].filter(Boolean) as OpenAlexLocation[];
  const location = candidates.find(item => /^(journal|conference)$/i.test(item.source?.type || ""))
    || candidates.find(item => clean(item.source?.display_name));
  const name = clean(location?.source?.display_name);
  if (!name || !work.id?.startsWith("https://openalex.org/W")) return;
  const type = work.type === "conference-paper" || location?.source?.type === "conference" ? "会议"
    : location?.source?.type === "journal" ? "期刊"
    : /arxiv|medrxiv|biorxiv|preprint/i.test(name) ? "预印本平台"
    : "其他";
  return { name, type, evidenceUrl: work.id };
}

export function pubMedVenue(record: { fulljournalname?: string; source?: string }, pmid: string): PublicationVenue | undefined {
  const name = clean(record.fulljournalname || record.source);
  return name ? { name, type: "期刊", evidenceUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` } : undefined;
}

export function crossrefVenue(record: { DOI?: string; type?: string; "container-title"?: string[]; event?: { name?: string } }): PublicationVenue | undefined {
  const name = clean(record["container-title"]?.[0] || record.event?.name);
  const doi = clean(record.DOI);
  if (!name || !doi) return;
  const type = record.type === "proceedings-article" ? "会议" : record.type === "journal-article" ? "期刊" : record.type === "posted-content" ? "预印本平台" : "其他";
  return { name, type, evidenceUrl: `https://api.crossref.org/works/${encodeURIComponent(doi)}` };
}

export function europePmcVenue(record: { journalTitle?: string; journalInfo?: { journal?: { title?: string } } }, pmid: string): PublicationVenue | undefined {
  const name = clean(record.journalTitle || record.journalInfo?.journal?.title);
  return name ? { name, type: "期刊", evidenceUrl: `https://europepmc.org/article/MED/${pmid}` } : undefined;
}

export function arxivVenue(id: string): PublicationVenue {
  return { name: "arXiv", type: "预印本平台", evidenceUrl: `https://arxiv.org/abs/${id.replace(/v\d+$/, "")}` };
}

export function bestVenue(first?: PublicationVenue, second?: PublicationVenue): PublicationVenue | undefined {
  const rank = (value?: PublicationVenue) => !value ? -1 : value.type === "待核验" ? 0 : value.type === "其他" ? 1 : value.type === "预印本平台" ? 2 : 3;
  return rank(second) > rank(first) ? second : first || second;
}

export function withVenueFallback(paper: Paper): Paper {
  if (paper.publicationVenue) return paper;
  if (paper.arxivId && (paper.source === "arXiv" || /^https:\/\/arxiv\.org\//i.test(paper.url))) {
    return { ...paper, publicationVenue: arxivVenue(paper.arxivId) };
  }
  return paper;
}

export function needsVenueLookup(paper: Paper, now = Date.now()): boolean {
  const venue = paper.publicationVenue;
  return !venue || (venue.type === "待核验" && (!venue.checkedAt || now - Date.parse(venue.checkedAt) > 7 * 86400000));
}

export function unknownVenue(paper: Paper): PublicationVenue {
  return { name: "发表载体待核验", type: "待核验", evidenceUrl: paper.url, checkedAt: new Date().toISOString() };
}
