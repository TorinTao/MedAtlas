import { lexmountExtract } from "./reading";
import { githubRepositories } from "./repo-links";
import type { Paper } from "./types";

export type RepoDiscovery = { status: "found" | "none" | "ambiguous"; repoUrl?: string; sourceUrl: string; checkedAt: string; candidates: string[] };

export async function discoverPaperRepository(paper: Paper): Promise<RepoDiscovery> {
  const abstractLinks = githubRepositories(paper.abstract);
  const target = paper.oaUrl && /^https:\/\/(?:www\.)?arxiv\.org\//i.test(paper.oaUrl) ? paper.oaUrl : paper.url || paper.oaUrl;
  if (!target) throw new Error("论文没有公开页面链接");
  const page = await lexmountExtract(target);
  const pageLinks = githubRepositories(`${page.text}\n${page.description}`);
  // A link in the paper abstract is stronger evidence than an unrelated link in page chrome.
  const candidates = abstractLinks.length ? abstractLinks : pageLinks;
  const known = paper.repoUrl.replace(/\/$/, "").toLowerCase();
  const matched = known ? candidates.find(url => url.toLowerCase() === known) : undefined;
  const repoUrl = matched || (candidates.length === 1 ? candidates[0] : undefined);
  return { status: repoUrl ? "found" : candidates.length ? "ambiguous" : "none", ...(repoUrl ? { repoUrl } : {}), sourceUrl: page.finalUrl, checkedAt: new Date().toISOString(), candidates: candidates.slice(0, 8) };
}
