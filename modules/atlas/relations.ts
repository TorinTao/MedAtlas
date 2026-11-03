import type { Paper } from "../../shared/models";
const STOP = new Set("a an and as at based by clinical data deep for from in into medical medicine model models multimodal of on paper study studies the to using via with ai artificial intelligence".split(" "));
function titleTerms(title: string): Set<string> {
    return new Set((title.toLowerCase().match(/[a-z0-9]+/g) || []).filter(term => term.length >= 3 && !STOP.has(term)));
}
function commonAuthor(a: Paper, b: Paper): boolean {
    const names = new Set(a.authors.map(author => author.id || author.name.toLowerCase()).filter(Boolean));
    return b.authors.some(author => names.has(author.id || author.name.toLowerCase()));
}
export type RelatedPaper = {
    paper: Paper;
    reason: string;
    score: number;
};
/** Explicitly labeled title/author similarity; never represent this as a citation edge. */
export function relatedPapers(papers: Paper[], selected: Paper, limit = 8): RelatedPaper[] {
    const selectedTerms = titleTerms(selected.title);
    return papers.filter(paper => paper.id !== selected.id).map(paper => {
        const terms = titleTerms(paper.title);
        const shared = [...selectedTerms].filter(term => terms.has(term));
        const author = commonAuthor(selected, paper);
        const topical = shared.length >= 2;
        const score = shared.length / Math.max(3, Math.min(selectedTerms.size, terms.size))
            + (selected.clinicalTask === paper.clinicalTask ? 0.08 : 0)
            + (selected.method === paper.method ? 0.07 : 0)
            + (author ? 0.22 : 0);
        return { paper, reason: author ? "共同作者与主题相近" : "标题主题相近", score, topical, authorTopic: author && shared.length >= 1 };
    }).filter(item => (item.topical && item.score >= 0.38) || (item.authorTopic && item.score >= 0.35))
        .sort((a, b) => b.score - a.score || b.paper.citedByCount - a.paper.citedByCount)
        .slice(0, limit).map(({ paper, reason, score }) => ({ paper, reason, score }));
}
/** A time ordered visual guide to highly cited papers, not a citation graph. */
export function coreTimeline(papers: Paper[], limit = 12): Paper[] {
    return papers.filter(paper => paper.citedByCount >= 80 || (paper.citationPercentile >= 90 && paper.citedByCount >= 30))
        .sort((a, b) => b.citedByCount - a.citedByCount || b.citationPercentile - a.citationPercentile)
        .slice(0, limit)
        .sort((a, b) => a.year - b.year || a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
}
