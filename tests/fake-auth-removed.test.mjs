import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);

const SCAN_DIRS = ["app", "components", "lib", "db"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

async function collectSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

test("app/chatgpt-auth.ts no longer exists", async () => {
  await assert.rejects(() => access(new URL("app/chatgpt-auth.ts", root)));
});

test("lib/permissions.ts no longer exists", async () => {
  await assert.rejects(() => access(new URL("lib/permissions.ts", root)));
});

test("lib/wrike-authz.ts (the bridge that used the fake demo role) no longer exists", async () => {
  await assert.rejects(() => access(new URL("lib/wrike-authz.ts", root)));
});

test("no source file references the retired fake-auth path", async () => {
  const dirs = SCAN_DIRS.map((dir) => path.join(rootPath, dir));
  const files = (await Promise.all(dirs.map((dir) => collectSourceFiles(dir)))).flat();
  assert.ok(files.length > 50, "sanity check: expected to scan a substantial number of source files");

  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/chatgpt-auth|lib\/permissions"|lib\/wrike-authz/.test(source)) {
      offenders.push(path.relative(rootPath, file));
    }
  }
  assert.deepEqual(offenders, []);
});
