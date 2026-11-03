"use client";
import type { RepoAudit } from "../../../shared/models";
import { ExternalLink } from "lucide-react";
export function RepoEvaluationView({ audit }: { audit: RepoAudit }) {
  const evaluation = audit.evaluation;
  if (!evaluation)
    return audit.evaluationError ? (
      <p className="repo-evaluation-error">
        AI 评价暂不可用：{audit.evaluationError}
      </p>
    ) : null;
  const evidence = audit.checks.filter((check) =>
    evaluation.evidenceLabels.includes(check.label),
  );
  return (
    <div className="repo-evaluation">
      <div className="repo-evaluation-head">
        <strong>{evaluation.readiness}</strong>
        <small>DeepSeek · {evaluation.evaluatedAt.slice(0, 10)}</small>
      </div>
      <p>{evaluation.summaryZh}</p>
      {evaluation.strengths.length > 0 && (
        <p>
          <b>已有资料：</b>
          {evaluation.strengths.join("；")}
        </p>
      )}
      {evaluation.gaps.length > 0 && (
        <p>
          <b>待核验或缺口：</b>
          {evaluation.gaps.join("；")}
        </p>
      )}
      {evaluation.nextSteps.length > 0 && (
        <p>
          <b>建议下一步：</b>
          {evaluation.nextSteps.join("；")}
        </p>
      )}
      <div className="repo-evaluation-evidence">
        <b>依据</b>
        {evidence.map((check) => (
          <a
            key={check.label}
            href={check.evidence}
            target="_blank"
            rel="noopener noreferrer"
          >
            {check.label} · {check.status} <ExternalLink size={12} />
          </a>
        ))}
        <a
          href={evaluation.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Lexmount 仓库页面 <ExternalLink size={12} />
        </a>
        {evaluation.readmeSourceUrl && (
          <a
            href={evaluation.readmeSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            README 原文 <ExternalLink size={12} />
          </a>
        )}
      </div>
      <small>{evaluation.disclaimer}</small>
    </div>
  );
}
