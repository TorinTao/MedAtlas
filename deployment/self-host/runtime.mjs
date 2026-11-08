import { readFile, mkdir, readdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { Miniflare, Log, LogLevel } from "miniflare";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export async function loadConfig() {
  const filename = process.env.MEDATLAS_CONFIG || join(homedir(), ".config/medatlas/config.json");
  const config = JSON.parse(await readFile(filename, "utf8"));
  if (config.mode !== "ssh-personal" || !config.user?.userId || !config.user?.email)
    throw new Error("Personal deployment configuration is incomplete");
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535)
    throw new Error("Invalid listen port");
  if (!config.statePath?.startsWith("/")) throw new Error("Use an absolute statePath");
  return config;
}

export async function createRuntime(config) {
  await mkdir(config.statePath, { recursive: true, mode: 0o700 });
  const build = JSON.parse(await readFile(join(root, "dist/server/wrangler.json"), "utf8"));
  const serverRoot = join(root, "dist/server");
  const moduleFiles = (await readdir(serverRoot, { recursive: true }))
    .filter((file) => /\.(?:m?js)$/.test(file) && file !== "index.js");
  const runtime = new Miniflare({
    name: "medatlas-self-host",
    host: "127.0.0.1",
    port: 0,
    cf: false,
    // Vinext loads route chunks dynamically. Register the complete built module
    // graph instead of asking Miniflare to infer variable import specifiers.
    modules: ["index.js", ...moduleFiles].map((file) => ({ type: "ESModule", path: join(serverRoot, file) })),
    modulesRoot: serverRoot,
    compatibilityDate: build.compatibility_date,
    compatibilityFlags: build.compatibility_flags,
    bindings: config.env || {},
    d1Databases: { DB: "medatlas" },
    d1Persist: join(config.statePath, "d1"),
    r2Buckets: { BUCKET: "medatlas" },
    r2Persist: join(config.statePath, "r2"),
    assets: {
      directory: join(root, "dist/client"),
      binding: "ASSETS",
      routerConfig: { has_user_worker: true },
    },
    log: new Log(LogLevel.WARN),
  });
  await runtime.ready;
  return runtime;
}
