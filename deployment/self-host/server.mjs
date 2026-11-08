import http from "node:http";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createRuntime, loadConfig } from "./runtime.mjs";
import { allowedRequest, publicRouteError, workerHeaders } from "./gateway.mjs";

const config = await loadConfig();
const publicDemo = config.mode === "public-demo";
const runtime = await createRuntime(config);
const server = http.createServer(async (request, response) => {
  const fail = (status, message) => {
    if (!response.headersSent) response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    response.end(message);
  };
  try {
    if (!allowedRequest(request, config.port, publicDemo ? config.publicOrigin : undefined)) return fail(403, "请求来源不被允许。");
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (publicDemo) {
      const denied = publicRouteError(url.pathname, request.method);
      if (denied) {
        response.writeHead(denied.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        return response.end(JSON.stringify({ error: denied.error }));
      }
    }
    if (["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"].includes(url.pathname)) {
      response.writeHead(303, { Location: "/", "Cache-Control": "no-store" });
      return response.end();
    }
    if (url.pathname === "/api/admin/migration") return fail(404, "Not found");
    if (url.pathname === "/healthz") {
      const db = await runtime.getD1Database("DB");
      await db.prepare("SELECT 1").first();
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return response.end(JSON.stringify({ ok: true, mode: config.mode, aiConfigured: Boolean(config.env?.DEEPSEEK_API_KEY), lexmountConfigured: Boolean(config.env?.LEXMOUNT_API_KEY && config.env?.LEXMOUNT_PROJECT_ID) }));
    }
    let size = 0;
    const limit = 32 * 1024 * 1024;
    if (Number(request.headers["content-length"] || 0) > limit) return fail(413, "请求过大");
    const bounded = new Transform({ transform(chunk, _encoding, callback) {
      size += chunk.length;
      callback(size > limit ? new Error("Request body too large") : null, chunk);
    } });
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const forwardedHeaders = workerHeaders(request.headers, config.user);
    forwardedHeaders.set("cf-connecting-ip", request.socket.remoteAddress || "local");
    const result = await runtime.dispatchFetch(url.href, {
      method: request.method,
      headers: forwardedHeaders,
      ...(hasBody ? { body: Readable.toWeb(request.pipe(bounded)), duplex: "half" } : {}),
    });
    const headers = Object.fromEntries(result.headers);
    delete headers["transfer-encoding"];
    headers["x-content-type-options"] = "nosniff";
    headers["x-frame-options"] = "DENY";
    headers["referrer-policy"] = "same-origin";
    response.writeHead(result.status, headers);
    if (result.body) await pipeline(Readable.fromWeb(result.body), response);
    else response.end();
  } catch (error) {
    console.error("Request failed:", error.name);
    fail(502, "请求处理失败，请查看服务日志后重试。");
  }
});
server.requestTimeout = 600_000;
const host = publicDemo ? "0.0.0.0" : "127.0.0.1";
server.listen(config.port, host, () => console.log(`MedAtlas ready on ${host}:${config.port} (${config.mode})`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  server.close(async () => { await runtime.dispose(); process.exit(0); });
  setTimeout(() => process.exit(1), 15_000).unref();
});
