import { createRequire } from "node:module";
import { readFile, stat, mkdir, cp, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// Package only the installed, locked runtime dependency graph on the build
// machine. The small server never runs npm ci or the frontend compiler.
if (process.platform !== "linux" || process.arch !== "x64") throw new Error("Build this runtime archive on Linux x64");
const root = process.cwd();
const output = resolve(process.argv[2] || "/tmp/medatlas-runtime-linux-x64.tar.gz");
const stage = await mkdtemp(join(tmpdir(), "medatlas-runtime-"));
const visited = new Map();
async function locate(name, parent) {
  const req = createRequire(join(parent, "package.json"));
  for (const directory of req.resolve.paths(name) || []) {
    const candidate = join(directory, name);
    try { if ((await stat(join(candidate, "package.json"))).isFile()) return candidate; } catch { /* next resolution path */ }
  }
  throw new Error(`Missing installed runtime dependency: ${name}`);
}
const supported = (values, actual) => !values || (!values.includes(`!${actual}`) && (values.every((x) => x.startsWith("!")) || values.includes(actual)));
async function visit(name, parent, optional = false) {
  let directory;
  try { directory = await locate(name, parent); } catch (error) { if (optional) return; throw error; }
  if (visited.has(directory)) return;
  const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  if (!supported(metadata.os, "linux") || !supported(metadata.cpu, "x64") || !supported(metadata.libc, "glibc")) {
    if (optional) return;
    throw new Error(`Unsupported runtime dependency: ${name}`);
  }
  const path = relative(root, directory);
  if (!path.startsWith("node_modules/")) throw new Error("Dependency resolved outside this checkout");
  visited.set(directory, { path, name: metadata.name, version: metadata.version });
  for (const child of Object.keys(metadata.dependencies || {})) await visit(child, directory, Boolean(metadata.optionalDependencies?.[child]));
  for (const child of Object.keys(metadata.optionalDependencies || {})) await visit(child, directory, true);
}
await visit("miniflare", root);
for (const [directory, info] of visited) {
  const destination = join(stage, info.path);
  await mkdir(resolve(destination, ".."), { recursive: true });
  await cp(directory, destination, { recursive: true, dereference: true });
}
await writeFile(join(stage, "runtime-manifest.json"), JSON.stringify({ platform: "linux-x64-glibc", createdAt: new Date().toISOString(), packages: [...visited.values()] }, null, 2));
const result = spawnSync("tar", ["-I", "gzip -1", "-cf", output, "-C", stage, "node_modules", "runtime-manifest.json"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status || 1);
console.log(JSON.stringify({ archive: output, packages: visited.size, compressedMiB: Math.round((await stat(output)).size / 1048576) }));
