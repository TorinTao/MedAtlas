import { normalizePaper } from "./papers";
import { lexmountExtract } from "./reading";
import type { Paper } from "./types";

const medical = /medical|clinical|radiolog|healthcare|diagnos|patholog|patient|dental|imaging|chest|oncolog|cancer|biomed/i;
const ai = /\bagent\b|\bAI\b|artificial intelligence|machine learning|deep learning|vision.language|large language model|\bLLM\b|multimodal foundation|neural network/i;
const stripTags = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const currentYear = () => new Date().getUTCFullYear();
function relevant(title: string, abstract: string) { const text = `${title} ${abstract}`; return medical.test(text) && ai.test(text); }

export function natureCandidates(text: string, query: string): { title: string; url: string; score: number }[] {
  if (!/Showing\s+\d+[–-]\d+\s+of\s+\d+\s+results/i.test(text)) return [];
  const terms = [...new Set((query.toLowerCase().match(/[a-z0-9]+/g) || []).filter(term => term.length > 3 && !["medical", "clinical"].includes(term)))];
  return text.split(/\n(?=\d{1,3}\.\s)/).flatMap(block => {
    const title = block.match(/^\d{1,3}\.\s+([^\n]+)/)?.[1]?.trim() || "";
    const url = block.match(/https:\/\/www\.nature\.com\/articles\/(s[\w-]+)/)?.[0] || "";
    if (!title || !url || !relevant(title, block)) return [];
    const lower = `${title} ${block}`.toLowerCase();
    const score = terms.filter(term => title.toLowerCase().includes(term)).length * 2 + terms.filter(term => lower.includes(term)).length;
    return [{ title, url, score }];
  }).sort((a, b) => b.score - a.score).slice(0, 6);
}

export async function searchNatureViaLex(query: string, limit = 4): Promise<Paper[]> {
  const searchUrl = `https://www.nature.com/search?q=${encodeURIComponent(query)}&order=relevance`;
  const search = await lexmountExtract(searchUrl, 22000);
  const candidates = natureCandidates(search.text, query).slice(0, limit);
  if (!candidates.length) throw new Error("Nature 公开搜索页未返回可核验的医学 AI 论文链接");
  const results = await Promise.allSettled(candidates.map(async candidate => {
    const page = await lexmountExtract(candidate.url, 22000);
    const url = new URL(page.finalUrl);
    const slug = url.pathname.match(/^\/articles\/(s[\w-]+)\/?$/)?.[1];
    const abstract = stripTags(page.description);
    const year = Number(page.publishTime.slice(0, 4));
    if (url.hostname !== "www.nature.com" || !slug || abstract.length < 100 || !relevant(candidate.title, abstract) || !Number.isInteger(year) || year < 2010 || year > currentYear()) return null;
    const paper = normalizePaper({
      id: `nature-${slug}`, title: candidate.title, abstract, year, publishedAt: page.publishTime,
      doi: `10.1038/${slug}`, source: "Nature · Lexmount", url: page.finalUrl,
      paperType: /review|survey|meta.analysis|perspective/i.test(candidate.title) ? "review" : "article",
      authors: page.author.split(/,\s*/).filter(Boolean).slice(0, 12).map(name => ({ name })),
      fetchedAt: new Date().toISOString(),
    });
    paper.discovery = { method: "Lexmount Web Fetch", searchUrl, articleUrl: page.finalUrl, capturedAt: paper.fetchedAt, requestId: page.requestId, searchRequestId: search.requestId };
    return paper;
  }));
  const papers = results.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
  if (!papers.length) throw new Error("Nature 论文页面暂未返回可核验的摘要");
  return papers;
}

export async function searchEuropePmcViaLex(query: string, limit = 10): Promise<Paper[]> {
  const searchUrl = `https://europepmc.org/search?query=${encodeURIComponent(query)}`;
  const page = await lexmountExtract(searchUrl, 22000);
  if (!/Search results\s+\d+[–-]\d+\s+of\s+[\d,]+\s+results/i.test(page.text)) throw new Error("Europe PMC 搜索页未返回可核验的结果");
  const visiblePmids = new Set([...page.text.matchAll(/PMID:\s*(\d{6,9})/g)].map(match => match[1]));
  if (!visiblePmids.size) throw new Error("Europe PMC 搜索页未提供 PMID");
  const params = new URLSearchParams({ query, format: "json", resultType: "core", pageSize: "50" });
  const response = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Europe PMC 元数据 HTTP ${response.status}`);
  const data = await response.json() as any;
  const results = (data.resultList?.result || []) as any[];
  return results.filter(item => visiblePmids.has(String(item.pmid || "")) && relevant(String(item.title || ""), String(item.abstractText || ""))).slice(0, limit).flatMap(item => {
    const pmid = String(item.pmid || ""), abstract = stripTags(String(item.abstractText || ""));
    const year = Number(item.pubYear || String(item.firstPublicationDate || "").slice(0, 4));
    if (!pmid || abstract.length < 100 || !Number.isInteger(year) || year < 2010 || year > currentYear()) return [];
    const paper = normalizePaper({
      id: `pmid-${pmid}`, title: stripTags(String(item.title || "")), abstract, year,
      publishedAt: String(item.firstPublicationDate || year), doi: String(item.doi || ""), pmid,
      source: "Europe PMC · Lexmount", paperType: /review/i.test(JSON.stringify(item.pubTypeList || "")) ? "review" : "article",
      url: `https://europepmc.org/article/MED/${pmid}`,
      oaUrl: item.isOpenAccess === "Y" && item.pmcid ? `https://europepmc.org/articles/${encodeURIComponent(String(item.pmcid))}` : "",
      citedByCount: Number(item.citedByCount || 0), authors: String(item.authorString || "").split(/,\s*/).filter(Boolean).slice(0, 12).map(name => ({ name })),
      fetchedAt: new Date().toISOString(),
    });
    paper.discovery = { method: "Lexmount Web Fetch", searchUrl, capturedAt: paper.fetchedAt, requestId: page.requestId };
    return [paper];
  });
}
