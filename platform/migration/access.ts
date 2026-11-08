import { createHash, timingSafeEqual } from "node:crypto";

/** A migration export is disabled by default and only usable before its deadline. */
export function canExportMigration(
  authorization: string | null,
  token: string | undefined,
  deadline: string | undefined,
  now = Date.now(),
): boolean {
  if (!token || token.length < 32 || !deadline || !authorization) return false;
  const expires = Date.parse(deadline);
  if (!Number.isFinite(expires) || now >= expires || authorization.length > 512) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${token}`));
}
