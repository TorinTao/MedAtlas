import seed from "../data/seed-papers.json";
import pubmedBackfill from "../data/pubmed-backfill.json";
import type { ClinicalTask, Method, Modality, Paper, PaperType } from "./types";
import { githubRepositories } from "./repo-links";
import { bestVenue } from "./publication-venue";

type RawPaper = Omit<Partial<Paper>, "paperType"> & { id: string; title: string; paperType?: string };

export function relevantMedicalAiPaper(title: string, abstract: string): boolean {
  const text = `${title} ${abstract}`;
  return /medical|clinical|radiolog|healthcare|diagnos|patholog|patient|dental|imaging|chest|oncolog|cancer|biomed/i.test(text)
    && /\bAI\b|artificial intelligence|machine learning|deep learning|vision.language|large language model|\bLLMs?\b|multimodal foundation|neural network|\bagentic\b|\bmulti-agent\b|\b(?:autonomous |health |medical |clinical )agents?\b|AgentClinic/i.test(text);
}

export function classify(title: string, abstract = ""): { paperType: PaperType; modality: Modality; clinicalTask: ClinicalTask; method: Method } {
  const t = `${title} ${abstract}`.toLowerCase();
  const tl = title.toLowerCase();
  const paperType: PaperType = /survey|review|meta-analysis/.test(tl) ? "综述" : /dataset|benchmark/.test(tl) ? "数据集" : "研究论文";
  const image = /image|radiolog|x-ray|chest|patholog|visual|vision/.test(t);
  const text = /text|report|language|clinical note|record/.test(t);
  const computational = /\bai\b|artificial intelligence|machine[\s-]learning|deep[\s-]learning|\bmodel\b|\bmodels\b|multimodal|\bllm\b|language model|neural network/.test(t);
  const modality: Modality = image && text ? "影像+文本" : image ? "影像" : text ? "病历文本" : "多模态";
  const clinicalTask: ClinicalTask = /report generat|caption/.test(t) ? "报告生成" : /question answer|vqa|dialogue/.test(t) ? "医学问答" : /risk|predict|prognos/.test(t) ? "风险预测" : /foundation model|pretrain|representation|contrastive/.test(t) ? "基础模型" : "诊断决策";
  // The label is a reproducible keyword tag, not an AI claim about the paper's method.
  // A review or benchmark without a named method keeps its own category.
  const method: Method = /\bagents?\b|agentic|copilot|tool.using|orchestrat/.test(t) ? "Agent 协作"
    : /retriev|\brag\b|knowledge.graph|knowledge.assist/.test(t) ? "检索增强"
    : /\bmllm\b|\blvlm\b|\bvlm\b|\w*vqa\b|vision[\W_]*language|visual[\W_]*language|vision.enabled.*language|multimodal language|llava|llm.vision|language.guided|visual question answer|report generat|multimodal.*(?:llm|large language model)/.test(t) ? "视觉语言模型"
    : /contrastive|self.supervised|representation|foundation model|pretrain|segmentation|domain generaliz|adversarial training/.test(t) ? "表征学习"
    : /\bbenchmark\b|[- ]bench\b|\bdataset\b|\bdatabase\b|\bchallenge\b/.test(tl) || (computational && /\bevaluat|\breliab|\brobust|\buncertainty|\bcalibrat|explainab|\bsafety\b|\bprivacy\b|\bclaims\b|performance comparison/.test(tl)) ? "评测与资源"
    : /generative|generated|\bgan\b|diffusion|synthetic data|large language model|\bllm\b|\bgpt\b/.test(t) ? "生成式模型"
    : /multimodal|multi.modal|cross.modal|image.text|data integration|modality fusion/.test(tl) && computational ? "多模态融合"
    : /machine[\s-]learning|deep[\s-]learning|classif|predict|detect|localiz|transformer|reinforcement learning|neural network/.test(tl) ? "预测与分类"
    : /survey|review|meta.analysis|taxonomy|perspective|current status|future directions|trends|road ahead|opportunities.*challenges/.test(tl) ? "综述与趋势"
    : "待核验";
  return { paperType, modality, clinicalTask, method };
}

