import ts from "typescript";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
const roots = ["modules", "shared", "platform", "composition"];
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(path.join(dir, e.name))
      : /\.(ts|tsx|mts)$/.test(e.name)
        ? [path.join(dir, e.name)]
        : [],
  );
}
const graph = new Map(),
  errors = [];
for (const file of roots.flatMap(files)) {
  const ast = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const edges = [];
  function visit(node) {
    let spec;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      spec = node.moduleSpecifier.text;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      spec = node.arguments[0].text;
    if (spec) {
      const resolved = spec.startsWith(".")
        ? path.normalize(path.join(path.dirname(file), spec))
        : spec.startsWith("@/")
          ? spec.slice(2)
          : null;
      if (
        file.startsWith("modules/") &&
        ((resolved && /^(platform|composition|app|db)\//.test(resolved)) ||
          /^(cloudflare:|next\/headers|next\/navigation|drizzle-orm)/.test(
            spec,
          ))
      )
        errors.push(`${file} -> ${spec}: 业务模块不能直接依赖运行环境或装配层`);
      if (
        file.startsWith("shared/") &&
        resolved &&
        !resolved.startsWith("shared/")
      )
        errors.push(`${file} -> ${spec}: 共享契约不能反向依赖业务`);
      if (file.startsWith("platform/") && resolved?.startsWith("composition/"))
        errors.push(`${file} -> ${spec}: 适配器不能导入装配层`);
      if (resolved) {
        const found = [
          resolved,
          resolved + ".ts",
          resolved + ".tsx",
          resolved + ".mts",
          resolved.replace(/\.mjs$/, ".mts"),
          resolved + "/index.ts",
        ].find(existsSync);
        if (found && roots.some((r) => found.startsWith(r + "/")))
          edges.push(found);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  graph.set(file, edges);
}
const done = new Set(),
  active = new Set();
function cycle(file, trail = []) {
  if (active.has(file)) {
    errors.push(`循环依赖: ${[...trail, file].join(" -> ")}`);
    return;
  }
  if (done.has(file)) return;
  active.add(file);
  for (const edge of graph.get(file) || []) cycle(edge, [...trail, file]);
  active.delete(file);
  done.add(file);
}
for (const file of graph.keys()) cycle(file);
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log(
  `PASS architecture: ${graph.size} files; domain/provider boundaries and dependency cycles checked`,
);
