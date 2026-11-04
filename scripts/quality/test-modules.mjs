import { spawnSync } from "node:child_process";
const suites = {
  catalog: [
    "tests/modules/catalog.test.ts",
    "tests/modules/lex-first.test.ts",
    "tests/papers.test.ts",
  ],
  reading: ["tests/modules/reading.test.ts"],
  atlas: ["tests/modules/atlas.test.ts", "tests/research-scope-routes.test.mjs"],
  repositories: ["tests/modules/repositories.test.ts"],
  ideas: [
    "tests/modules/ideas.test.ts",
    "tests/idea-evidence.test.ts",
    "tests/idea-schema.test.ts",
    "tests/idea-selection.test.ts",
    "tests/idea-export.test.ts",
  ],
  workspace: [
    "tests/modules/workspace.test.ts",
    "tests/pdf-upload.test.ts",
    "tests/upload-routes.test.mjs",
    "tests/workspace-saving.test.mjs",
  ],
  automation: ["tests/modules/automation.test.ts"],
  platform: ["tests/modules/providers.test.ts"],
};
const selected = process.argv.slice(2);
const names = selected.length ? selected : Object.keys(suites);
for (const name of names) {
  if (!Object.hasOwn(suites, name)) {
    console.error(
      `Unknown module ${name}. Available: ${Object.keys(suites).join(", ")}`,
    );
    process.exit(1);
  }
  console.log(`\nMODULE ${name}`);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", ...suites[name]],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`\nPASS ${names.length} module suites`);
