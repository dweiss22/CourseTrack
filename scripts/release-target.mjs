import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export const RELEASE_TARGETS = Object.freeze(["staging", "production"]);

export function assertTarget(value) {
  const target = String(value ?? "").trim().toLowerCase();
  if (!RELEASE_TARGETS.includes(target)) {
    throw new Error("A target is required: --target=staging or --target=production.");
  }
  return target;
}

export function valueFor(argv, name, fallback) {
  const prefix = `${name}=`;
  const item = argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

export function projectRefFromSupabaseUrl(value) {
  if (!value) return null;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  } catch {
    return null;
  }
}

export function projectRefFromDatabaseUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const direct = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(parsed.hostname)?.[1];
    if (direct) return direct.toLowerCase();
    const pooled = /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(parsed.username))?.[1];
    return pooled?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function expectedProjectRef(target, environment = process.env) {
  const key = target === "production"
    ? "COURSETRACK_PRODUCTION_SUPABASE_REF"
    : "COURSETRACK_STAGING_SUPABASE_REF";
  const value = environment[key]?.trim().toLowerCase();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

export function assertTargetConfiguration({ target, supabaseUrl, databaseUrl, environment = process.env }) {
  const expected = expectedProjectRef(target, environment);
  const other = expectedProjectRef(target === "production" ? "staging" : "production", environment);
  const references = [
    ["Supabase URL", projectRefFromSupabaseUrl(supabaseUrl)],
    ["database URL", projectRefFromDatabaseUrl(databaseUrl)],
  ].filter(([, value]) => value);
  if (references.length === 0) throw new Error("A verifiable Supabase URL or database URL is required.");
  for (const [label, actual] of references) {
    if (actual === other) throw new Error(`${label} points at the other CourseTrack environment.`);
    if (actual !== expected) throw new Error(`${label} does not match the configured ${target} Supabase project.`);
  }
  if (references.length === 2 && references[0][1] !== references[1][1]) {
    throw new Error("The Supabase and database URLs reference different projects.");
  }
  return { target, projectRef: expected };
}

export async function sha256File(fileName) {
  const content = await readFile(fileName);
  return createHash("sha256").update(content).digest("hex");
}

export async function verifySourceManifest(sourceDirectory, manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length !== 6) {
    throw new Error("The course-data source manifest is malformed.");
  }
  const actual = [];
  for (const entry of manifest.files) {
    if (!entry.name || path.basename(entry.name) !== entry.name || !entry.name.toLowerCase().endsWith(".xlsx")) {
      throw new Error("The source manifest contains an invalid workbook path.");
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) {
      throw new Error(`The reviewed SHA-256 is missing or invalid for ${entry.name}.`);
    }
    const fullPath = path.resolve(sourceDirectory, entry.name);
    const details = await stat(fullPath);
    if (!details.isFile() || details.size !== entry.bytes) {
      throw new Error(`Source file size does not match the reviewed manifest for ${entry.name}.`);
    }
    const digest = await sha256File(fullPath);
    if (digest !== entry.sha256) throw new Error(`Source checksum does not match the reviewed manifest for ${entry.name}.`);
    actual.push({ name: entry.name, bytes: details.size, sha256: digest });
  }
  return { ...manifest, files: actual };
}
