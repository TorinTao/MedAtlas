import type { Paper } from "./models";
/** Provider-neutral contracts. Domain modules never receive API keys. */
export type ModelOptions = {
  thinking?: boolean;
  reasoningEffort?: "low" | "high" | "max";
  maxTokens?: number;
  timeoutMs?: number;
};
export type JsonModel = (
  system: string,
  input: string,
  options?: ModelOptions,
) => Promise<unknown>;
export type PublicPage = {
  text: string;
  title: string;
  finalUrl: string;
  description: string;
  author: string;
  publishTime: string;
  requestId: string;
};
export interface WebReader {
  extract(url: string, timeoutMs?: number): Promise<PublicPage>;
  dumpDom(url: string): Promise<{
    html: string;
    finalUrl: string;
  }>;
}
export interface PaperRepository {
  all(): Promise<Paper[]>;
  find(id: string): Promise<Paper | undefined>;
  put(papers: Paper[]): Promise<void>;
}
export type FullTextReader = (paper: Paper) => Promise<{
  text: string;
  url: string;
} | null>;
export type PublicDomReader = (url: string) => Promise<{
  html: string;
  finalUrl: string;
}>;
export interface PaperSource {
  name: string;
  search(query: string, limit: number): Promise<Paper[]>;
  queryLimit: number;
  corpusLimit: number;
}
