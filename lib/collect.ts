import { cleanDoi, dedupePapers, normalizePaper } from "./papers";
import type { Paper } from "./types";
import { runtime } from "./runtime";

const NOW = () => new Date().toISOString();
const xmlText = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const tag = (s: string, name: string) => xmlText((s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i")) || [])[1] || "");
async function getJson(url: string): Promise<any> { const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(`Source HTTP ${r.status}`); return r.json(); }

export function englishQuery(input: string) {
  const dictionary: Record<string, string> = { "医学影像": "medical imaging", "病历": "clinical notes", "报告": "radiology report", "智能体": "agent", "多模态": "multimodal", "诊断": "diagnosis", "临床": "clinical", "病理": "pathology", "胸片": "chest x-ray", "问答": "question answering" };
  let value = input.trim();
  for (const [zh, en] of Object.entries(dictionary)) value = value.replaceAll(zh, ` ${en} `);
  return value.replace(/[，。+、／/]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "multimodal medical imaging clinical notes agent";
}

export async function searchOpenAlex(query: string, limit = 20): Promise<Paper[]> {
  const params = new URLSearchParams({ search: query, "per-page": String(limit), select: "id,doi,display_name,publication_year,publication_date,cited_by_count,type,authorships,primary_location,ids,abstract_inverted_index,best_oa_location,cited_by_percentile_year" });
  const key = runtime("OPENALEX_API_KEY"); if (key) params.set("api_key", key);
  const data = await getJson(`https://api.openalex.org/works?${params}`);
  return (data.results || []).map((w: any) => {
    const inv = w.abstract_inverted_index || {}; const words: string[] = Array.from({ length: Math.min(2000, Math.max(-1, ...Object.values(inv).flat() as number[]) + 1) });
    for (const [word, positions] of Object.entries(inv)) for (const p of positions as number[]) if (p < words.length) words[p] = word;
    const authors = (w.authorships || []).slice(0, 12).map((a: any) => ({ name: a.author?.display_name || "", id: a.author?.id || "" }));
    const institutions = [...new Set<string>((w.authorships || []).flatMap((a: any) => (a.institutions || []).map((i: any) => i.display_name).filter(Boolean)))].slice(0, 8);
    return normalizePaper({ id: String(w.id || "").split("/").pop() || crypto.randomUUID(), title: w.display_name || "Untitled", abstract: words.filter(Boolean).join(" "), year: w.publication_year, publishedAt: w.publication_date, doi: w.doi, pmid: String(w.ids?.pmid || "").split("/").pop(), source: "OpenAlex", paperType: w.type, url: w.primary_location?.landing_page_url || w.doi || w.id, oaUrl: w.best_oa_location?.landing_page_url || w.best_oa_location?.pdf_url || "", citedByCount: w.cited_by_count, citationPercentile: w.cited_by_percentile_year?.max || 0, authors, institutions, fetchedAt: NOW() });
  });
}

export async function searchPubMed(query: string, limit = 8): Promise<Paper[]> {
  const term = `${query} AND (multimodal OR imaging OR radiology OR vision language)`;
  const ids = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${new URLSearchParams({ db: "pubmed", term, retmax: String(limit), retmode: "json", sort: "pub date" })}`);
  const list: string[] = ids.esearchresult?.idlist || []; if (!list.length) return [];
  const data = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${new URLSearchParams({ db: "pubmed", id: list.join(","), retmode: "json" })}`);
  return list.map(id => {
    const w = data.result?.[id]; if (!w) return null;
    const doi = (w.articleids || []).find((v: any) => v.idtype === "doi")?.value || "";
    const pub = String(w.pubdate || "");
    return normalizePaper({ id: `pmid-${id}`, title: xmlText(w.title || ""), abstract: "", year: Number(pub.slice(0, 4)) || 0, publishedAt: pub, doi, pmid: id, source: "PubMed", paperType: w.pubtype?.some((v: string) => /review/i.test(v)) ? "review" : "article", url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, authors: (w.authors || []).slice(0, 12).map((a: any) => ({ name: a.name || "" })), institutions: [], fetchedAt: NOW() });
  }).filter(Boolean) as Paper[];
}

export async function searchArxiv(query: string, limit = 8): Promise<Paper[]> {
  const words = query.split(/\s+/).filter(w => w.length > 3).slice(0, 4);
  const search = words.map(w => `all:${w.replace(/[^a-z0-9-]/gi, "")}`).filter(x => x !== "all:").join("+AND+") || "all:medical+AND+all:multimodal";
  const url = `https://export.arxiv.org/api/query?search_query=${search}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) }); if (!response.ok) throw new Error(`arXiv HTTP ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
    const entry = m[1]; const paperUrl = tag(entry, "id"); const arxivId = paperUrl.split("/").pop() || ""; const publishedAt = tag(entry, "published");
    const title = tag(entry, "title");
    return normalizePaper({ id: `arxiv-${arxivId}`, title, abstract: tag(entry, "summary"), year: Number(publishedAt.slice(0, 4)) || 0, publishedAt, arxivId, source: "arXiv", paperType: "preprint", url: paperUrl, oaUrl: `https://arxiv.org/html/${arxivId.replace(/v\d+$/, "")}`, authors: [...entry.matchAll(/<author>([\s\S]*?)<\/author>/g)].map(a => ({ name: tag(a[1], "name") })), fetchedAt: NOW() });
  }).filter(p => p.title);
}

export async function collectPapers(input: string, breadth: "query" | "corpus" = "query"): Promise<{ papers: Paper[]; sources: string[]; errors: string[] }> {
  const query = englishQuery(input);
  const names = ["OpenAlex", "PubMed", "arXiv"];
  const wide = breadth === "corpus";
  const results = await Promise.allSettled([searchOpenAlex(query, wide ? 50 : 20), searchPubMed(query, wide ? 15 : 8), searchArxiv(query, wide ? 10 : 8)]);
  const papers: Paper[] = []; const sources: string[] = []; const errors: string[] = [];
  results.forEach((r, i) => { if (r.status === "fulfilled") { papers.push(...r.value); sources.push(names[i]); } else errors.push(`${names[i]}: ${r.reason?.message || "请求失败"}`); });
  const terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  return { papers: dedupePapers(papers).map(p => ({ ...p, relevance: Math.min(1, 0.3 + terms.filter(w => `${p.title} ${p.abstract}`.toLowerCase().includes(w)).length / Math.max(terms.length, 1) * 0.7) })).filter(p => p.year >= (wide ? 2010 : 2016)).sort((a, b) => b.relevance - a.relevance || b.year - a.year).slice(0, wide ? 65 : 35), sources, errors };
}
