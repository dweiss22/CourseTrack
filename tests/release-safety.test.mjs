import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertTarget,
  assertTargetConfiguration,
  projectRefFromDatabaseUrl,
  projectRefFromSupabaseUrl,
  verifySourceManifest,
} from "../scripts/release-target.mjs";
import { pendingMigrationVersions, validateCandidateMigrations } from "../scripts/plan-migrations.mjs";
import { newestCompletedBackup } from "../scripts/verify-supabase-backup.mjs";
import { auditCourseData } from "../scripts/audit-course-data.mjs";

const refs = {
  COURSETRACK_STAGING_SUPABASE_REF: "stagingref123",
  COURSETRACK_PRODUCTION_SUPABASE_REF: "productionref123",
};

test("release targets and project references fail closed", () => {
  assert.equal(assertTarget("staging"), "staging");
  assert.throws(() => assertTarget(""), /target is required/i);
  assert.equal(projectRefFromSupabaseUrl("https://stagingref123.supabase.co"), "stagingref123");
  assert.equal(projectRefFromDatabaseUrl("postgresql://postgres:secret@db.stagingref123.supabase.co/postgres"), "stagingref123");
  assert.equal(projectRefFromDatabaseUrl("postgresql://postgres.stagingref123:secret@pooler.supabase.com/postgres"), "stagingref123");
  assert.deepEqual(assertTargetConfiguration({ target: "staging", supabaseUrl: "https://stagingref123.supabase.co", databaseUrl: "postgresql://postgres:secret@db.stagingref123.supabase.co/postgres", environment: refs }), { target: "staging", projectRef: "stagingref123" });
  assert.throws(() => assertTargetConfiguration({ target: "production", supabaseUrl: "https://stagingref123.supabase.co", databaseUrl: "postgresql://postgres:secret@db.stagingref123.supabase.co/postgres", environment: refs }), /other CourseTrack environment/);
});

test("source manifests reject missing hashes, size drift, and content drift", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "coursetrack-source-manifest-"));
  try {
    const source = path.join(root, "source");
    await mkdir(source);
    const files = [];
    for (let index = 0; index < 6; index += 1) {
      const name = `source-${index}.xlsx`;
      const content = Buffer.from(`fixture-${index}`);
      await writeFile(path.join(source, name), content);
      const { createHash } = await import("node:crypto");
      files.push({ name, bytes: content.length, sha256: createHash("sha256").update(content).digest("hex") });
    }
    const manifestPath = path.join(root, "manifest.json");
    await writeFile(manifestPath, JSON.stringify({ version: 1, files }));
    assert.equal((await verifySourceManifest(source, manifestPath)).files.length, 6);
    await writeFile(manifestPath, JSON.stringify({ version: 1, files: files.map((item, index) => index === 0 ? { ...item, sha256: null } : item) }));
    await assert.rejects(() => verifySourceManifest(source, manifestPath), /SHA-256 is missing/);
    await writeFile(manifestPath, JSON.stringify({ version: 1, files }));
    await writeFile(path.join(source, files[1].name), "changed");
    await assert.rejects(() => verifySourceManifest(source, manifestPath), /size does not match|checksum does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate migration validation is append-only and checksum-bound", async () => {
  const root = process.cwd();
  const validated = await validateCandidateMigrations({ baseDirectory: root, candidateDirectory: root });
  assert.ok(validated.migrations.length > 0);
  const ledger = [validated.productionBaseline.version, ...validated.migrations.filter((entry) => entry.version > validated.productionBaseline.coversThrough).map((entry) => entry.version)];
  assert.deepEqual(pendingMigrationVersions(validated, ledger, "production"), []);
  assert.ok(pendingMigrationVersions(validated, [validated.productionBaseline.version], "production").length > 0);
});

