const ignoredOwners = new Set(["features", "topics", "orgs", "settings", "login", "signup", "marketplace", "sponsors", "about", "explore"]);
export function githubRepositories(text: string): string[] {
    const links = [...text.matchAll(/https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:[^\s<>"']*)?/gi)];
    return [...new Set(links.flatMap(match => {
            const owner = match[1];
            const repo = match[2].replace(/\.git$/i, "").replace(/[.,;:!?)}\]]+$/, "");
            return ignoredOwners.has(owner.toLowerCase()) || !repo || repo === "." ? [] : [`https://github.com/${owner}/${repo}`];
        }))];
}
