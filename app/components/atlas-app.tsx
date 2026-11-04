"use client";

import { IdeaCard } from "../../modules/ideas/ui/idea-card";
import { RepoEvaluationView } from "../../modules/repositories/ui/evaluation";
import { PaperSummary } from "../../modules/reading/ui/paper-summary";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  Search,
  Settings2,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import type {
  IdeasResearch,
  Method,
  Paper,
  PaperAnalysis,
  RepoAudit,
  ResearchIdea,
} from "../../shared/models";
import { relatedPapers } from "../../modules/atlas/relations";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  extractPdfText,
  PDF_MAX_BYTES,
} from "../../modules/workspace/pdf-text";

const AtlasScene = dynamic(() => import("../../modules/atlas/scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading" role="status">
      <div className="scene-loading-content">
        <span className="scene-loading-mark">
          <LoaderCircle className="spin" size={23} />
        </span>
        <strong>正在载入文献星图</strong>
        <small>发表时间 · 医学模态 · 临床任务</small>
      </div>
      <div className="scene-loading-timeline" aria-hidden="true">
        <span>2018</span>
        <span>2020</span>
        <span>2022</span>
        <span>2024</span>
        <span>2026</span>
      </div>
    </div>
  ),
});
const methodColors: Record<Method, string> = {
  视觉语言模型: "#16bfa8",
  "Agent 协作": "#d98b1c",
  检索增强: "#9256de",
  表征学习: "#397fd4",
  多模态融合: "#829e24",
  生成式模型: "#d64f86",
  预测与分类: "#d8664d",
  评测与资源: "#b79516",
  综述与趋势: "#388bae",
  待核验: "#84939c",
};
const sections = [
  { id: "atlas", label: "研究星图", icon: Compass },
  { id: "library", label: "文献库", icon: BookOpen },
  { id: "ideas", label: "Ideas 工作台", icon: Lightbulb },
  { id: "workspace", label: "我的工作区", icon: Bookmark },
  { id: "settings", label: "系统设置", icon: Settings2 },
] as const;
type Section = (typeof sections)[number]["id"];
const LIBRARY_PAGE_SIZE = 12;
type Workspace = {
  savedPapers: Paper[];
  ideas: ResearchIdea[];
  uploads: {
    id: string;
    fileName: string;
    fileSize: number;
    pageCount: number;
    createdAt: string;
  }[];
};
type AiSettings = {
  configured: boolean;
  updatedAt: string | null;
  siteFallback: boolean;
  model: string;
};
type IdeaHistoryItem = {
  id: string;
  title: string;
  gap: string;
  hypothesis: string;
  query: string;
  createdAt: string;
  paperCount: number;
  favorite: boolean;
  local?: boolean;
};
const GUEST_IDEA_HISTORY_KEY = "medatlas-guest-idea-history";
function readGuestIdeaHistory(): ResearchIdea[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(GUEST_IDEA_HISTORY_KEY) || "[]",
    );
    return Array.isArray(value)
      ? value
          .filter(
            (idea): idea is ResearchIdea =>
              idea &&
              typeof idea.id === "string" &&
              typeof idea.title === "string" &&
              typeof idea.gap === "string" &&
              typeof idea.hypothesis === "string" &&
              typeof idea.query === "string" &&
              typeof idea.createdAt === "string" &&
              Array.isArray(idea.paperIds),
          )
          .slice(0, 50)
      : [];
  } catch {
    return [];
  }
}
function historyItem(idea: ResearchIdea, local = false): IdeaHistoryItem {
  return {
    id: idea.id,
    title: idea.title,
    gap: idea.gap,
    hypothesis: idea.hypothesis,
    query: idea.query,
    createdAt: idea.createdAt,
    paperCount: idea.paperIds.length,
    favorite: idea.favorite === true,
    local,
  };
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data: any = await response.json();
  if (!response.ok)
    throw new Error(data.error || `请求失败 ${response.status}`);
  return data as T;
}

