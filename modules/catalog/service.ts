import type { PaperSource } from "../../shared/ports";
import type { Paper } from "../../shared/models";
import { dedupePapers } from "./papers";
import { englishQuery } from "./query";
export function createCatalogService(sources: readonly PaperSource[], initialWarnings: () => string[] = () => []) {
    async function collectPapers(input: string, breadth: "query" | "corpus" = "query"): Promise<{
        papers: Paper[];
        sources: string[];
        errors: string[];
    }> {
        const query = englishQuery(input), wide = breadth === "corpus";
        const results = await Promise.allSettled(sources.map(source => Promise.resolve().then(() => source.search(query, wide ? source.corpusLimit : source.queryLimit))));
        const papers: Paper[] = [], used: string[] = [], errors = initialWarnings();
        results.forEach((r, i) => { if (r.status === "fulfilled") {
            papers.push(...r.value);
            if (r.value.length)
                used.push(sources[i].name);
        }
        else
            errors.push(`${sources[i].name}: ${r.reason?.message || "请求失败"}`); });
        const terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        return { papers: dedupePapers(papers).map(p => ({ ...p, relevance: Math.min(1, 0.3 + terms.filter(w => `${p.title} ${p.abstract}`.toLowerCase().includes(w)).length / Math.max(terms.length, 1) * 0.7) })).filter(p => p.year >= (wide ? 2010 : 2016)).sort((a, b) => b.relevance - a.relevance || b.year - a.year).slice(0, wide ? 65 : 35), sources: used, errors };
    }
    return { collectPapers };
}
