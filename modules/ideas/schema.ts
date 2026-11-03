import { z } from "zod";
import type { Paper, ResearchIdea } from "../../shared/models";
import { validateEvidenceChain } from "./evidence";
const text = z.string().trim().min(8).max(1200);
const list = z.array(z.string().trim().min(2).max(600)).min(1).max(8);
const draftSchema = z.object({
    title: z.string().trim().min(5).max(180), gap: text.max(1000), hypothesis: text.max(1000), supportingEvidence: text, counterEvidence: text,
    datasets: list, baselines: list, metrics: list, challenges: list,
    improvements: z.array(z.object({ title: z.string().trim().min(2).max(110), action: text, risk: text, fallback: text, priority: z.enum(["核心", "可选"]) })).min(5).max(8),
    fullPlan: z.object({ data: text, cohortAndSplit: text, method: text, baselines: text, evaluation: text, controls: text, ethics: text }),
    expectedConclusions: z.array(text).min(2).max(5),
    feasibility: z.object({ rating: z.enum(["高", "中", "低"]), rationale: text, resources: list, blockers: list }),
    closestWork: z.array(z.object({ paperId: z.string(), alreadyDone: text, difference: text })).min(2).max(4),
    minimumExperiment: z.object({ question: text, data: text, baseline: text, intervention: text, primaryMetric: text, successCriterion: text, falsificationCriterion: text, resourceBudget: text }),
    paperIds: z.array(z.string()).min(2).max(24), evidenceChain: z.unknown(),
});
export function validateIdea(raw: unknown, papers: Paper[], query: string): ResearchIdea {
    const parsed = draftSchema.safeParse(raw);
    if (!parsed.success)
        throw new Error(`方案字段不完整：${parsed.error.issues.slice(0, 5).map(issue => issue.path.join(".")).join("、")}`);
    const value = parsed.data;
    const valid = new Set(papers.map(paper => paper.id));
    if ([...value.paperIds, ...value.closestWork.map(item => item.paperId)].some(id => !valid.has(id)))
        throw new Error("方案引用了输入中不存在的论文");
    if (new Set(value.closestWork.map(item => item.paperId)).size < 2)
        throw new Error("需比较至少两篇不同的相近工作");
    const core = value.improvements.filter(item => item.priority === "核心").length;
    if (core < 1 || core > 3)
        throw new Error("请收敛为 1–3 项核心改进，其余作为可选实验");
    const evidenceChain = validateEvidenceChain(value.evidenceChain, papers);
    const anchored = new Set(evidenceChain.flatMap(item => item.paperIds));
    if (value.closestWork.some(item => !anchored.has(item.paperId)))
        throw new Error("相近工作比较必须有原文证据");
    if (value.paperIds.some(id => !anchored.has(id)))
        throw new Error("相关论文必须在证据链中提供原文依据");
    return { ...value, evidenceChain, paperIds: [...anchored], id: crypto.randomUUID(), query, createdAt: new Date().toISOString() };
}
