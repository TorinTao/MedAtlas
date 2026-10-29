import { deepseekJson } from "./deepseek";
import type { Paper, ResearchIdea } from "./types";

export async function makeIdeas(query: string, papers: Paper[]): Promise<ResearchIdea[]> {
  const candidates = papers.slice(0, 12).map(p => ({ id: p.id, title: p.title, year: p.year, type: p.paperType, abstract: p.abstract.slice(0, 1800), analysis: p.analysis ? { question: p.analysis.question, method: p.analysis.method, findings: p.analysis.findings, limitations: p.analysis.limitations, depth: p.analysis.depth } : undefined }));
  const raw = await deepseekJson("你是谨慎的医学多模态 AI 研究选题顾问。输出 JSON 对象 {ideas:[...]}，恰好 3 个不同且可执行的研究 idea。每项字段：title,gap,hypothesis,supportingEvidence,counterEvidence,datasets[],baselines[],metrics[],challenges[],paperIds[]。paperIds 只能从输入的候选 id 中选，至少两篇。不得宣称技术 benchmark 已证明临床有效；新颖性只是待验证假设。", `研究方向：${query}\n候选论文：${JSON.stringify(candidates)}`) as any;
  const validIds = new Set(papers.map(p => p.id));
  const ideas = (Array.isArray(raw.ideas) ? raw.ideas : []).slice(0, 3).map((idea: any) => ({ id: crypto.randomUUID(), title: String(idea.title || ""), gap: String(idea.gap || ""), hypothesis: String(idea.hypothesis || ""), supportingEvidence: String(idea.supportingEvidence || ""), counterEvidence: String(idea.counterEvidence || ""), datasets: strings(idea.datasets), baselines: strings(idea.baselines), metrics: strings(idea.metrics), challenges: strings(idea.challenges), paperIds: [...new Set<string>((Array.isArray(idea.paperIds) ? idea.paperIds : []).filter((id: unknown): id is string => typeof id === "string" && validIds.has(id)))], query, createdAt: new Date().toISOString() }));
  if (ideas.length !== 3 || ideas.some((idea: ResearchIdea) => !idea.title || !idea.gap || !idea.hypothesis || !idea.supportingEvidence || !idea.counterEvidence || !idea.datasets.length || !idea.baselines.length || !idea.metrics.length || !idea.challenges.length || idea.paperIds.length < 2)) throw new Error("模型未返回三条完整且可追溯的选题，请重试");
  return ideas;
}
function strings(x: unknown): string[] { return Array.isArray(x) ? x.filter(v => typeof v === "string").slice(0, 8) : []; }
