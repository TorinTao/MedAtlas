export function allowedRequest(request, port, publicOrigin) {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  if (publicOrigin) hosts.add(new URL(publicOrigin).host);
  if (!hosts.has(request.headers.host)) return false;
  // Visitors can follow a link from Yours; cross-site API calls remain blocked.
  const navigation = ["GET", "HEAD"].includes(request.method) &&
    request.headers["sec-fetch-mode"] === "navigate" &&
    !new URL(request.url || "/", "http://localhost").pathname.startsWith("/api/");
  if (request.headers["sec-fetch-site"] === "cross-site" && !navigation) return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.origin === `http://${request.headers.host}`;
  } catch {
    return false;
  }
}

export function publicRouteError(pathname, method) {
  let path;
  try { path = decodeURIComponent(pathname); } catch { return { status: 400, error: "无效路径" }; }
  // Reject ambiguous escaped paths before forwarding to the application router.
  if (/[\\%]/.test(path)) return { status: 400, error: "无效路径" };
  if (/^\/api\/admin(?:\/|$)/.test(path)) return { status: 404, error: "Not found" };
  if (/^\/api\/upload(?:\/|$)/.test(path)) return { status: 403, error: "公开演示不开放私人 PDF 上传与读取" };
  if (/^\/api\/settings(?:\/|$)/.test(path) && !["GET", "HEAD"].includes(method))
    return { status: 403, error: "公开演示使用站点配置，密钥只能在服务器上设置" };
  if (method === "DELETE") return { status: 403, error: "公开演示不允许删除已有数据" };
  return null;
}

export function workerHeaders(incoming, user) {
  const result = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    if (/^(oai-|cf-connecting-ip$|x-forwarded-|x-real-ip$|connection$|transfer-encoding$|content-length$|host$)/i.test(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => result.append(key, item));
    else if (value !== undefined) result.set(key, value);
  }
  result.set("oai-authenticated-user-id", user.userId);
  result.set("oai-authenticated-user-email", user.email);
  result.set("oai-authenticated-user-full-name", encodeURIComponent(user.name || "torin"));
  result.set("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");
  return result;
}
