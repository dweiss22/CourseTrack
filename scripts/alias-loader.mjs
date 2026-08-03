import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = pathToFileURL(path.resolve(import.meta.dirname, "..") + "/");
const extensions = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }
  const base = new URL(specifier.slice(2), projectRoot).href;
  for (const extension of extensions) {
    try {
      return await nextResolve(base + extension, context);
    } catch {
      // Try the next candidate extension.
    }
  }
  throw new Error(`Could not resolve alias import "${specifier}"`);
}

// The bundler (Vite/Next) allows JSON imports without an explicit `type:
// "json"` import attribute; plain Node ESM requires one. Load JSON files
// directly here instead of editing the app's source imports to add it.
export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    return { format: "json", source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
