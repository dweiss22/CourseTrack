import path from "node:path";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { assertTarget, assertTargetConfiguration, sha256File, valueFor } from "./release-target.mjs";

const MIGRATION_PATTERN = /^(\d{12})_([a-z0-9_]+)\.sql$/;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_MIGRATION_BYTES = 1024 * 1024;

async function loadJson(fileName, maxBytes) {
  const details = await lstat(fileName);
  if (!details.isFile() || details.isSymbolicLink() || details.size > maxBytes) {
    throw new Error(`${path.basename(fileName)} is not a permitted regular file.`);
  }
  return JSON.parse(await readFile(fileName, "utf8"));
}

function validateManifestShape(manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.migrations)) throw new Error("Migration manifest is malformed.");
  let previous = "";
  const names = new Set();
  for (const entry of manifest.migrations) {
    const match = MIGRATION_PATTERN.exec(entry.file ?? "");
    if (!match || match[1] !== entry.version || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) {
      throw new Error("Migration manifest contains an invalid entry.");
    }
    if (entry.version <= previous) throw new Error("Migration manifest versions must be unique and strictly increasing.");
    if (names.has(entry.file)) throw new Error("Migration manifest contains duplicate files.");
    names.add(entry.file);
    previous = entry.version;
  }
  return manifest;
}

export async function validateCandidateMigrations({ baseDirectory, candidateDirectory }) {
  const baseRoot = await realpath(path.resolve(baseDirectory));
  const candidateRoot = await realpath(path.resolve(candidateDirectory));
  const baseManifest = validateManifestShape(await loadJson(path.join(baseRoot, "supabase/migrations/manifest.json"), MAX_MANIFEST_BYTES));
  const candidateManifest = validateManifestShape(await loadJson(path.join(candidateRoot, "supabase/migrations/manifest.json"), MAX_MANIFEST_BYTES));
  if (candidateManifest.migrations.length < baseManifest.migrations.length) throw new Error("Candidate migrations cannot remove manifest entries.");
  for (let index = 0; index < baseManifest.migrations.length; index += 1) {
    if (JSON.stringify(candidateManifest.migrations[index]) !== JSON.stringify(baseManifest.migrations[index])) {
      throw new Error("Candidate migrations cannot modify reviewed migration history.");
    }
  }
  if (JSON.stringify(candidateManifest.productionBaseline) !== JSON.stringify(baseManifest.productionBaseline)) {
    throw new Error("Candidate migrations cannot modify the reviewed production baseline.");
  }
  const migrationDirectory = path.join(candidateRoot, "supabase/migrations");
  const directoryRealPath = await realpath(migrationDirectory);
  if (!directoryRealPath.startsWith(candidateRoot + path.sep)) throw new Error("Candidate migration directory escapes the checkout.");
  const entries = await readdir(migrationDirectory, { withFileTypes: true });
  const sqlFiles = entries.filter((entry) => entry.name.endsWith(".sql"));
  const unexpected = entries.filter((entry) => entry.name !== "manifest.json" && !entry.name.endsWith(".sql"));
  if (unexpected.length) throw new Error("Candidate migration directory contains unexpected files.");
  const manifestNames = new Set(candidateManifest.migrations.map((entry) => entry.file));
  if (sqlFiles.length !== manifestNames.size || sqlFiles.some((entry) => !manifestNames.has(entry.name))) {
    throw new Error("Candidate migration files do not exactly match the manifest.");
  }
  for (const entry of sqlFiles) {
    if (!entry.isFile() || entry.isSymbolicLink?.()) throw new Error("Candidate migrations must be regular files.");
    const fileName = path.join(migrationDirectory, entry.name);
    const details = await lstat(fileName);
    if (details.isSymbolicLink() || details.size > MAX_MIGRATION_BYTES) throw new Error(`${entry.name} is not a permitted migration file.`);
    const resolved = await realpath(fileName);
    if (!resolved.startsWith(directoryRealPath + path.sep)) throw new Error("Candidate migration path escapes the checkout.");
    const expected = candidateManifest.migrations.find((item) => item.file === entry.name);
    if (await sha256File(fileName) !== expected.sha256) throw new Error(`Checksum mismatch for ${entry.name}.`);
  }
  return candidateManifest;
}

export function pendingMigrationVersions(manifest, ledger, target) {
  const applied = new Set(ledger.map(String));
  const baseline = manifest.productionBaseline;
  return manifest.migrations
    .filter((entry) => !(target === "production" && applied.has(baseline.version) && entry.version <= baseline.coversThrough))
    .filter((entry) => !applied.has(entry.version))
    .map((entry) => entry.version);
}

export async function migrationPlan(options) {
  const target = assertTarget(options.target);
  const manifest = await validateCandidateMigrations(options);
  if (!options.databaseUrl) return { target, validated: true, pendingMigrations: [] };
  assertTargetConfiguration({ target, databaseUrl: options.databaseUrl, supabaseUrl: options.supabaseUrl, environment: options.environment || process.env });
  const client = options.client || new pg.Client({ connectionString: options.databaseUrl });
  if (!options.client) await client.connect();
  try {
    const { rows } = await client.query("select version from supabase_migrations.schema_migrations order by version");
    return {
      target,
      validated: true,
      appliedMigrationCount: rows.length,
      candidateMigrationCount: manifest.migrations.length,
      pendingMigrations: pendingMigrationVersions(manifest, rows.map((row) => row.version), target),
    };
  } finally {
    if (!options.client) await client.end();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const output = await migrationPlan({
    target: valueFor(argv, "--target"),
    baseDirectory: valueFor(argv, "--base-dir", "."),
    candidateDirectory: valueFor(argv, "--candidate-dir", "."),
    databaseUrl: process.env.COURSETRACK_SCHEMA_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safeMessage = /Candidate|Migration|manifest|checksum|path|file|directory/i.test(error.message)
      ? error.message
      : "Migration planning failed. Verify the target-specific read-only schema credential.";
    process.stderr.write(`${safeMessage}\n`);
    process.exitCode = 1;
  });
}