test("candidate migration validation permits only checkout line-ending changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "coursetrack-migration-eol-"));
  try {
    const base = path.join(root, "base");
    const candidate = path.join(root, "candidate");
    const migrationPath = "supabase/migrations";
    await mkdir(path.join(base, migrationPath), { recursive: true });
    await mkdir(path.join(candidate, migrationPath), { recursive: true });
    const file = "202608110001_line_endings.sql";
    const lfSql = "select 1;\nselect 2;\n";
    const crlfSql = lfSql.replace(/\n/g, "\r\n");
    const { createHash } = await import("node:crypto");
    const manifest = {
      version: 1,
      productionBaseline: { version: "202608100000", coversThrough: "202608100000" },
      migrations: [{ version: "202608110001", file, sha256: createHash("sha256").update(crlfSql).digest("hex") }],
    };
    for (const directory of [base, candidate]) {
      await writeFile(path.join(directory, migrationPath, "manifest.json"), JSON.stringify(manifest));
      await writeFile(path.join(directory, migrationPath, file), lfSql);
    }
    assert.equal((await validateCandidateMigrations({ baseDirectory: base, candidateDirectory: candidate })).migrations.length, 1);
    await writeFile(path.join(candidate, migrationPath, file), "select 1;\nselect 3;\n");
    await assert.rejects(
      () => validateCandidateMigrations({ baseDirectory: base, candidateDirectory: candidate }),
      /Checksum mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("backup selection uses only valid completed timestamps", () => {
  const latest = newestCompletedBackup({ backups: [
    { status: "FAILED", inserted_at: "2026-08-10T12:00:00Z" },
    { status: "COMPLETED", inserted_at: "2026-08-10T10:00:00Z" },
    { status: "COMPLETED", inserted_at: "2026-08-10T11:00:00Z" },
  ] });
  assert.equal(latest?.toISOString(), "2026-08-10T11:00:00.000Z");
});

test("trusted migration workflow never executes candidate code or SQL directly", async () => {
  const workflow = await readFile(".github/workflows/migration-plan.yml", "utf8");
  assert.match(workflow, /pull_request_target/);
  assert.match(workflow, /persist-credentials: false/g);
  assert.match(workflow, /node scripts\/plan-migrations\.mjs/);
  assert.doesNotMatch(workflow, /environment:|COURSETRACK_SCHEMA_DATABASE_URL|secrets\./);
  assert.doesNotMatch(workflow, /working-directory: _candidate[\s\S]*npm|psql|migration up/);
});

test("staging release can bootstrap from the existing migration-capable staging credential", async () => {
  const workflow = await readFile(".github/workflows/staging-release.yml", "utf8");
  assert.match(workflow, /push:\s+branches: \[staging\]/);
  assert.match(workflow, /checks: read/);
  assert.match(workflow, /commits\/\$\{RELEASE_SHA\}\/check-runs/);
  assert.match(workflow, /select\(\.name == "Validate application" and \.app\.slug == "github-actions"\)/);
  assert.doesNotMatch(workflow, /actions\/workflows\/ci\.yml\/runs\?head_sha=/);
  assert.match(
    workflow,
    /COURSETRACK_MIGRATION_DATABASE_URL: \$\{\{ secrets\.COURSETRACK_MIGRATION_DATABASE_URL \|\| secrets\.STAGING_DATABASE_URL \}\}/,
  );
  assert.match(workflow, /deployments\?sha=\$\{RELEASE_SHA\}&environment=Preview/);
  assert.match(workflow, /select\(\.creator\.login == "vercel\[bot\]"\)/);
  assert.match(workflow, /steps\.vercel\.outputs\.url/);
  assert.doesNotMatch(workflow, /vercel@\d+\.\d+\.\d+ (pull|build|deploy)/);
  assert.doesNotMatch(workflow, /VERCEL_TOKEN|VERCEL_ORG_ID|VERCEL_PROJECT_ID/);
});

test("production migrations use the scoped Supabase token and a short-lived linked login", async () => {
  const workflow = await readFile(".github/workflows/production-preparation.yml", "utf8");
  assert.match(workflow, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/);
  assert.match(workflow, /productionBaseline\.version/);
  assert.match(workflow, /Trusted local marker for the reviewed Production baseline/);
  assert.match(workflow, /supabase@2\.110\.0 link --project-ref/);
  assert.match(workflow, /supabase@2\.110\.0 migration up --linked/);
  assert.doesNotMatch(workflow, /migration repair|--include-all/);
});

test("production promotion stays in the configured Vercel team scope", async () => {
  const workflow = await readFile(".github/workflows/production-release.yml", "utf8");
  assert.match(workflow, /VERCEL_TEAM_SLUG: \$\{\{ vars\.VERCEL_TEAM_SLUG \}\}/);
  assert.match(
    workflow,
    /vercel@58\.0\.0 promote .* --scope="\$VERCEL_TEAM_SLUG" --token="\$VERCEL_TOKEN"/,
  );
});

test("production readiness executes only protected code against candidate migration data", async () => {
  const workflow = await readFile(".github/workflows/production-preparation.yml", "utf8");
  const step = workflow.match(
    /- name: Verify Production contract from exact candidate[\s\S]*?(?=\n      - name:)/,
  )?.[0] ?? "";
  assert.match(step, /node scripts\/check-deployment-readiness\.mjs --candidate-dir=_candidate/);
  assert.doesNotMatch(step, /working-directory: _candidate|npm run/);
});

test("course-data audit output is limited to safe counts, refs, versions, and optional IDs", async () => {
  const client = {
    async query(sql) {
      if (/^begin|^set local|^commit|^rollback/i.test(sql)) return { rows: [] };
      if (/information_schema\.columns/i.test(sql)) return { rows: ["backend_link", "field_provenance", "frontend_link", "projection_origin"].map((column_name) => ({ column_name })) };
      if (/supabase_migrations\.schema_migrations/i.test(sql)) return { rows: [{ version: "202608100001" }] };
      if (/group by projection_origin/i.test(sql)) return { rows: [{ projection_origin: "lms_export", count: 16578 }, { projection_origin: "master_import", count: 1952 }] };
      if (/select c\.app_id/i.test(sql)) return { rows: [] };
      return { rows: [{ courses: 18530, current_lms_snapshots: 18406, current_metadata_records: 1952, imported_backend_links: 1341, backend_links: 1341, imported_frontend_links: 1341, frontend_links: 1341, eligible_link_fields: 0, normalized_disagreements: 0, accreditation_sources: 19571, accreditation_topic_numbers: 513 }] };
    },
  };
  const output = await auditCourseData({ target: "production", client, loadEnvironment: false, supabaseUrl: "https://productionref123.supabase.co", environment: { ...refs, COURSETRACK_SCHEMA_DATABASE_URL: "postgresql://schema_check:secret@db.productionref123.supabase.co/postgres" }, includeIds: true, requireFullParity: true, acceptedCounts: { courses: 18530, currentLmsSnapshots: 18406, currentMetadataRecords: 1952, lmsExportProjections: 16578, masterImportProjections: 1952, backendLinks: 1341, frontendLinks: 1341, accreditationSourcesMinimum: 19571, accreditationTopicNumbersMinimum: 513 } });
  assert.equal(output.accepted, true);
  const serialized = JSON.stringify(output);
  assert.doesNotMatch(serialized, /postgresql:|https?:\/\/|secret|title|payload/i);
});
