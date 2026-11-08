export function allowedRequest(request, port) {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  if (!hosts.has(request.headers.host)) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return hosts.has(parsed.host) && parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function workerHeaders(incoming, user) {
  const result = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    if (/^(oai-|x-forwarded-|x-real-ip$|connection$|transfer-encoding$|content-length$|host$)/i.test(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => result.append(key, item));
    else if (value !== undefined) result.set(key, value);
  }
  result.set("oai-authenticated-user-id", user.userId);
  result.set("oai-authenticated-user-email", user.email);
  result.set("oai-authenticated-user-full-name", encodeURIComponent(user.name || "torin"));
  result.set("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");
  return result;
}
