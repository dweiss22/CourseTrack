import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("LMS provider contract is read-only", async () => {
  const source = await readFile(
    new URL("providers/lms/read-only-lms-provider.ts", root),
    "utf8",
  );

  assert.match(source, /interface ReadOnlyLmsProvider/);
  assert.match(source, /getCourses/);
  assert.match(source, /healthCheck/);
  assert.doesNotMatch(source, /getCourseVersions|LmsCourseVersion/);
  assert.doesNotMatch(
    source,
    /\b(create|update|delete|remove|publish|assign|enroll)Course/i,
  );
});

test("sample portfolio is generated from the supplied source workbooks", async () => {
  const [sample, importedSample, generatedSource, types] = await Promise.all([
    readFile(new URL("lib/sample-data.ts", root), "utf8"),
    readFile(new URL("lib/imported-sample-data.ts", root), "utf8"),
    readFile(new URL("lib/generated/mock-source-data.json", root), "utf8"),
    readFile(new URL("types/course.ts", root), "utf8"),
  ]);

  const source = JSON.parse(generatedSource);
  assert.match(sample, /imported-sample-data/);
  assert.match(importedSample, /sourceJson/);
  assert.equal(source.stats.metadataRows, 1952);
  assert.equal(source.stats.matchedCourses, 1828);
  assert.equal(source.stats.metadataOnlyCourses, 124);
  assert.equal(source.stats.topicColumns, 99);
  assert.equal(source.stats.matchedTopicAssignments, 1461);
  for (const vertical of [
    "P1A",
    "FR1A",
    "C1A",
    "EMS1",
    "D1A",
    "LGU",
    "Lexipol",
    "Wellness",
  ]) {
    assert.match(types, new RegExp(`"${vertical}"`));
  }
  assert.match(types, /Police1 Academy/);
  assert.match(types, /Course content for the Wellness app/);
});

test("Supabase runtime, migrations, and Vercel build contract exist", async () => {
  await Promise.all([
    access(
      new URL(
        "supabase/migrations/202607300001_phase1_foundation.sql",
        root,
      ),
    ),
    access(
      new URL(
        "supabase/migrations/202607300002_supabase_runtime_adapter.sql",
        root,
      ),
    ),
    access(
      new URL(
        "supabase/migrations/202607310003_lexipol_verticals.sql",
        root,
      ),
    ),
    access(
      new URL(
        "supabase/migrations/202607310004_source_reconciliation.sql",
        root,
      ),
    ),
    access(new URL("lib/supabase-server.ts", root)),
    access(new URL("vercel.json", root)),
    access(new URL("public/og.png", root)),
    access(new URL("docs/architecture.md", root)),
    access(new URL("docs/wrike-provider.md", root)),
  ]);

  const migration = await readFile(
    new URL(
      "supabase/migrations/202607300001_phase1_foundation.sql",
      root,
    ),
    "utf8",
  );
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /create table public\.lms_snapshots/i);
  assert.match(migration, /create or replace function public\.has_permission/i);

  const [adapter, runtimeMigration, vercelConfiguration] = await Promise.all([
    readFile(new URL("lib/supabase-server.ts", root), "utf8"),
    readFile(
      new URL(
        "supabase/migrations/202607300002_supabase_runtime_adapter.sql",
        root,
      ),
      "utf8",
    ),
    readFile(new URL("vercel.json", root), "utf8"),
  ]);
  assert.match(adapter, /createClient/);
  assert.match(adapter, /SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(adapter, /NEXT_PUBLIC_SUPABASE_(ANON|SECRET|SERVICE)/);
  assert.match(
    runtimeMigration,
    /function public\.update_internal_course_metadata/i,
  );
  assert.match(vercelConfiguration, /npm run build:vercel/);

  const sourceMigration = await readFile(
    new URL(
      "supabase/migrations/202607310004_source_reconciliation.sql",
      root,
    ),
    "utf8",
  );
  for (const structure of [
    "content_metadata_import_runs",
    "content_metadata_records",
    "field_comparisons",
    "monitoring_classifications",
    "topics",
    "course_topics",
    "course_relationships",
    "import_validation_errors",
  ]) {
    assert.match(sourceMigration, new RegExp(`create table if not exists public\\.${structure}`));
  }
  assert.match(sourceMigration, /raw_payload jsonb/i);
  assert.match(sourceMigration, /enable row level security/i);
  assert.match(sourceMigration, /grant execute on function public\.resolve_course_field[\s\S]*to service_role/i);
});

test("source reconciliation and resolution endpoints preserve LMS read-only boundaries", async () => {
  const [normalization, resolutionRoute, provider] = await Promise.all([
    readFile(new URL("lib/source-normalization.ts", root), "utf8"),
    readFile(new URL("app/api/courses/[id]/resolution/route.ts", root), "utf8"),
    readFile(new URL("providers/lms/mock-lms-provider.ts", root), "utf8"),
  ]);

  assert.match(normalization, /reconcileCourseSources/);
  assert.match(normalization, /applyFieldResolution/);
  assert.match(resolutionRoute, /readOnlyLms:\s*true/);
  assert.match(resolutionRoute, /persistFieldResolution/);
  assert.doesNotMatch(provider, /\b(create|update|delete|remove|publish|assign|enroll)Course/i);
});

test("Cloudflare D1 is no longer part of the runtime adapter", async () => {
  const [database, hosting, packageJson] = await Promise.all([
    readFile(new URL("db/index.ts", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);

  assert.match(database, /getSupabaseAdminClient/);
  assert.doesNotMatch(database, /cloudflare:workers|D1Database|drizzle/i);
  assert.match(hosting, /"d1": null/);
  assert.doesNotMatch(packageJson, /drizzle/);
});
