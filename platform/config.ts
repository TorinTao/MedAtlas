import { env } from "cloudflare:workers";
export function runtime(name: keyof Cloudflare.Env): string {
  return String(
    (env as unknown as Record<string, unknown>)[name] ||
      process.env[name] ||
      "",
  );
}
