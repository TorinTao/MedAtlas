"use client";
import type { Paper } from "../../../shared/models";
import {} from "lucide-react";
export function PaperSummary({
  paper,
  loading,
  error,
  onRetry,
}: {
  paper: Paper;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="paper-summary">
      <div>
        <strong>概述</strong>
        <small>
          {paper.summaryBasis === "元数据"
            ? loading
              ? "元数据概述 · 正在完善"
              : "元数据概述 · 待自动完善"
            : paper.summaryBasis
              ? `依据：${paper.summaryBasis}`
              : "根据可用元数据"}
        </small>
        {paper.summarySourceUrl && (
          <a
            href={paper.summarySourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            公开页面来源
          </a>
        )}
      </div>
      <p>{paper.summaryZh || "正在生成中文概述…"}</p>
      {paper.summaryBasis === "元数据" && error && (
        <button onClick={onRetry}>重试完善概述</button>
      )}
      <small>
        {paper.summaryBasis === "元数据"
          ? "临时主题提示，正在由 DeepSeek 根据论文摘要补全。"
          : "AI 生成的概述，请核对论文原文。"}
      </small>
    </div>
  );
}