export function cleanDoi(value: string) { return value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase(); }
export function publicPaperUrl(value: string) { return value.replace(/^http:\/\/(?:www\.)?arxiv\.org\//i, "https://arxiv.org/"); }

export function normalizePaper(raw: RawPaper): Paper {
  const c = classify(raw.title, raw.abstract);
  const abstractRepos = githubRepositories(raw.abstract || "");
  return {
    id: raw.id, title: raw.title, abstract: raw.abstract || "", year: raw.year || 0,
    publishedAt: raw.publishedAt || "", doi: cleanDoi(raw.doi || ""), pmid: raw.pmid || "", arxivId: raw.arxivId || "",
    source: raw.source || "", publicationVenue: raw.publicationVenue, paperType: raw.paperType === "preprint" ? "预印本" : /review/i.test(raw.paperType || "") ? "综述" : c.paperType,
    url: publicPaperUrl(raw.url || ""), oaUrl: publicPaperUrl(raw.oaUrl || ""), citedByCount: raw.citedByCount || 0,
    citationPercentile: Math.min(100, Math.max(0, raw.citationPercentile || 0)), authors: raw.authors || [], institutions: raw.institutions || [], repoUrl: raw.repoUrl || (abstractRepos.length === 1 ? abstractRepos[0] : ""),
    fetchedAt: raw.fetchedAt || new Date().toISOString(), modality: c.modality, clinicalTask: c.clinicalTask, method: c.method,
    relevance: raw.relevance ?? 0.75, fulltextStatus: raw.fulltextStatus || (raw.oaUrl ? "未检查" : "仅摘要"),
    ...(raw.analysis ? { analysis: raw.analysis } : {}),
  };
}

export function paperIdentity(p: Paper) { return p.doi ? `doi:${cleanDoi(p.doi)}` : p.pmid ? `pmid:${p.pmid}` : p.arxivId ? `arxiv:${p.arxivId.replace(/v\d+$/, "")}` : `title:${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "")}`; }

export function dedupePapers(items: Paper[]): Paper[] {
  const map = new Map<string, Paper>(); const titles = new Map<string, string>();
  for (const paper of items) {
    const titleKey = paper.title.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const key = paperIdentity(paper); const priorKey = map.has(key) ? key : titles.get(titleKey);
    if (priorKey) {
      const prior = map.get(priorKey)!;
      map.set(priorKey, { ...prior, ...paper, id: prior.id,
        abstract: paper.abstract.length > prior.abstract.length ? paper.abstract : prior.abstract,
        doi: paper.doi || prior.doi, pmid: paper.pmid || prior.pmid, arxivId: paper.arxivId || prior.arxivId,
        authors: paper.authors.length > prior.authors.length ? paper.authors : prior.authors,
        institutions: [...new Set([...prior.institutions, ...paper.institutions])],
        repoUrl: prior.repoEvidenceUrl ? prior.repoUrl : paper.repoUrl || prior.repoUrl,
        repoEvidenceUrl: paper.repoEvidenceUrl || prior.repoEvidenceUrl,
        repoDiscovery: paper.repoDiscovery || prior.repoDiscovery,
        repoAudit: paper.repoAudit || prior.repoAudit,
        summaryZh: paper.summaryZh || prior.summaryZh,
        summaryBasis: paper.summaryBasis || prior.summaryBasis,
        summarySourceUrl: paper.summarySourceUrl || prior.summarySourceUrl,
        publicationVenue: bestVenue(prior.publicationVenue, paper.publicationVenue),
        abstractZh: paper.abstractZh || prior.abstractZh,
        abstractSourceUrl: paper.abstractSourceUrl || prior.abstractSourceUrl,
        reviewAbstractZh: paper.reviewAbstractZh || prior.reviewAbstractZh,
        reviewAbstractSourceUrl: paper.reviewAbstractSourceUrl || prior.reviewAbstractSourceUrl,
        analysis: paper.analysis || prior.analysis,
        discovery: paper.discovery || prior.discovery,
        paperType: prior.paperType === "预印本" && paper.paperType !== "预印本" ? paper.paperType : prior.paperType });
    } else { map.set(key, paper); titles.set(titleKey, key); }
  }
  return [...map.values()];
}

export const seedPapers: Paper[] = dedupePapers([
  ...(seed as RawPaper[]).map(normalizePaper).filter(p => p.year >= 2018 && /medical|clinical|radiolog|x-ray|chest|vision|biomed|multimodal|patholog/i.test(p.title)),
  ...(pubmedBackfill as RawPaper[]).map(normalizePaper),
]);
