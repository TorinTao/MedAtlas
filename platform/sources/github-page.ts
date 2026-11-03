export async function fetchGithubPublicDom(repoUrl: string): Promise<{
  html: string;
  finalUrl: string;
  source: "GitHub 公开页面";
}> {
  const url = new URL(repoUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username ||
    url.password
  )
    throw new Error("仅支持公开 GitHub 仓库");
  const response = await fetch(repoUrl, {
    headers: { Accept: "text/html", "User-Agent": "MedAtlas-Research/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GitHub 页面 HTTP ${response.status}`);
  const html = (await response.text()).slice(0, 750000);
  if (!html.includes("github.com") || !html.includes(url.pathname.slice(1)))
    throw new Error("GitHub 页面内容无法核验");
  return { html, finalUrl: response.url || repoUrl, source: "GitHub 公开页面" };
}