export default function AtlasApp({
  user,
  signInPath,
  signOutPath,
}: {
  user: { name: string } | null;
  signInPath: string;
  signOutPath: string;
}) {
  const [section, setSection] = useState<Section>("atlas");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [query, setQuery] = useState("医学影像 + 病历文本 Agent");
  const [selectedId, setSelectedId] = useState("");
  const [motion, setMotion] = useState(true);
  const [libraryPage, setLibraryPage] = useState(1);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [readOnly, setReadOnly] = useState(false);
  const [readStatusReady, setReadStatusReady] = useState(false);
  const [typeFilter, setTypeFilter] = useState("全部类型");
  const [modalityFilter, setModalityFilter] = useState("全部模态");
  const [yearFilter, setYearFilter] = useState("全部年份");
  const [methodFilter, setMethodFilter] = useState<Method | null>(null);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [drawProgress, setDrawProgress] = useState("");
  const [researchBrief, setResearchBrief] = useState<IdeasResearch | null>(
    null,
  );
  const [auditing, setAuditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [ideas, setIdeas] = useState<ResearchIdea[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [ideaHistory, setIdeaHistory] = useState<IdeaHistoryItem[]>([]);
  const [historySelected, setHistorySelected] = useState<ResearchIdea | null>(
    null,
  );
  const [historyLoadingId, setHistoryLoadingId] = useState("");
  const [favoriteBusyId, setFavoriteBusyId] = useState("");
  const [paperSaveBusyId, setPaperSaveBusyId] = useState("");
  const [historyVisibleCount, setHistoryVisibleCount] = useState(8);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTested, setAiTested] = useState<boolean | null>(null);
  const [pdfAnalysis, setPdfAnalysis] = useState<Record<string, PaperAnalysis>>(
    {},
  );
  const [pdfReading, setPdfReading] = useState("");
  const [audit, setAudit] = useState<RepoAudit | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [repoLookupError, setRepoLookupError] = useState("");
  const autoRepoRequested = useRef(new Set<string>());
  const autoRepoPaused = useRef(false);
  const [autoReadingId, setAutoReadingId] = useState("");
  const [readingError, setReadingError] = useState("");
  const autoReadRequested = useRef(new Set<string>());
  const autoReadPaused = useRef(false);
  const [summarizingId, setSummarizingId] = useState("");
  const [summaryRequestedId, setSummaryRequestedId] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [translatingId, setTranslatingId] = useState("");
  const [translationError, setTranslationError] = useState("");
  const [translationRetry, setTranslationRetry] = useState(0);

  useEffect(() => {
    api<{ papers: Paper[] }>("/api/papers")
      .then((r) => {
        setPapers(r.papers);
        setSelectedId(r.papers[0]?.id || "");
      })
      .catch((e) => setMessage(e.message));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMotion(!reduced.matches);
  }, []);
  useEffect(() => {
    let localIds: string[] = [];
    try {
      const stored = JSON.parse(
        localStorage.getItem("medatlas-guest-read-papers") || "[]",
      );
      if (Array.isArray(stored))
        localIds = stored
          .filter((id): id is string => typeof id === "string")
          .slice(0, 500);
    } catch {
      /* browser storage may be unavailable */
    }
    if (!user) {
      setReadIds(new Set(localIds));
      setReadStatusReady(true);
      return;
    }
    let active = true;
    api<{ paperIds: string[] }>("/api/reading-status")
      .then(async (result) => {
        if (!active) return;
        const serverIds = new Set(result.paperIds);
        const merged = new Set([...serverIds, ...localIds]);
        const missing = localIds.filter((id) => !serverIds.has(id));
        try {
          if (missing.length)
            await api("/api/reading-status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paperIds: missing, read: true }),
            });
          localStorage.removeItem("medatlas-guest-read-papers");
        } catch (error) {
          if (active)
            setMessage(`访客阅读记录同步失败：${(error as Error).message}`);
        }
        if (!active) return;
        setReadIds(merged);
        setReadStatusReady(true);
      })
      .catch((error) => {
        if (active) {
          setReadIds(new Set(localIds));
          setReadStatusReady(true);
          setMessage(`已阅读状态同步失败：${(error as Error).message}`);
        }
      });
    return () => {
      active = false;
    };
  }, [user?.name]);
  const loadWorkspace = useCallback(async () => {
    if (!user) return;
    try {
      setWorkspace(await api<Workspace>("/api/workspace"));
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [user]);
  useEffect(() => {
    if (user) loadWorkspace();
    else setWorkspace(null);
  }, [section, loadWorkspace]);
  const savedPaperIds = useMemo(
    () => new Set(workspace?.savedPapers.map((paper) => paper.id) || []),
    [workspace],
  );
  useEffect(() => {
    if (section !== "ideas") return;
    const local = readGuestIdeaHistory().map((idea) => historyItem(idea, true));
    if (!user) {
      setIdeaHistory(local);
      return;
    }
    let active = true;
    const startedAt = new Date().toISOString();
    api<{ history: IdeaHistoryItem[] }>("/api/ideas/history")
      .then((result) => {
        if (!active) return;
        setIdeaHistory((current) => {
          const merged = new Map<string, IdeaHistoryItem>();
          [
            ...result.history,
            ...local,
            ...current.filter((item) => item.createdAt >= startedAt),
          ].forEach((item) => {
            if (!merged.has(item.id)) merged.set(item.id, item);
          });
          return [...merged.values()]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 150);
        });
      })
      .catch((error) => {
        if (active) {
          setIdeaHistory(local);
          setMessage(`抽卡历史加载失败：${(error as Error).message}`);
        }
      });
    return () => {
      active = false;
    };
  }, [section, user?.name]);
  useEffect(() => {
    if (section === "settings" && user)
      api<AiSettings>("/api/settings/ai")
        .then(setAiSettings)
        .catch((error) => setMessage((error as Error).message));
  }, [section, user?.name]);
  const visible = useMemo(
    () =>
      papers
        .filter(
          (p) =>
            (!readOnly || readIds.has(p.id)) &&
            (typeFilter === "全部类型" || p.paperType === typeFilter) &&
            (modalityFilter === "全部模态" || p.modality === modalityFilter) &&
            (!methodFilter || p.method === methodFilter) &&
            (yearFilter === "全部年份" ||
              (yearFilter === "近三年" ? p.year >= 2024 : p.year < 2024)),
        )
        .sort((a, b) => b.year - a.year || b.citedByCount - a.citedByCount),
    [
      papers,
      readOnly,
      readIds,
      typeFilter,
      modalityFilter,
      methodFilter,
      yearFilter,
    ],
  );
  const libraryPageCount = Math.max(
    1,
    Math.ceil(visible.length / LIBRARY_PAGE_SIZE),
  );
  const currentLibraryPage = Math.min(libraryPage, libraryPageCount);
  const libraryPapers = visible.slice(
    (currentLibraryPage - 1) * LIBRARY_PAGE_SIZE,
    currentLibraryPage * LIBRARY_PAGE_SIZE,
  );
  const libraryPageStart = Math.max(
    1,
    Math.min(currentLibraryPage - 2, libraryPageCount - 4),
  );
  const libraryPageNumbers = Array.from(
    { length: Math.min(5, libraryPageCount) },
    (_, index) => libraryPageStart + index,
  );
  useEffect(() => {
    setLibraryPage(1);
  }, [typeFilter, modalityFilter, yearFilter, methodFilter]);
  const selected = visible.find((p) => p.id === selectedId) || visible[0];
  useEffect(() => {
    setRepoInput(selected?.repoUrl || "");
    setAudit(null);
    setRepoLookupError("");
  }, [selected?.id, selected?.repoUrl]);
  const currentAudit = audit || selected?.repoAudit;
  useEffect(() => {
    setReadingError("");
  }, [selected?.id]);
  useEffect(() => {
    if (
      section !== "library" ||
      !selected?.id ||
      selected.analysis ||
      !selected.abstract.trim() ||
      autoReadPaused.current ||
      autoReadRequested.current.has(selected.id)
    )
      return;
    const id = selected.id;
    let active = true;
    autoReadRequested.current.add(id);
    setAutoReadingId(id);
    api<{ paper: Paper; errors: string[] }>(
      `/api/papers/${encodeURIComponent(id)}/read`,
      { method: "POST" },
    )
      .then((result) => {
        setPapers((previous) =>
          previous.map((paper) => (paper.id === id ? result.paper : paper)),
        );
        if (active && !result.paper.analysis)
          setReadingError(result.errors.join("；") || "精读暂不可用");
      })
      .catch((error) => {
        if (!active) return;
        const detail = (error as Error).message;
        if (detail.includes("次数已用完")) autoReadPaused.current = true;
        setReadingError(detail);
      })
      .finally(() => {
        if (active) setAutoReadingId("");
      });
    return () => {
      active = false;
      setAutoReadingId("");
    };
  }, [section, selected?.id, selected?.analysis, selected?.abstract]);
  useEffect(() => {
    const hasEvidence = selected?.repoAudit?.checks
      .slice(1)
      .some((check) => check.status === "有");
    if (
      section !== "library" ||
      !selected?.id ||
      (selected.repoAudit?.evaluation && hasEvidence) ||
      autoRepoPaused.current ||
      autoRepoRequested.current.has(selected.id)
    )
      return;
    if (
      selected.repoDiscovery &&
      !selected.repoUrl &&
      Date.now() - Date.parse(selected.repoDiscovery.checkedAt) < 7 * 86400000
    )
      return;
    const id = selected.id;
    autoRepoRequested.current.add(id);
    let active = true;
    setAuditing(true);
    api<{ paper: Paper; audit: RepoAudit | null }>("/api/repo-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperId: id }),
    })
      .then((result) => {
        setPapers((previous) =>
          previous.map((paper) => (paper.id === id ? result.paper : paper)),
        );
        if (active) setAudit(result.audit);
      })
      .catch((error) => {
        if (!active) return;
        const detail = (error as Error).message;
        if (detail.includes("次数已用完")) autoRepoPaused.current = true;
        setRepoLookupError(detail);
      })
      .finally(() => {
        if (active) setAuditing(false);
      });
    return () => {
      active = false;
      setAuditing(false);
    };
  }, [
    section,
    selected?.id,
    selected?.repoUrl,
    selected?.repoAudit?.evaluation,
    selected?.repoDiscovery?.checkedAt,
  ]);
  const relatedForSelected = useMemo(
    () => (selected ? relatedPapers(visible, selected, 3) : []),
    [visible, selected],
  );
  useEffect(() => {
    if (
      !selected?.id ||
      selected.id !== summaryRequestedId ||
      (selected.summaryZh && selected.summaryBasis !== "元数据")
    )
      return;
    const id = selected.id;
    let active = true;
    setSummarizingId(id);
    setSummaryError("");
    api<{ paper: Paper }>(`/api/papers/${encodeURIComponent(id)}/summary`, {
      method: "POST",
    })
      .then((result) => {
        if (active)
          setPapers((previous) =>
            previous.map((paper) =>
              paper.id === id
                ? {
                    ...paper,
                    summaryZh: result.paper.summaryZh,
                    summaryBasis: result.paper.summaryBasis,
                    summarySourceUrl: result.paper.summarySourceUrl,
                  }
                : paper,
            ),
          );
      })
      .catch((error) => {
        if (active) setSummaryError((error as Error).message);
      })
      .finally(() => {
        if (active) setSummarizingId("");
      });
    return () => {
      active = false;
    };
  }, [selected?.id, selected?.summaryZh, summaryRequestedId, summaryRetry]);
  useEffect(() => {
    if (
      section !== "library" ||
      !selected?.id ||
      !selected.abstract.trim() ||
      selected.abstractZh ||
      selected.reviewAbstractZh
    )
      return;
    const id = selected.id;
    let active = true;
    setTranslatingId(id);
    setTranslationError("");
    api<{ paper: Paper }>(
      `/api/papers/${encodeURIComponent(id)}/abstract-translation`,
      { method: "POST" },
    )
      .then((result) => {
        if (active)
          setPapers((previous) =>
            previous.map((paper) =>
              paper.id === id
                ? {
                    ...paper,
                    abstractZh: result.paper.abstractZh,
                    abstractSourceUrl: result.paper.abstractSourceUrl,
                    reviewAbstractZh: result.paper.reviewAbstractZh,
                    reviewAbstractSourceUrl:
                      result.paper.reviewAbstractSourceUrl,
                  }
                : paper,
            ),
          );
      })
      .catch((error) => {
        if (active) setTranslationError((error as Error).message);
      })
      .finally(() => {
        if (active) setTranslatingId("");
      });
    return () => {
      active = false;
    };
  }, [
    section,
    selected?.id,
    selected?.abstract,
    selected?.abstractZh,
    selected?.reviewAbstractZh,
    translationRetry,
  ]);
  const readCount = papers.filter((paper) => readIds.has(paper.id)).length;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [section]);
  const methodCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(methodColors).map((method) => [
          method,
          papers.filter(
            (p) => (!readOnly || readIds.has(p.id)) && p.method === method,
          ).length,
        ]),
      ) as Record<Method, number>,
    [papers, readOnly, readIds],
  );

  async function research() {
    setLoading(true);
    setMessage("");
    try {
      const result = await api<{
        papers: Paper[];
        matchingCount: number;
        lexmountCount: number;
        sources: string[];
        warnings: string[];
      }>("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      setPapers(result.papers);
      const focus = [...result.papers].sort(
        (a, b) => b.relevance - a.relevance || b.citedByCount - a.citedByCount,
      )[0];
      setSelectedId(focus?.id || "");
      clearFilters();
      const libraryIndex = [...result.papers]
        .sort((a, b) => b.year - a.year || b.citedByCount - a.citedByCount)
        .findIndex((paper) => paper.id === focus?.id);
      setLibraryPage(
        Math.floor(Math.max(0, libraryIndex) / LIBRARY_PAGE_SIZE) + 1,
      );
      setSection("atlas");
      setMessage(
        `Lexmount 优先检索完成：本次发现或核验 ${result.lexmountCount} 篇论文；文献库共 ${result.papers.length} 篇${result.warnings.length ? `。部分路径未成功，已尝试替代路径：${result.warnings.join("；")}` : ""}`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function readSelected() {
    if (!selected) return;
    autoReadRequested.current.add(selected.id);
    setReading(true);
    setReadingError("");
    setMessage("");
    try {
      const result = await api<{
        paper: Paper;
        depth: string;
        lexmountUsed: boolean;
        errors: string[];
      }>(`/api/papers/${encodeURIComponent(selected.id)}/read`, {
        method: "POST",
      });
      setPapers((prev) =>
        prev.map((p) => (p.id === selected.id ? result.paper : p)),
      );
      if (!result.paper.analysis)
        setReadingError(result.errors.join("；") || "精读暂不可用");
      setMessage(
        `${result.depth}分析${result.lexmountUsed ? " · 已调用 Lexmount Web Fetch" : ""}${result.errors.length ? ` · ${result.errors.join("；")}` : ""}`,
      );
    } catch (e) {
      setReadingError((e as Error).message);
      setMessage((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  async function generateIdeas(count: 1 | 3 | 5 | 10 = 1) {
    if (generating || query.trim().length < 4) return;
    setGenerating(true);
    setSection("ideas");
    setMessage("");
    setIdeas([]);
    try {
      let research = researchBrief;
      if (
        !research ||
        research.query !== query.trim() ||
        Date.now() > Date.parse(research.expiresAt)
      ) {
        setDrawProgress(
          "正在检索已有与最新研究，并由 AI 规划相近工作补充检索…",
        );
        const prepared = await api<{
          research: IdeasResearch;
          evidencePapers: Paper[];
        }>("/api/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "prepare", query }),
        });
        research = prepared.research;
        setResearchBrief(research);
        setPapers((previous) => {
          const ids = new Set(previous.map((paper) => paper.id));
          return [
            ...previous,
            ...prepared.evidencePapers.filter((paper) => !ids.has(paper.id)),
          ];
        });
      }
      const selected = research;
      let failures = 0;
      const failureMessages: string[] = [];
      const drawn: ResearchIdea[] = [];
      for (let drawIndex = 0; drawIndex < count; drawIndex++) {
        setDrawProgress(
          `第 ${drawIndex + 1} / ${count} 张 · 补查相近工作、构建方案并审查证据，每张可能需要几分钟`,
        );
        try {
          const previousIdeas = [
            ...ideaHistory
              .filter((item) => item.query === query.trim())
              .slice(0, 20)
              .reverse(),
            ...drawn,
          ]
            .slice(-20)
            .map(({ title, gap, hypothesis }) => ({ title, gap, hypothesis }));
          const result = await api<{
            idea: ResearchIdea;
            evidencePapers: Paper[];
            recorded: boolean;
          }>("/api/ideas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "draw",
              jobId: selected.jobId,
              drawIndex,
              previousIdeas,
            }),
          });
          const idea = result.idea;
          drawn.push(idea);
          setIdeas([...drawn]);
          setPapers((previous) => [
            ...new Map(
              [...previous, ...result.evidencePapers].map((paper) => [
                paper.id,
                paper,
              ]),
            ).values(),
          ]);
          setIdeaHistory((previous) =>
            [
              historyItem(idea, !user),
              ...previous.filter((item) => item.id !== idea.id),
            ].slice(0, 150),
          );
          if (!user) {
            try {
              localStorage.setItem(
                GUEST_IDEA_HISTORY_KEY,
                JSON.stringify(
                  [
                    idea,
                    ...readGuestIdeaHistory().filter(
                      (item) => item.id !== idea.id,
                    ),
                  ].slice(0, 50),
                ),
              );
            } catch {
              /* Browser storage can be unavailable. */
            }
          }
        } catch (error) {
          failures++;
          failureMessages.push((error as Error).message);
        }
        setDrawProgress(
          `已处理 ${drawIndex + 1} / ${count} 张${failures ? `，${failures} 张未完成` : ""}`,
        );
      }
      setMessage(
        `本次生成 ${drawn.length} 个通过证据核验与模型审查的选题${failures ? `；${failures} 张未完成：${[...new Set(failureMessages)].slice(0, 2).join("；")}` : ""}${drawn.length ? (user ? "；已加入抽卡历史，收藏后进入工作区" : "；已保存到本设备的抽卡历史，登录后可收藏") : ""}`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setGenerating(false);
      setDrawProgress("");
    }
  }
  async function openHistoryIdea(item: IdeaHistoryItem) {
    if (historySelected?.id === item.id) {
      setHistorySelected(null);
      return;
    }
    setHistoryLoadingId(item.id);
    try {
      if (item.local) {
        const idea = readGuestIdeaHistory().find(
          (value) => value.id === item.id,
        );
        if (!idea) throw new Error("本设备未找到这条抽卡记录");
        setHistorySelected(idea);
      } else {
        const result = await api<{
          idea: ResearchIdea;
          evidencePapers: Paper[];
        }>(`/api/ideas/history?id=${encodeURIComponent(item.id)}`);
        setHistorySelected(result.idea);
        setPapers((previous) => {
          const ids = new Set(previous.map((paper) => paper.id));
          return [
            ...previous,
            ...result.evidencePapers.filter((paper) => !ids.has(paper.id)),
          ];
        });
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setHistoryLoadingId("");
    }
  }
  async function toggleIdeaFavorite(idea: ResearchIdea) {
    if (!user || favoriteBusyId) return;
    const next = idea.favorite !== true;
    const local =
      ideaHistory.find((item) => item.id === idea.id)?.local === true;
    setFavoriteBusyId(idea.id);
    try {
      const result = await api<{ id: string; favorite: boolean }>(
        "/api/ideas/history",
        {
          method: local ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            local ? { idea } : { id: idea.id, favorite: next },
          ),
        },
      );
      const updated = { ...idea, favorite: result.favorite };
      setIdeas((previous) =>
        previous.map((value) => (value.id === idea.id ? updated : value)),
      );
      setHistorySelected((previous) =>
        previous?.id === idea.id ? updated : previous,
      );
      setIdeaHistory((previous) =>
        previous.map((item) =>
          item.id === idea.id
            ? { ...item, favorite: result.favorite, local: false }
            : item,
        ),
      );
      setWorkspace((previous) =>
        previous
          ? {
              ...previous,
              ideas: result.favorite
                ? [
                    updated,
                    ...previous.ideas.filter((value) => value.id !== idea.id),
                  ]
                : previous.ideas.filter((value) => value.id !== idea.id),
            }
          : previous,
      );
      if (local) {
        try {
          localStorage.setItem(
            GUEST_IDEA_HISTORY_KEY,
            JSON.stringify(
              readGuestIdeaHistory().filter((value) => value.id !== idea.id),
            ),
          );
        } catch {
          /* Keep the server copy. */
        }
      }
      setMessage(
        result.favorite
          ? "选题已保存，可在我的工作区查看"
          : "已取消保存；选题仍保留在抽卡历史中",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setFavoriteBusyId("");
    }
  }
  async function testAiKey() {
    if (!aiKeyInput.trim()) return;
    setAiBusy(true);
    setAiTested(null);
    setMessage("");
    try {
      const result = await api<{ valid: boolean; available: boolean }>(
        "/api/settings/ai",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: aiKeyInput.trim() }),
        },
      );
      setAiTested(result.valid);
      setMessage(
        result.available
          ? "DeepSeek 连接成功"
          : "API Key 有效，但当前账户余额不足，生成请求可能失败",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setAiBusy(false);
    }
  }
  async function saveAiKey() {
    if (!aiKeyInput.trim()) return;
    setAiBusy(true);
    setMessage("");
    try {
      const result = await api<AiSettings & { available: boolean }>(
        "/api/settings/ai",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: aiKeyInput.trim() }),
        },
      );
      setAiSettings(result);
      setAiKeyInput("");
      setAiTested(null);
      setMessage(
        result.available
          ? "个人 DeepSeek API Key 已加密保存，后续 AI 请求将优先使用它"
          : "个人 Key 已保存，但账户余额不足，AI 请求可能失败",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setAiBusy(false);
    }
  }
  async function deleteAiKey() {
    setAiBusy(true);
    setMessage("");
    try {
      const result = await api<{ configured: boolean; siteFallback: boolean }>(
        "/api/settings/ai",
        { method: "DELETE" },
      );
      setAiSettings((previous) => ({
        configured: false,
        updatedAt: null,
        siteFallback: result.siteFallback,
        model: previous?.model || "deepseek-flash",
      }));
      setAiKeyInput("");
      setAiTested(null);
      setMessage("个人 API Key 已删除，后续请求将使用站点配置");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setAiBusy(false);
    }
  }
  async function savePaper(paper: Paper, saved = !savedPaperIds.has(paper.id)) {
    if (!user) {
      window.location.href = signInPath;
      return;
    }
    if (paperSaveBusyId) return;
    setPaperSaveBusyId(paper.id);
    try {
      const result = await api<{ saved: boolean }>("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, saved }),
      });
      setWorkspace((previous) => ({
        savedPapers: result.saved
          ? [
              paper,
              ...(previous?.savedPapers || []).filter((p) => p.id !== paper.id),
            ]
          : (previous?.savedPapers || []).filter((p) => p.id !== paper.id),
        ideas: previous?.ideas || [],
        uploads: previous?.uploads || [],
      }));
      setMessage(
        result.saved ? "文献已收藏，可在我的工作区查看" : "已取消文献收藏",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPaperSaveBusyId("");
    }
  }
  function paperSaveButton(paper: Paper, iconOnly = false) {
    const saved = savedPaperIds.has(paper.id);
    return (
      <button
        type="button"
        className={`paper-save-button ${saved ? "active" : ""} ${iconOnly ? "icon-only" : ""}`}
        onClick={() => savePaper(paper)}
        disabled={Boolean(paperSaveBusyId) || Boolean(user && !workspace)}
        aria-pressed={saved}
        aria-label={saved ? "取消收藏文献" : "收藏文献到我的工作区"}
        aria-busy={paperSaveBusyId === paper.id}
        title={saved ? "取消收藏文献" : "收藏文献到我的工作区"}
      >
        {paperSaveBusyId === paper.id ? (
          <LoaderCircle size={17} className="spin" aria-hidden="true" />
        ) : (
          <Bookmark
            size={17}
            fill={saved ? "currentColor" : "none"}
            aria-hidden="true"
          />
        )}
        {!iconOnly &&
          (paperSaveBusyId === paper.id
            ? "处理中…"
            : !user
              ? "登录后收藏"
              : !workspace
                ? "加载收藏…"
                : saved
                  ? "已收藏 · 取消"
                  : "收藏文献")}
      </button>
    );
  }
  async function runAudit() {
    if (!selected && !repoInput) return;
    setAuditing(true);
    setAudit(null);
    setRepoLookupError("");
    try {
      const knownRepo = Boolean(
        selected &&
          repoInput.trim().replace(/\/$/, "").toLowerCase() ===
            selected.repoUrl.replace(/\/$/, "").toLowerCase(),
      );
      const result = await api<{ audit: RepoAudit | null; paper?: Paper }>(
        "/api/repo-audit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoUrl: knownRepo ? "" : repoInput,
            paperId: selected?.id,
            refresh: knownRepo || !repoInput,
          }),
        },
      );
      if (result.paper) {
        setPapers((previous) =>
          previous.map((paper) =>
            paper.id === result.paper!.id ? result.paper! : paper,
          ),
        );
        setRepoInput(result.paper.repoUrl || "");
      }
      setAudit(result.audit);
    } catch (e) {
      setRepoLookupError((e as Error).message);
    } finally {
      setAuditing(false);
    }
  }
  async function uploadPdf(file: File) {
    if (!user) {
      window.location.href = signInPath;
      return;
    }
    setUploading(true);
    setMessage("");
    let task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
    try {
      if (!file.name.toLowerCase().endsWith(".pdf"))
        throw new Error("请选择 PDF 文件");
      if (file.size > PDF_MAX_BYTES) throw new Error("PDF 请控制在 20 MB 以下");
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      task = pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
      });
      const pdf = await task.promise;
      const text = await extractPdfText(pdf);
      const form = new FormData();
      form.append("file", file);
      form.append("text", text);
      form.append("pages", String(pdf.numPages));
      await api("/api/upload", { method: "POST", body: form });
      await loadWorkspace();
      setMessage(`已保存 ${file.name}（${pdf.numPages} 页）`);
    } catch (e) {
      const error = e as Error;
      setMessage(
        error.name === "PasswordException"
          ? "PDF 受密码保护，请先解密后上传"
          : error.name === "InvalidPDFException"
            ? "PDF 已损坏或格式无效，请换一个文件重试"
            : error.message,
      );
    } finally {
      await task?.destroy().catch(() => {});
      setUploading(false);
    }
  }
  async function analyzeUpload(id: string) {
    setPdfReading(id);
    setMessage("");
    try {
      const result = await api<{ analysis: PaperAnalysis }>(
        `/api/upload/${id}/analyze`,
        { method: "POST" },
      );
      setPdfAnalysis((prev) => ({ ...prev, [id]: result.analysis }));
      setMessage("PDF 精读完成，证据仅来自你上传的文档");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPdfReading("");
    }
  }
  async function deleteUpload(id: string) {
    try {
      await api(`/api/upload/${id}`, { method: "DELETE" });
      setMessage("PDF 已删除");
      loadWorkspace();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function toggleRead(paper: Paper) {
    if (!readStatusReady) return;
    const read = !readIds.has(paper.id);
    const next = new Set(readIds);
    if (read) next.add(paper.id);
    else next.delete(paper.id);
    setReadIds(next);
    if (!user) {
      try {
        localStorage.setItem(
          "medatlas-guest-read-papers",
          JSON.stringify([...next]),
        );
      } catch {
        setMessage("浏览器无法保存已阅读状态");
      }
      return;
    }
    try {
      await api("/api/reading-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, read }),
      });
    } catch (error) {
      setReadIds((current) => {
        const restored = new Set(current);
        if (read) restored.delete(paper.id);
        else restored.add(paper.id);
        return restored;
      });
      setMessage(`已阅读状态保存失败：${(error as Error).message}`);
    }
  }
  function clearFilters() {
    setReadOnly(false);
    setMethodFilter(null);
    setTypeFilter("全部类型");
    setModalityFilter("全部模态");
    setYearFilter("全部年份");
    setLibraryPage(1);
  }
  function toggleReadFilter() {
    const next = !readOnly;
    setReadOnly(next);
    if (next) {
      setMethodFilter(null);
      setTypeFilter("全部类型");
      setModalityFilter("全部模态");
      setYearFilter("全部年份");
    }
    setLibraryPage(1);
  }
  function methodLegendButton(method: Method, color: string) {
    return (
      <button
        key={method}
        className={methodFilter === method ? "active" : ""}
        onClick={() => setMethodFilter(methodFilter === method ? null : method)}
        aria-pressed={methodFilter === method}
        title={
          method === "待核验" ? "标题和摘要未明确说明方法，需人工核验" : method
        }
      >
        <i style={{ background: color }} />
        {method}
        <small>{methodCounts[method]}</small>
      </button>
    );
  }
  function selectPaper(paper: Paper) {
    setSelectedId(paper.id);
    setSummaryRequestedId(paper.id);
    setRepoInput(paper.repoUrl || "");
    setAudit(null);
    const index = visible.findIndex((item) => item.id === paper.id);
    if (index >= 0) setLibraryPage(Math.floor(index / LIBRARY_PAGE_SIZE) + 1);
  }
  function goToLibraryPage(page: number) {
    const next = Math.max(1, Math.min(page, libraryPageCount));
    setLibraryPage(next);
    const first = visible[(next - 1) * LIBRARY_PAGE_SIZE];
    if (first) {
      setSelectedId(first.id);
      setRepoInput(first.repoUrl || "");
      setAudit(null);
    }
  }

  return (
    <div className="app-shell">
      <div className="main-column">
        <header className="site-header">
          <div className="top-left">
            <div className="top-brand">
              <span className="brand-symbol small">
                <span />
              </span>
              <span>
                MedAtlas<small>RESEARCH INTELLIGENCE</small>
              </span>
            </div>
          </div>
          <nav className="primary-nav" aria-label="主要导航">
            {sections.map((s) => (
              <button
                key={s.id}
                className={
                  section === s.id
                    ? "primary-nav-item active"
                    : "primary-nav-item"
                }
                aria-label={s.label}
                aria-current={section === s.id ? "page" : undefined}
                onClick={() => {
                  setSection(s.id);
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
              >
                <s.icon size={19} strokeWidth={1.8} />
                <span className="nav-label-full">{s.label}</span>
                <span className="nav-label-compact">
                  {
                    {
                      atlas: "星图",
                      library: "文献库",
                      ideas: "选题",
                      workspace: "工作区",
                      settings: "设置",
                    }[s.id]
                  }
                </span>
              </button>
            ))}
          </nav>
          <div className="top-actions">
            {user ? (
              <a
                className="account-pill"
                href={signOutPath}
                target="_top"
                title="退出登录"
              >
                <span>{user.name.slice(0, 1).toUpperCase()}</span>
                {user.name.length > 16
                  ? `${user.name.slice(0, 16)}…`
                  : user.name}
              </a>
            ) : (
              <a className="sign-in" href={signInPath} target="_top">
                登录 / 保存研究 <ArrowUpRight size={15} />
              </a>
            )}
          </div>
        </header>

        <main className="content">
          {message && (
            <div className="notice" role="status">
              <span>{message}</span>
              <button aria-label="关闭提示" onClick={() => setMessage("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {section === "atlas" && (
            <>
              <div className="atlas-layout">
                <div className="atlas-main" id="atlas-map">
                  <div className="map-canvas">
                    <AtlasScene
                      papers={visible}
                      selectedId={selected?.id || ""}
                      onPick={selectPaper}
                      motion={motion}
                    />
                    {readOnly && visible.length === 0 && (
                      <div className="map-empty-overlay">
                        还没有已阅读论文。关闭筛选后，选择论文并标记已阅读。
                      </div>
                    )}
                    <div className="map-overlay-top">
                      <span>
                        <span className="live-dot" /> TEMPORAL KNOWLEDGE SPACE
                      </span>
                      <button onClick={() => setMotion(!motion)}>
                        {motion ? "暂停动画" : "开启动画"}
                      </button>
                    </div>
                    {selected && (
                      <button
                        className="map-focus-link"
                        onClick={() =>
                          document
                            .getElementById("selected-paper-card")
                            ?.scrollIntoView({
                              behavior: motion ? "smooth" : "auto",
                              block: "start",
                            })
                        }
                        title="跳转到当前论文详情"
                      >
                        <span>
                          <small>当前论文 · {selected.year}</small>
                          <strong>{selected.title}</strong>
                        </span>
                        <ArrowDownRight size={16} />
                      </button>
                    )}
                  </div>
                  <div className="map-footer">
                    <div className="legend" aria-label="按研究方法筛选">
                      <button
                        className={!methodFilter ? "active" : ""}
                        onClick={() => setMethodFilter(null)}
                        aria-pressed={!methodFilter}
                      >
                        全部方向{" "}
                        <small>{readOnly ? readCount : papers.length}</small>
                      </button>
                      {(Object.entries(methodColors) as [Method, string][])
                        .filter(([method]) => method !== "待核验")
                        .map(([method, color]) =>
                          methodLegendButton(method, color),
                        )}
                      <span className="legend-pair">
                        {methodLegendButton("待核验", methodColors["待核验"])}
                        <button
                          className={`read-filter ${readOnly ? "active" : ""}`}
                          onClick={toggleReadFilter}
                          aria-pressed={readOnly}
                          disabled={!readStatusReady}
                        >
                          <Check size={12} />
                          已阅读<small>{readCount}</small>
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
                <aside className="atlas-rail">
                  <div className="rail-card featured" id="selected-paper-card">
                    <div className="rail-heading">
                      <div className="rail-label">
                        SELECTED PAPER <span>·</span> 当前聚焦
                      </div>
                      {selected && paperSaveButton(selected)}
                    </div>
                    {selected ? (
                      <>
                        <div className="rail-year">
                          {selected.year}
                          <span>{selected.paperType}</span>
                        </div>
                        <h3>{selected.title}</h3>
                        <p className="rail-venue">
                          {selected.publicationVenue &&
                          selected.publicationVenue.type !== "待核验"
                            ? `${selected.publicationVenue.type} · ${selected.publicationVenue.name}`
                            : "发表载体待核验"}
                        </p>
                        <PaperSummary
                          paper={selected}
                          loading={summarizingId === selected.id}
                          error={summaryError}
                          onRetry={() => {
                            setSummaryRequestedId(selected.id);
                            setSummaryRetry((n) => n + 1);
                          }}
                        />
                        <p>
                          {selected.abstractZh ||
                          selected.reviewAbstractZh ||
                          selected.abstract
                            ? `${(selected.abstractZh || selected.reviewAbstractZh || selected.abstract).slice(0, 180)}${(selected.abstractZh || selected.reviewAbstractZh || selected.abstract).length > 180 ? "…" : ""}`
                            : "当前来源暂未提供摘要。打开原文获取更多信息。"}
                        </p>
                        <div className="rail-tags">
                          <span>{selected.modality}</span>
                          <span>{selected.clinicalTask}</span>
                          <span>{selected.method}</span>
                        </div>
                        <div className="rail-action-grid">
                          <div className="rail-actions">
                            <button
                              onClick={readSelected}
                              disabled={
                                reading || autoReadingId === selected.id
                              }
                            >
                              {reading || autoReadingId === selected.id ? (
                                <LoaderCircle className="spin" size={15} />
                              ) : (
                                <BookOpen size={15} />
                              )}{" "}
                              精读论文
                            </button>
                          </div>
                          <button
                            className={`read-mark ${readIds.has(selected.id) ? "active" : ""}`}
                            onClick={() => toggleRead(selected)}
                            disabled={!readStatusReady}
                          >
                            <Check size={14} />
                            {readIds.has(selected.id)
                              ? "已阅读 · 取消标记"
                              : "标记已阅读"}
                          </button>
                        </div>
                        {relatedForSelected.length > 0 && (
                          <div className="rail-related">
                            <strong>主题相近 · 点击查看</strong>
                            {relatedForSelected
                              .slice(0, 2)
                              .map(({ paper, reason }) => (
                                <button
                                  key={paper.id}
                                  onClick={() => selectPaper(paper)}
                                >
                                  <small>{reason}</small>
                                  {paper.title}
                                </button>
                              ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p>选择图中的节点，查看论文详情。</p>
                    )}
                  </div>
                </aside>
              </div>
            </>
          )}

          {section === "library" && (
            <>
              <div className="section-heading">
                <div>
                  <span className="section-index">02 / READ</span>
                  <h2>
                    文献库 <span>Paper Library</span>
                  </h2>
                  <p>筛选、比较和精读真实文献；每条结论都可回溯到来源。</p>
                </div>
                <span className="source-chip">
                  {visible.length === papers.length
                    ? `${papers.length} 篇已收录`
                    : `${visible.length} / ${papers.length} 篇结果`}
                </span>
              </div>
              <div className="filters">
                <Filter size={17} />
                {[
                  [
                    typeFilter,
                    setTypeFilter,
                    ["全部类型", "综述", "研究论文", "预印本", "数据集"],
                  ],
                  [
                    modalityFilter,
                    setModalityFilter,
                    ["全部模态", "影像+文本", "影像", "病历文本", "多模态"],
                  ],
                  [
                    yearFilter,
                    setYearFilter,
                    ["全部年份", "近三年", "更早研究"],
                  ],
                ].map(([value, setter, options], i) => (
                  <label key={i} className="filter-select">
                    <select
                      value={value as string}
                      onChange={(e) =>
                        (setter as (s: string) => void)(e.target.value)
                      }
                    >
                      {(options as string[]).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                ))}
                <label className="filter-select">
                  <select
                    aria-label="研究方向"
                    value={methodFilter || "全部方向"}
                    onChange={(e) =>
                      setMethodFilter(
                        e.target.value === "全部方向"
                          ? null
                          : (e.target.value as Method),
                      )
                    }
                  >
                    <option>全部方向</option>
                    {Object.keys(methodColors).map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                {(readOnly ||
                  typeFilter !== "全部类型" ||
                  modalityFilter !== "全部模态" ||
                  yearFilter !== "全部年份" ||
                  methodFilter) && (
                  <button className="clear-filters" onClick={clearFilters}>
                    清除筛选{readOnly ? " · 已阅读" : ""}
                  </button>
                )}
              </div>
              <div className="library-layout">
                <div className="library-list">
                  {libraryPapers.length ? (
                    libraryPapers.map((p) => (
                      <div key={p.id} className="library-item">
                        <button
                          className={`library-row ${selected?.id === p.id ? "active" : ""}`}
                          onClick={() => selectPaper(p)}
                        >
                          <div className="library-index">{p.year}</div>
                          <div>
                            <span
                              className="library-tag"
                              style={{ color: methodColors[p.method] }}
                            >
                              {p.method}
                            </span>
                            <h3>{p.title}</h3>
                            <p>
                              {p.authors
                                .slice(0, 3)
                                .map((a) => a.name)
                                .join(" · ") || p.source}
                            </p>
                            <p className="library-venue">
                              {p.publicationVenue &&
                              p.publicationVenue.type !== "待核验"
                                ? `${p.publicationVenue.type} · ${p.publicationVenue.name}`
                                : "发表载体待核验"}
                            </p>
                            <div
                              className={`library-summary ${p.summaryBasis === "元数据" ? "pending" : ""}`}
                            >
                              <strong>概述</strong>
                              <span>{p.summaryZh || "中文概述待补全"}</span>
                            </div>
                            <div className="library-meta">
                              <span>{p.paperType}</span>
                              <span>{p.modality}</span>
                              <span>
                                {p.citedByCount > 0
                                  ? `${p.citedByCount} 次引用`
                                  : "引用待补全"}
                              </span>
                              {readIds.has(p.id) && (
                                <span className="read-badge">
                                  <Check size={11} />
                                  已阅读
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                        {paperSaveButton(p, true)}
                      </div>
                    ))
                  ) : (
                    <p className="library-empty">没有符合筛选条件的论文。</p>
                  )}
                  {visible.length > LIBRARY_PAGE_SIZE && (
                    <nav className="library-pagination" aria-label="文献库分页">
                      <span>
                        第 {currentLibraryPage} / {libraryPageCount} 页 · 共{" "}
                        {visible.length} 篇
                      </span>
                      <div>
                        <button
                          onClick={() =>
                            goToLibraryPage(currentLibraryPage - 1)
                          }
                          disabled={currentLibraryPage === 1}
                          aria-label="上一页"
                        >
                          上一页
                        </button>
                        {libraryPageNumbers.map((page) => (
                          <button
                            key={page}
                            onClick={() => goToLibraryPage(page)}
                            className={
                              page === currentLibraryPage ? "active" : ""
                            }
                            aria-current={
                              page === currentLibraryPage ? "page" : undefined
                            }
                            aria-label={`第 ${page} 页`}
                          >
                            {page}
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            goToLibraryPage(currentLibraryPage + 1)
                          }
                          disabled={currentLibraryPage === libraryPageCount}
                          aria-label="下一页"
                        >
                          下一页
                        </button>
                      </div>
                    </nav>
                  )}
                </div>
                <div className="paper-detail">
                  {selected && (
                    <>
                      <div className="detail-top">
                        <span>文献档案 / PAPER DOSSIER</span>
                        {paperSaveButton(selected, true)}
                      </div>
                      <div className="detail-year">
                        {selected.year}
                        <span>{selected.paperType}</span>
                      </div>
                      <h2>{selected.title}</h2>
                      <div className="detail-author">
                        {selected.authors
                          .slice(0, 6)
                          .map((a) => a.name)
                          .join(" · ") || "作者信息待补全"}
                      </div>
                      <div className="publication-venue">
                        <strong>发表载体</strong>
                        <span>
                          {selected.publicationVenue &&
                          selected.publicationVenue.type !== "待核验"
                            ? `${selected.publicationVenue.type} · ${selected.publicationVenue.name}`
                            : "期刊／会议待核验"}
                        </span>
                        {selected.publicationVenue?.type !== "待核验" &&
                          selected.publicationVenue?.evidenceUrl && (
                            <a
                              href={selected.publicationVenue.evidenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              元数据依据 <ExternalLink size={12} />
                            </a>
                          )}
                      </div>
                      <div className="detail-chips">
                        <span>{selected.modality}</span>
                        <span>{selected.clinicalTask}</span>
                        <span>{selected.method}</span>
                        <span>索引来源：{selected.source}</span>
                        <span>采集：{selected.fetchedAt.slice(0, 10)}</span>
                      </div>
                      {selected.discovery && (
                        <div className="lex-discovery-proof">
                          <strong>Lexmount Web Fetch 发现 / 核验</strong>
                          <a
                            href={selected.discovery.searchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {selected.discovery.stage === "article-verification"
                              ? "Lexmount 已核验页面"
                              : "Lexmount 公开搜索页"}{" "}
                            <ExternalLink size={12} />
                          </a>
                          {selected.discovery.articleUrl &&
                            selected.discovery.articleUrl !==
                              selected.discovery.searchUrl && (
                              <a
                                href={selected.discovery.articleUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                公开论文页 <ExternalLink size={12} />
                              </a>
                            )}
                          <small>
                            抓取：{selected.discovery.capturedAt.slice(0, 10)} ·
                            请求 ID：{selected.discovery.requestId || "未返回"}
                          </small>
                        </div>
                      )}
                      <div className="detail-actions">
                        <a
                          href={selected.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          查看原文 <ExternalLink size={15} />
                        </a>
                        <button
                          onClick={readSelected}
                          disabled={reading || autoReadingId === selected.id}
                        >
                          {reading || autoReadingId === selected.id ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <Sparkles size={15} />
                          )}{" "}
                          AI 精读
                        </button>
                        <button
                          className={`read-mark ${readIds.has(selected.id) ? "active" : ""}`}
                          onClick={() => toggleRead(selected)}
                          disabled={!readStatusReady}
                        >
                          <Check size={14} />
                          {readIds.has(selected.id) ? "已阅读" : "标记已阅读"}
                        </button>
                      </div>
                      <div className="detail-section">
                        <h4>
                          摘要 / ABSTRACT <span>{selected.fulltextStatus}</span>
                        </h4>
                        {selected.abstract ? (
                          <>
                            <div className="translated-abstract">
                              <strong>DeepSeek 中文译文</strong>
                              {selected.abstractZh ||
                              selected.reviewAbstractZh ? (
                                <p>
                                  {selected.abstractZh ||
                                    selected.reviewAbstractZh}
                                </p>
                              ) : translatingId === selected.id ? (
                                <p>正在翻译摘要…</p>
                              ) : (
                                <>
                                  <p>
                                    {translationError || "中文译文暂不可用。"}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTranslationRetry((value) => value + 1)
                                    }
                                  >
                                    重试翻译
                                  </button>
                                </>
                              )}
                              <small>AI 翻译，请以英文原文为准。</small>
                            </div>
                            <details className="original-abstract">
                              <summary>查看英文原文</summary>
                              <p>{selected.abstract}</p>
                              <a
                                href={
                                  selected.abstractSourceUrl ||
                                  selected.reviewAbstractSourceUrl ||
                                  selected.url
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                论文来源 <ExternalLink size={13} />
                              </a>
                            </details>
                          </>
                        ) : (
                          <p>该来源未提供摘要。请打开原文。</p>
                        )}
                      </div>
                      {selected.analysis && (
                        <>
                          <div className="detail-section">
                            <h4>研究问题</h4>
                            <p>{selected.analysis.question}</p>
                          </div>
                          <div className="detail-section">
                            <h4>方法与实验</h4>
                            <p>{selected.analysis.method}</p>
                            {selected.analysis.datasets.length > 0 && (
                              <p>
                                <b>数据集：</b>
                                {selected.analysis.datasets.join("、")}
                              </p>
                            )}
                          </div>
                          <div className="detail-section">
                            <h4>主要发现</h4>
                            <ul>
                              {selected.analysis.findings.map((x, i) => (
                                <li key={i}>{x}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="detail-section">
                            <h4>局限与证据</h4>
                            <ul>
                              {selected.analysis.limitations.map((x, i) => (
                                <li key={i}>{x}</li>
                              ))}
                            </ul>
                            {selected.analysis.evidence.map((e, i) => (
                              <blockquote key={i}>
                                “{e.excerpt}”{" "}
                                <small>
                                  — {e.location} ·{" "}
                                  <a
                                    href={selected.analysis?.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    来源
                                  </a>
                                </small>
                              </blockquote>
                            ))}
                          </div>
                        </>
                      )}
                      {!selected.analysis && (
                        <div className="detail-section">
                          <h4>结构化精读</h4>
                          <p>
                            {autoReadingId === selected.id
                              ? "正在依据可用论文证据补全研究问题、方法与实验、主要发现和局限…"
                              : !selected.abstract.trim()
                                ? "公开来源暂未提供可核验摘要或全文，无法可靠生成精读；可查看原文或上传 PDF。"
                                : readingError
                                  ? `暂未完成：${readingError}。可点击上方 AI 精读重试。`
                                  : "研究问题、方法与实验、主要发现和局限尚待补全；可点击上方 AI 精读重试。"}
                          </p>
                        </div>
                      )}
                      <div className="detail-section">
                        <h4>关联研究</h4>
                        <div className="related-links">
                          {selected.authors
                            .slice(0, 2)
                            .filter((a) => a.id)
                            .map((a) => (
                              <a
                                key={a.id}
                                href={a.id}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <span>研究人员</span>
                                {a.name}
                                <ArrowUpRight size={14} />
                              </a>
                            ))}
                          {selected.institutions.slice(0, 2).map((i) => (
                            <div key={i}>
                              <span>所属机构</span>
                              {i}
                            </div>
                          ))}
                          {relatedForSelected
                            .slice(0, 2)
                            .map(({ paper, reason }) => (
                              <button
                                key={paper.id}
                                onClick={() => selectPaper(paper)}
                              >
                                <span>{reason}</span>
                                {paper.title}
                                <ArrowUpRight size={14} />
                              </button>
                            ))}
                        </div>
                      </div>
                      <div className="detail-section">
                        <h4>代码仓库评价</h4>
                        <p>
                          自动从论文公开页面寻找代码链接，并检查仓库资料与可追溯证据；未经实际运行复现。
                        </p>
                        {selected.repoUrl && (
                          <p>
                            <a
                              href={selected.repoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              查看仓库
                            </a>
                            {selected.repoEvidenceUrl ? (
                              <>
                                {" "}
                                ·{" "}
                                <a
                                  href={selected.repoEvidenceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  论文页面链接证据
                                </a>
                              </>
                            ) : (
                              " · 论文关联尚未核验"
                            )}
                          </p>
                        )}
                        {!selected.repoUrl && selected.repoDiscovery && (
                          <p className="repo-discovery-note">
                            {selected.repoDiscovery.status === "ambiguous"
                              ? "论文页面出现多个仓库链接，暂无法确认哪个属于本论文。"
                              : "本次未在可读取的论文页面与摘要中找到明确的 GitHub 仓库链接。"}{" "}
                            <a
                              href={selected.repoDiscovery.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              查看论文来源
                            </a>
                          </p>
                        )}
                        {repoLookupError && (
                          <p className="repo-evaluation-error">
                            仓库查找失败：{repoLookupError}
                          </p>
                        )}
                        <div className="repo-input">
                          <GitBranch size={17} />
                          <input
                            value={repoInput}
                            onChange={(e) => setRepoInput(e.target.value)}
                            placeholder="可选：手动填写 GitHub 仓库 URL"
                          />
                          <button onClick={runAudit} disabled={auditing}>
                            {auditing
                              ? "查找与评价中"
                              : repoInput
                                ? "评价仓库"
                                : "重新查找"}
                          </button>
                        </div>
                        {currentAudit && (
                          <div className="audit-result">
                            <RepoEvaluationView audit={currentAudit} />
                            <small>{currentAudit.disclaimer}</small>
                            {currentAudit.checks.map((c) => (
                              <div key={c.label}>
                                <span>{c.label}</span>
                                <strong className={`audit-${c.status}`}>
                                  {c.status}
                                </strong>
                                <a
                                  href={
                                    c.evidence.startsWith("https://")
                                      ? c.evidence
                                      : currentAudit.repoUrl
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={c.evidence}
                                >
                                  <ExternalLink size={13} />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {section === "ideas" && (
            <>
              <div className="draw-toolbar">
                <div>
                  <b>抽卡</b>
                  <small>逐张补查相近工作 · 核验与审查后展示</small>
                </div>
                <div className="draw-options">
                  {([1, 3, 5, 10] as const).map((count) => (
                    <button
                      key={count}
                      onClick={() => generateIdeas(count)}
                      disabled={generating || query.trim().length < 4}
                    >
                      {generating ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {
                        (
                          {
                            1: "单抽",
                            3: "三连抽",
                            5: "五连抽",
                            10: "十连抽",
                          } as const
                        )[count]
                      }
                    </button>
                  ))}
                </div>
              </div>
              {drawProgress && (
                <p className="draw-progress" role="status">
                  <LoaderCircle size={15} className="spin" />
                  {drawProgress}
                </p>
              )}
              {researchBrief && (
                <details className="research-brief">
                  <summary>
                    调研摘要 · 已筛选 {researchBrief.selectedCount} /{" "}
                    {researchBrief.scannedCount} 篇候选论文{" "}
                    <ChevronDown size={15} />
                  </summary>
                  <div>
                    <p>{researchBrief.brief.landscape}</p>
                    {Boolean(researchBrief.followupQueries?.length) && (
                      <div className="research-followup">
                        <b>AI 补充检索的相近研究</b>
                        {researchBrief.followupQueries?.map((item, i) => (
                          <div key={`${item.query}-${i}`}>
                            <span>{item.purpose}</span>
                            <code>{item.query}</code>
                            <small>返回 {item.foundCount} 篇候选</small>
                          </div>
                        ))}
                      </div>
                    )}
                    <b>待验证空白</b>
                    <ul>
                      {researchBrief.brief.gaps.map((gap, i) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                    <b>证据局限</b>
                    <ul>
                      {researchBrief.brief.cautions.map((caution, i) => (
                        <li key={i}>{caution}</li>
                      ))}
                    </ul>
                    <small>
                      来源：{researchBrief.sources.join(" · ")} · 调研时间{" "}
                      {new Date(researchBrief.preparedAt).toLocaleString(
                        "zh-CN",
                      )}
                    </small>
                    {researchBrief.warnings.length > 0 && (
                      <small>
                        部分来源暂不可用：{researchBrief.warnings.join("；")}
                      </small>
                    )}
                  </div>
                </details>
              )}
              {ideas.length ? (
                <div className="idea-list">
                  {ideas.map((idea, i) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      index={i}
                      papers={papers}
                      onPaper={(p) => {
                        selectPaper(p);
                        setSection("library");
                      }}
                      onFavorite={toggleIdeaFavorite}
                      favoriteBusy={favoriteBusyId === idea.id}
                      authenticated={Boolean(user)}
                      signInPath={signInPath}
                    />
                  ))}
                </div>
              ) : (
                !generating &&
                !ideaHistory.length && (
                  <div className="empty-ideas">
                    <div className="empty-icon">
                      <Sparkles size={32} />
                    </div>
                    <h3>从一个待验证的问题开始</h3>
                    <p>
                      点击抽卡，系统会先检索文献、比对证据，再生成研究方案。
                    </p>
                  </div>
                )
              )}
              <details
                className="idea-history-panel"
                open={historyOpen}
                onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
              >
                <summary>
                  <span>
                    抽卡历史 <small>{ideaHistory.length} 条记录</small>
                  </span>
                  <ChevronDown size={17} />
                </summary>
                <div className="idea-history-body">
                  {ideaHistory.length ? (
                    <>
                      <div className="idea-history-list">
                        {ideaHistory
                          .slice(0, historyVisibleCount)
                          .map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              className={
                                historySelected?.id === item.id ? "active" : ""
                              }
                              onClick={() => openHistoryIdea(item)}
                            >
                              <span>
                                {item.createdAt.slice(0, 10)} ·{" "}
                                {item.paperCount} 篇论文
                                {item.favorite ? " · 已收藏" : ""}
                                {item.local ? " · 本设备" : ""}
                              </span>
                              <strong>{item.title}</strong>
                              <small>
                                {item.gap.slice(0, 120)}
                                {item.gap.length > 120 ? "…" : ""}
                              </small>
                              {historyLoadingId === item.id && <em>加载中…</em>}
                            </button>
                          ))}
                      </div>
                      {historyVisibleCount < ideaHistory.length && (
                        <button
                          type="button"
                          className="idea-history-more"
                          onClick={() =>
                            setHistoryVisibleCount((value) => value + 12)
                          }
                        >
                          查看更多记录
                        </button>
                      )}
                      {historySelected && (
                        <div className="idea-history-selected">
                          <IdeaCard
                            key={historySelected.id}
                            idea={historySelected}
                            index={Math.max(
                              0,
                              ideaHistory.findIndex(
                                (item) => item.id === historySelected.id,
                              ),
                            )}
                            papers={papers}
                            onPaper={(p) => {
                              selectPaper(p);
                              setSection("library");
                            }}
                            onFavorite={toggleIdeaFavorite}
                            favoriteBusy={favoriteBusyId === historySelected.id}
                            authenticated={Boolean(user)}
                            signInPath={signInPath}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <p>
                      {user
                        ? "还没有抽卡记录。生成选题后会保存在这里。"
                        : "还没有本设备的抽卡记录。生成选题后会保存在此浏览器。"}
                    </p>
                  )}
                </div>
              </details>
              <div className="research-note">
                <CircleHelp size={17} />{" "}
                研究选题是待检验假设，不能替代系统综述、实验复现或临床验证。
              </div>
            </>
          )}
          {section === "workspace" && (
            <>
              <div className="section-heading">
                <div>
                  <span className="section-index">04 / YOUR RESEARCH</span>
                  <h2>
                    我的工作区 <span>Workspace</span>
                  </h2>
                  <p>
                    保存重要文献、上传你有权使用的 PDF，并持续打磨研究选题。
                  </p>
                </div>
              </div>
              {!user ? (
                <div className="workspace-login">
                  <LockKeyhole size={30} />
                  <h3>登录后，继续你的研究</h3>
                  <p>公开文献地图无需登录；个人论文、PDF 和选题只对你可见。</p>
                  <a href={signInPath} target="_top">
                    登录并开启工作区 <ArrowRight size={16} />
                  </a>
                </div>
              ) : (
                <div className="workspace-grid">
                  <div className="workspace-panel">
                    <div className="workspace-panel-head">
                      <div>
                        <span>01 / SAVED PAPERS</span>
                        <h3>已收藏文献</h3>
                      </div>
                      <strong>{workspace?.savedPapers.length || 0}</strong>
                    </div>
                    {workspace?.savedPapers.length ? (
                      workspace.savedPapers.map((p) => (
                        <div key={p.id} className="saved-row">
                          <button
                            onClick={() => {
                              selectPaper(p);
                              setSection("library");
                            }}
                          >
                            {p.title}
                            <small>
                              {p.year} · {p.paperType}
                            </small>
                          </button>
                          <button
                            aria-label="移除收藏"
                            onClick={() => savePaper(p, false)}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="workspace-empty">
                        在文献卡片中点击收藏，建立你的阅读清单。
                      </p>
                    )}
                  </div>
                  <div className="workspace-panel">
                    <div className="workspace-panel-head">
                      <div>
                        <span>02 / PRIVATE LIBRARY</span>
                        <h3>我的 PDF</h3>
                      </div>
                      <strong>{workspace?.uploads.length || 0}</strong>
                    </div>
                    <label className="upload-zone">
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadPdf(f);
                          e.currentTarget.value = "";
                        }}
                        disabled={uploading}
                      />
                      <UploadCloud size={25} />
                      <b>
                        {uploading ? "正在解析并上传…" : "点击上传研究论文 PDF"}
                      </b>
                      <small>
                        只上传你有权使用的文件 · 最多 20 MB / 100 页
                      </small>
                    </label>
                    {workspace?.uploads.map((f) => (
                      <div key={f.id}>
                        <div className="upload-row">
                          <FileText size={17} />
                          <a
                            href={`/api/upload/${f.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {f.fileName}
                            <small>
                              {f.pageCount} 页 ·{" "}
                              {(f.fileSize / 1024 / 1024).toFixed(1)} MB
                            </small>
                          </a>
                          <button
                            className="upload-analyze"
                            onClick={() => analyzeUpload(f.id)}
                            disabled={pdfReading === f.id}
                          >
                            {pdfReading === f.id ? "分析中" : "AI 精读"}
                          </button>
                          <button
                            onClick={() => deleteUpload(f.id)}
                            aria-label="删除 PDF"
                          >
                            <X size={15} />
                          </button>
                        </div>
                        {pdfAnalysis[f.id] && (
                          <div className="upload-analysis">
                            <strong>研究问题</strong>
                            <p>{pdfAnalysis[f.id].question}</p>
                            <strong>方法</strong>
                            <p>{pdfAnalysis[f.id].method}</p>
                            <strong>主要发现</strong>
                            <ul>
                              {pdfAnalysis[f.id].findings.map((v, i) => (
                                <li key={i}>{v}</li>
                              ))}
                            </ul>
                            <strong>局限</strong>
                            <ul>
                              {pdfAnalysis[f.id].limitations.map((v, i) => (
                                <li key={i}>{v}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="workspace-panel full">
                    <div className="workspace-panel-head">
                      <div>
                        <span>03 / RESEARCH IDEAS</span>
                        <h3>已保存选题</h3>
                      </div>
                      <strong>{workspace?.ideas.length || 0}</strong>
                    </div>
                    {workspace?.ideas.length ? (
                      workspace.ideas.map((idea, i) => (
                        <div key={idea.id} className="saved-idea">
                          <span>IDEA {String(i + 1).padStart(2, "0")}</span>
                          <h4>
                            <button
                              type="button"
                              className="saved-idea-open"
                              onClick={() => {
                                setHistorySelected(idea);
                                setHistoryOpen(true);
                                setSection("ideas");
                              }}
                            >
                              {idea.title}
                            </button>
                          </h4>
                          <p>{idea.hypothesis}</p>
                          <div className="saved-idea-actions">
                            <small>
                              {idea.paperIds.length} 篇论文支撑 ·{" "}
                              {idea.createdAt.slice(0, 10)}
                            </small>
                            <button
                              type="button"
                              onClick={() => toggleIdeaFavorite(idea)}
                              disabled={favoriteBusyId === idea.id}
                            >
                              取消收藏
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="workspace-empty">
                        收藏抽卡历史中的选题后，才会出现在这里。
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          {section === "settings" && (
            <>
              <div className="section-heading">
                <div>
                  <span className="section-index">
                    05 / PERSONAL CONFIGURATION
                  </span>
                  <h2>
                    系统设置 <span>System Settings</span>
                  </h2>
                  <p>设定研究方向，并管理文献解读和选题生成所用的模型。</p>
                </div>
              </div>
              <div className="research-settings">
                <h3>研究方向</h3>
                <form
                  className="search-box settings-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    research();
                  }}
                >
                  <div className="search-icon">
                    <Search size={21} />
                  </div>
                  <div className="search-copy">
                    <label htmlFor="research-query">你的研究方向是什么？</label>
                    <input
                      id="research-query"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="例如：胸部影像与电子病历协同诊断 Agent"
                    />
                  </div>
                  <button type="submit" disabled={loading}>
                    {loading ? (
                      <LoaderCircle size={18} className="spin" />
                    ) : (
                      <ArrowRight size={19} />
                    )}
                    <span>{loading ? "检索中" : "探索文献"}</span>
                  </button>
                </form>
              </div>
              {!user ? (
                <div className="workspace-login">
                  <LockKeyhole size={30} />
                  <h3>登录后配置个人 API</h3>
                  <p>密钥只与当前登录账户关联，不会显示给其他访客。</p>
                  <a href={signInPath} target="_top">
                    登录并配置 <ArrowRight size={16} />
                  </a>
                </div>
              ) : (
                <div className="api-settings-layout">
                  <div className="api-settings-card">
                    <div className="api-settings-head">
                      <div className="api-provider-mark">D</div>
                      <div>
                        <span>MODEL PROVIDER</span>
                        <h3>DeepSeek API</h3>
                        <p>当前模型：{aiSettings?.model || "deepseek-flash"}</p>
                      </div>
                      <span
                        className={
                          aiSettings?.configured
                            ? "api-status active"
                            : "api-status"
                        }
                      >
                        {aiSettings?.configured
                          ? "个人 Key 已配置"
                          : "使用站点配置"}
                      </span>
                    </div>
                    <div className="api-settings-body">
                      <p>
                        个人 Key
                        将优先用于文献精读、中文概述与摘要翻译、代码仓库评价、PDF
                        分析和 Ideas 抽卡。删除后恢复使用站点配置。
                      </p>
                      <label htmlFor="deepseek-key">DeepSeek API Key</label>
                      <div className="api-key-field">
                        <LockKeyhole size={17} />
                        <input
                          id="deepseek-key"
                          type="password"
                          value={aiKeyInput}
                          onChange={(event) => {
                            setAiKeyInput(event.target.value);
                            setAiTested(null);
                          }}
                          placeholder={
                            aiSettings?.configured
                              ? "输入新 Key 以替换当前配置"
                              : "粘贴你的 DeepSeek API Key"
                          }
                          autoComplete="new-password"
                          spellCheck={false}
                          maxLength={256}
                        />
                      </div>
                      <small>
                        密钥仅提交给本站服务端并用于连接
                        DeepSeek；页面不会回显已保存的密钥。
                      </small>
                      <div className="api-key-actions">
                        <button
                          type="button"
                          onClick={testAiKey}
                          disabled={aiBusy || !aiKeyInput.trim()}
                        >
                          {aiBusy ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <Check size={15} />
                          )}
                          测试连接
                        </button>
                        <button
                          type="button"
                          className="save"
                          onClick={saveAiKey}
                          disabled={aiBusy || !aiKeyInput.trim()}
                        >
                          {aiBusy ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <LockKeyhole size={15} />
                          )}
                          保存个人 Key
                        </button>
                        {aiSettings?.configured && (
                          <button
                            type="button"
                            className="remove"
                            onClick={deleteAiKey}
                            disabled={aiBusy}
                          >
                            删除个人 Key
                          </button>
                        )}
                      </div>
                      {aiTested && (
                        <p className="api-test-result">
                          <Check size={15} />
                          连接验证通过
                        </p>
                      )}
                      {aiSettings?.configured && (
                        <p className="api-updated">
                          最近更新：
                          {new Date(aiSettings.updatedAt!).toLocaleString(
                            "zh-CN",
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <aside className="api-settings-note">
                    <CircleHelp size={19} />
                    <div>
                      <h4>使用范围</h4>
                      <p>
                        公开文献检索、Lexmount 网页读取仍由站点服务提供。个人
                        DeepSeek Key 只用于 AI 模型请求；用量和费用由你的
                        DeepSeek 账户承担。
                      </p>
                      <p>
                        本站服务端用独立加密密钥保存个人
                        Key。浏览器不会保存它，也不会通过设置接口读取原文。
                      </p>
                      <a
                        href="https://platform.deepseek.com/api_keys"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        前往 DeepSeek 创建 API Key <ExternalLink size={13} />
                      </a>
                    </div>
                  </aside>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
