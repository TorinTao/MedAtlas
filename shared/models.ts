export type ResearchRole = "核心研究" | "历史脉络" | "邻近研究" | "跨领域启发";
export type PaperType = "综述" | "预印本" | "研究论文" | "数据集";
export type Modality = "影像+文本" | "影像" | "病历文本" | "多模态";
export type ClinicalTask =
  | "诊断决策"
  | "报告生成"
  | "医学问答"
  | "风险预测"
  | "基础模型";
export type Method =
  | "视觉语言模型"
  | "Agent 协作"
  | "检索增强"
  | "表征学习"
  | "多模态融合"
  | "生成式模型"
  | "预测与分类"
  | "评测与资源"
  | "综述与趋势"
  | "待核验";
export type Author = {
  name: string;
  id?: string;
};
export type PublicationVenue = {
  name: string;
  type: "期刊" | "会议" | "预印本平台" | "其他" | "待核验";
  evidenceUrl: string;
  checkedAt?: string;
};
export type PaperAnalysis = {
  question: string;
  method: string;
  datasets: string[];
  findings: string[];
  limitations: string[];
  evidence: {
    claim: string;
    location: string;
    excerpt: string;
  }[];
  depth: "全文" | "摘要";
  sourceUrl: string;
  analyzedAt: string;
};
export type Paper = {
  id: string;
  title: string;
  abstract: string;
  year: number;
  publishedAt: string;
  doi: string;
  pmid: string;
  arxivId: string;
  source: string;
  publicationVenue?: PublicationVenue;
  paperType: PaperType;
  url: string;
  oaUrl: string;
  citedByCount: number;
  citationPercentile: number;
  authors: Author[];
  institutions: string[];
  repoUrl: string;
  fetchedAt: string;
  modality: Modality;
  clinicalTask: ClinicalTask;
  method: Method;
  relevance: number;
  fulltextStatus: "全文可用" | "仅摘要" | "未检查";
  discovery?: {
    method: "Lexmount Web Fetch";
    searchUrl: string;
    articleUrl?: string;
    capturedAt: string;
    requestId: string;
    searchRequestId?: string;
    stage?: "article-verification";
    candidateSource?: string;
  };
  summaryZh?: string;
  summaryBasis?: "摘要" | "标题" | "公开页面" | "元数据";
  summarySourceUrl?: string;
  abstractZh?: string;
  abstractSourceUrl?: string;
  reviewAbstractZh?: string;
  reviewAbstractSourceUrl?: string;
  analysis?: PaperAnalysis;
  repoEvidenceUrl?: string;
  repoDiscovery?: {
    status: "found" | "none" | "ambiguous";
    repoUrl?: string;
    sourceUrl: string;
    checkedAt: string;
    candidates: string[];
  };
  repoAudit?: RepoAudit;
};
export type IdeaEvidenceAnchor = {
  paperId: string;
  quote: string;
  location: "摘要" | "全文摘录";
  sourceUrl: string;
};
export type IdeaOpportunity = {
  id: string;
  gap: string;
  mechanism: string;
  nearestPaperIds: string[];
  searchQuery: string;
};
export type IdeaSummary = {
  title: string;
  gap: string;
  hypothesis: string;
};
export type ResearchIdea = {
  id: string;
  title: string;
  gap: string;
  hypothesis: string;
  supportingEvidence: string;
  counterEvidence: string;
  datasets: string[];
  baselines: string[];
  metrics: string[];
  challenges: string[];
  paperIds: string[];
  query: string;
  createdAt: string;
  favorite?: boolean;
  improvements?: {
    title: string;
    action: string;
    risk: string;
    fallback: string;
    priority?: "核心" | "可选";
  }[];
  fullPlan?: {
    data: string;
    cohortAndSplit: string;
    method: string;
    baselines: string;
    evaluation: string;
    controls: string;
    ethics: string;
  };
  expectedConclusions?: string[];
  feasibility?: {
    rating: "高" | "中" | "低";
    rationale: string;
    resources: string[];
    blockers: string[];
  };
  evidenceChain?: {
    claim: string;
    stance: "支持" | "反对" | "背景";
    paperIds: string[];
    anchors?: IdeaEvidenceAnchor[];
  }[];
  closestWork?: {
    paperId: string;
    alreadyDone: string;
    difference: string;
  }[];
  minimumExperiment?: {
    question: string;
    data: string;
    baseline: string;
    intervention: string;
    primaryMetric: string;
    successCriterion: string;
    falsificationCriterion: string;
    resourceBudget: string;
  };
  qualityReview?: {
    status: "模型审查通过";
    summary: string;
    limitations: string[];
    reviewedAt: string;
    version: "evidence-v2";
  };
  targetedSearch?: {
    query: string;
    foundCount: number;
    sources: string[];
    warnings: string[];
  };
};
export type IdeasResearch = {
  jobId: string;
  query: string;
  scannedCount: number;
  selectedCount: number;
  sources: string[];
  warnings: string[];
  preparedAt: string;
  expiresAt: string;
  brief: {
    landscape: string;
    gaps: string[];
    cautions: string[];
  };
  followupQueries?: {
    query: string;
    purpose: string;
    foundCount: number;
  }[];
  papers: {
    id: string;
    title: string;
    year: number;
    paperType: PaperType;
  }[];
};
export type RepoCheck = {
  label: string;
  status: "有" | "缺失" | "无法确认";
  evidence: string;
};
export type RepoEvaluation = {
  readiness: "资料较完整" | "部分可评估" | "信息不足";
  summaryZh: string;
  strengths: string[];
  gaps: string[];
  nextSteps: string[];
  evidenceLabels: string[];
  sourceUrl: string;
  readmeSourceUrl?: string;
  evaluatedAt: string;
  model: "deepseek-flash";
  disclaimer: string;
};
export type RepoAudit = {
  repoUrl: string;
  checkedAt: string;
  checks: RepoCheck[];
  disclaimer: string;
  evaluation?: RepoEvaluation;
  evaluationError?: string;
};
