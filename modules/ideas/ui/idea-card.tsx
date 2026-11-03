"use client";
import { useState } from "react";
import type { Paper, ResearchIdea } from "../../../shared/models";
import { formatIdeaForDiscussion } from "../export";
const discussionModels = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Claude", url: "https://claude.ai/" },
  { name: "Gemini", url: "https://gemini.google.com/" },
  { name: "Kimi K3", url: "https://www.kimi.com/" },
];
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Sparkles,
} from "lucide-react";
export function IdeaCard({
  idea,
  index,
  papers,
  onPaper,
  onFavorite,
  favoriteBusy,
  authenticated,
  signInPath,
}: {
  idea: ResearchIdea;
  index: number;
  papers: Paper[];
  onPaper: (p: Paper) => void;
  onFavorite: (idea: ResearchIdea) => void;
  favoriteBusy: boolean;
  authenticated: boolean;
  signInPath: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const refs = idea.paperIds
    .map((id) => papers.find((p) => p.id === id))
    .filter(Boolean) as Paper[];
  const plan = idea.fullPlan;
  const planRows = plan
    ? [
        ["数据与使用边界", plan.data],
        ["队列与数据划分", plan.cohortAndSplit],
        ["方法与实现", plan.method],
        ["对照基线", plan.baselines],
        ["评测指标", plan.evaluation],
        ["消融与控制", plan.controls],
        ["伦理与风险", plan.ethics],
      ]
    : [];
  const experiment = idea.minimumExperiment;
  const experimentRows = experiment
    ? [
        ["要回答的问题", experiment.question],
        ["数据与获取条件", experiment.data],
        ["对照基线", experiment.baseline],
        ["只改变的机制", experiment.intervention],
        ["主指标", experiment.primaryMetric],
        ["支持假设的判据", experiment.successCriterion],
        ["否定或停止条件", experiment.falsificationCriterion],
        ["资源预算与假设", experiment.resourceBudget],
      ]
    : [];
  async function copyFullIdea() {
    try {
      const content = formatIdeaForDiscussion(idea, papers);
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(content);
          copied = true;
        } catch {
          /* Try the browser selection fallback. */
        }
      }
      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard unavailable");
      }
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }
  return (
    <article className="idea-card">
      <div className="idea-card-head">
        <div className="idea-number">{String(index + 1).padStart(2, "0")}</div>
        <div>
          <span>RESEARCH OPPORTUNITY / 研究机会</span>
          <h3>{idea.title}</h3>
        </div>
        <Sparkles size={20} />
      </div>
      <div className="idea-summary">
        <div>
          <small>研究空白</small>
          <p>{idea.gap}</p>
        </div>
        <div>
          <small>核心假设</small>
          <p>{idea.hypothesis}</p>
        </div>
      </div>
      <div className="idea-share">
        <button type="button" className="idea-copy" onClick={copyFullIdea}>
          {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
          {copyState === "copied" ? "已复制完整方案" : "复制完整方案与证据"}
        </button>
        {authenticated ? (
          <button
            type="button"
            className={`idea-favorite ${idea.favorite ? "active" : ""}`}
            onClick={() => onFavorite(idea)}
            disabled={favoriteBusy}
            aria-pressed={idea.favorite === true}
          >
            <Bookmark
              size={14}
              fill={idea.favorite ? "currentColor" : "none"}
            />
            {favoriteBusy
              ? "处理中…"
              : idea.favorite
                ? "已保存 · 取消保存"
                : "保存选题"}
          </button>
        ) : (
          <a className="idea-favorite" href={signInPath} target="_top">
            <Bookmark size={14} />
            登录后保存选题
          </a>
        )}
        <div className="idea-model-links">
          <span>复制后继续讨论</span>
          {discussionModels.map((model) => (
            <a
              key={model.name}
              href={model.url}
              target="_blank"
              rel="noopener noreferrer"
              title={
                model.name === "Kimi K3"
                  ? "打开 Kimi 后选择 K3 模型"
                  : `打开 ${model.name}`
              }
            >
              {model.name === "Kimi K3" ? "Kimi（选 K3）" : model.name}
              <ArrowUpRight size={12} />
            </a>
          ))}
        </div>
        {copyState === "error" && (
          <small role="alert">复制失败，请允许浏览器使用剪贴板后重试。</small>
        )}
      </div>
      <details className="idea-expanded">
        <summary>
          <span className="idea-expand-closed">展开完整方案、可行性与证据</span>
          <span className="idea-expand-open">收起详细内容</span>
          <ChevronDown size={16} />
        </summary>
        <div className="idea-expanded-body">
          {Boolean(idea.closestWork?.length) && (
            <section className="idea-block">
              <h4>与相近工作的差异</h4>
              <div className="idea-plan">
                {idea.closestWork?.map((item) => (
                  <div key={item.paperId}>
                    <b>
                      {refs.find((p) => p.id === item.paperId)?.title ||
                        item.paperId}
                    </b>
                    <p>已有工作：{item.alreadyDone}</p>
                    <p>待验证差异：{item.difference}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {experiment && (
            <section className="idea-block">
              <h4>最小验证实验</h4>
              <div className="idea-plan">
                {experimentRows.map(([label, value]) => (
                  <div key={label}>
                    <b>{label}</b>
                    <p>{value}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="idea-block">
            <h4>
              改进工作{" "}
              <small>{idea.improvements?.length || 0} 项 · 含失败预案</small>
            </h4>
            <ol className="improvement-list">
              {idea.improvements?.map((item, i) => (
                <li key={i}>
                  <strong>
                    {item.priority && <small>{item.priority} · </small>}
                    {item.title}
                  </strong>
                  <p>{item.action}</p>
                  <div>
                    <span>可能不奏效：{item.risk}</span>
                    <span>回退方案：{item.fallback}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="idea-block">
            <h4>完整研究方案</h4>
            <div className="idea-plan">
              {planRows.map(([label, value]) => (
                <div key={label}>
                  <b>{label}</b>
                  <p>{value}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="idea-block">
            <h4>预期结论与证伪条件</h4>
            <ul className="idea-outcomes">
              {idea.expectedConclusions?.map((value, i) => (
                <li key={i}>{value}</li>
              ))}
            </ul>
          </section>
          {idea.feasibility && (
            <section className="idea-block">
              <h4>
                可行性评价{" "}
                <span className="feasibility-badge">
                  {idea.feasibility.rating}
                </span>
              </h4>
              <p>{idea.feasibility.rationale}</p>
              <div className="feasibility-grid">
                <div>
                  <b>所需资源</b>
                  <ul>
                    {idea.feasibility.resources.map((value, i) => (
                      <li key={i}>{value}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <b>主要阻碍</b>
                  <ul>
                    {idea.feasibility.blockers.map((value, i) => (
                      <li key={i}>{value}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}
          {idea.qualityReview && (
            <section className="idea-block">
              <h4>{idea.qualityReview.status}</h4>
              <p>{idea.qualityReview.summary}</p>
              <ul className="idea-outcomes">
                {idea.qualityReview.limitations.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          )}
          {idea.targetedSearch && (
            <section className="idea-block">
              <h4>针对本方案的补充检索</h4>
              <p>{idea.targetedSearch.query}</p>
              <small>
                核查到 {idea.targetedSearch.foundCount} 篇符合方向的候选 ·{" "}
                {idea.targetedSearch.sources.join(" · ") || "未取得新结果"}
              </small>
              {idea.targetedSearch.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
            </section>
          )}
          <details className="idea-evidence">
            <summary>
              相关论文与证据链 · {refs.length} 篇 <ChevronDown size={15} />
            </summary>
            <div className="idea-evidence-body">
              <p>
                <b>支持：</b>
                {idea.supportingEvidence}
              </p>
              <p>
                <b>反向 / 待确认：</b>
                {idea.counterEvidence}
              </p>
              {idea.evidenceChain?.map((item, i) => (
                <div className="evidence-claim" key={i}>
                  <span className={`stance stance-${item.stance}`}>
                    {item.stance}
                  </span>
                  <p>{item.claim}</p>
                  {item.anchors?.map((anchor, j) => (
                    <blockquote className="idea-source-quote" key={j}>
                      <p>{anchor.quote}</p>
                      <a
                        href={anchor.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {anchor.location} ·{" "}
                        {refs.find((p) => p.id === anchor.paperId)?.title ||
                          anchor.paperId}{" "}
                        <ExternalLink size={12} />
                      </a>
                    </blockquote>
                  ))}
                  <small>
                    {item.paperIds
                      .map((id) => refs.find((p) => p.id === id))
                      .filter(Boolean)
                      .map((p) => `${p!.year} · ${p!.title}`)
                      .join("；")}
                  </small>
                </div>
              ))}
              <div className="idea-references">
                {refs.map((p) => (
                  <div key={p.id} className="idea-ref">
                    <button onClick={() => onPaper(p)}>
                      {p.year} · {p.title} <ArrowUpRight size={12} />
                    </button>
                    <small>
                      {p.paperType} · {p.analysis?.depth || "仅摘要 / 元数据"}
                    </small>
                    <p>
                      {(p.abstractZh || p.abstract).slice(0, 260)}
                      {(p.abstractZh || p.abstract).length > 260 ? "…" : ""}
                    </p>
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                      查看论文原文 <ExternalLink size={12} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      </details>
    </article>
  );
}
