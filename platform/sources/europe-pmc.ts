import type { Paper } from "../../shared/models";
export async function europePmcText(paper: Paper): Promise<{
    text: string;
    url: string;
} | null> {
    const term = paper.pmid ? `EXT_ID:${paper.pmid}` : paper.doi ? `DOI:${paper.doi}` : "";
    if (!term)
        return null;
    const search = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${new URLSearchParams({ query: term, format: "json", pageSize: "1" })}`, { signal: AbortSignal.timeout(12000) });
    if (!search.ok)
        return null;
    const data = await search.json() as any;
    const item = data.resultList?.result?.[0];
    if (!item?.pmcid || item.isOpenAccess !== "Y")
        return null;
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(item.pmcid)}/fullTextXML`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok)
        return null;
    const xml = await response.text();
    const body = xml.match(/<body>([\s\S]*?)<\/body>/i)?.[1] || "";
    const text = body.replace(/<ref-list[\s\S]*?<\/ref-list>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
    return text.length > 1500 ? { text: text.slice(0, 80000), url: `https://europepmc.org/articles/${item.pmcid}` } : null;
}
