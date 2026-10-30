function decodeHtml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39|nbsp);|&#(\d+);/g, match => {
    const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
    if (named[match]) return named[match];
    const code = Number(match.slice(2, -1));
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  });
}

export function githubDomEvidence(html: string, repoUrl: string): { files: { name: string; url: string }[]; readme: string } {
  const path = new URL(repoUrl).pathname.replace(/\/$/, "");
  const files = [...html.matchAll(/href="([^"]+)"/g)].flatMap(match => {
    const href = decodeHtml(match[1]);
    if (!href.startsWith(`${path}/blob/`) && !href.startsWith(`${path}/tree/`)) return [];
    const name = decodeURIComponent(href.split(/[?#]/)[0].split("/").pop() || "");
    return name ? [{ name: name.toLowerCase(), url: `https://github.com${href}` }] : [];
  });
  const unique = [...new Map(files.map(file => [file.url, file])).values()];
  const article = html.match(/<article\b[^>]*class="[^"]*markdown-body[^"]*"[^>]*>([\s\S]*?)<\/article>/i)?.[1] || "";
  const readme = decodeHtml(article.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim().slice(0, 16000);
  return { files: unique, readme };
}

export async function fetchGithubPublicDom(repoUrl: string): Promise<{ html: string; finalUrl: string; source: "GitHub 公开页面" }> {
  const url = new URL(repoUrl);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password) throw new Error("仅支持公开 GitHub 仓库");
  const response = await fetch(repoUrl, { headers: { Accept: "text/html", "User-Agent": "MedAtlas-Research/1.0" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`GitHub 页面 HTTP ${response.status}`);
  const html = (await response.text()).slice(0, 750000);
  if (!html.includes("github.com") || !html.includes(url.pathname.slice(1))) throw new Error("GitHub 页面内容无法核验");
  return { html, finalUrl: response.url || repoUrl, source: "GitHub 公开页面" };
}
