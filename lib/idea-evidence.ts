import type { Paper } from "./types";

export type EvidenceLocation = "摘要" | "全文摘录";
export type EvidenceSource = { location: EvidenceLocation; text: string; sourceUrl: string };
export type EvidenceAnchor = { paperId: string; quote: string; location: EvidenceLocation; sourceUrl: string };
export type VerifiedEvidence = { claim: string; stance: "支持" | "反对" | "背景"; paperIds: string[]; anchors: EvidenceAnchor[] };

const normalized = (text: string) => text.replace(/\s+/gu, " ").trim();
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Only original abstracts and previously captured full-text excerpts are evidence.
// Generated findings and limitations are useful interpretations, not source text.
export function evidenceSources(paper: Paper): EvidenceSource[] {
  const sources: EvidenceSource[] = [];
  if (paper.abstract.trim()) sources.push({ location: "摘要", text: paper.abstract.trim().slice(0, 12000), sourceUrl: paper.url });
  if (paper.analysis?.depth === "全文") {
    for (const item of paper.analysis.evidence) {
      if (typeof item.excerpt === "string" && item.excerpt.trim()) sources.push({ location: "全文摘录", text: item.excerpt.trim(), sourceUrl: paper.analysis.sourceUrl });
    }
  }
  return sources;
}

export function sourcePapers(papers: Paper[]) {
  return papers.map(paper => ({
    id: paper.id, title: paper.title, year: paper.year, type: paper.paperType,
    modality: paper.modality, method: paper.method, sources: evidenceSources(paper),
  }));
}

/** Checks source membership and verbatim quotation; this does not establish entailment. */
export function validateEvidenceChain(raw: unknown, papers: Paper[]): VerifiedEvidence[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 8) throw new Error("证据链须包含 2–8 条带原文摘录的主张");
  const byId = new Map(papers.map(paper => [paper.id, evidenceSources(paper)]));
  const allIds = new Set<string>();
  const result = raw.map((item, index): VerifiedEvidence => {
    const fail = (message: string): never => { throw new Error(`第 ${index + 1} 条证据：${message}`); };
    if (!record(item)) return fail("内容不是有效对象");
    if (typeof item.claim !== "string" || !item.claim.trim() || item.claim.length > 1200) return fail("缺少有效的研究主张");
    if (item.stance !== "支持" && item.stance !== "反对" && item.stance !== "背景") return fail("证据立场无效");
    if (!Array.isArray(item.paperIds) || item.paperIds.length < 1 || item.paperIds.length > 3) return fail("须引用 1–3 篇论文");
    const paperIds: string[] = [];
    for (const id of item.paperIds) {
      if (typeof id !== "string" || !byId.has(id)) return fail("引用了未提供的论文 ID");
      if (paperIds.includes(id)) return fail("论文 ID 重复");
      paperIds.push(id);
    }
    if (!Array.isArray(item.anchors) || item.anchors.length < 1 || item.anchors.length > 3) return fail("须提供 1–3 个原文锚点");
    const anchors = item.anchors.map((anchor: unknown): EvidenceAnchor => {
      if (!record(anchor)) return fail("原文锚点不是有效对象");
      if (typeof anchor.paperId !== "string" || !paperIds.includes(anchor.paperId)) return fail("原文锚点与引用论文不一致");
      if (anchor.location !== "摘要" && anchor.location !== "全文摘录") return fail("原文位置须为摘要或全文摘录");
      if (typeof anchor.quote !== "string") return fail("缺少原文摘录");
      const quote = normalized(anchor.quote);
      if (quote.length < 20 || quote.length > 600) return fail("原文摘录须为 20–600 个字符");
      const source = byId.get(anchor.paperId)!.find(candidate => candidate.location === anchor.location && normalized(candidate.text).includes(quote));
      if (!source) return fail("摘录未出现在该论文指定位置，须按原文修订");
      // Do not accept model-supplied URLs or a different paper's source URL.
      return { paperId: anchor.paperId, quote, location: source.location, sourceUrl: source.sourceUrl };
    });
    if (paperIds.some(id => !anchors.some(anchor => anchor.paperId === id))) return fail("每篇引用论文都须有对应原文锚点");
    paperIds.forEach(id => allIds.add(id));
    return { claim: item.claim.trim(), stance: item.stance, paperIds, anchors };
  });
  if (allIds.size < 2) throw new Error("证据链须引用至少 2 篇不同论文");
  return result;
}
