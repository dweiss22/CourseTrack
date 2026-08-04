import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("the additive operations migration preserves records and provides actor-aware locked workflows", async () => {
  const migration = await source("supabase/migrations/202608040007_course_operations.sql");
  for (const table of ["user_preferences", "report_definitions", "wrike_contacts", "wrike_folder_index"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  }
  for (const rpc of ["save_task_callout", "restore_task_callout", "save_report_definition", "set_report_archived", "save_version_wrike_link", "verify_version_wrike_link", "unlink_version_wrike_link", "resolve_course_field_v2"]) {
    const start = migration.indexOf(`create or replace function public.${rpc}`);
    assert.ok(start >= 0, `${rpc} should exist`);
    const body = migration.slice(start, migration.indexOf("revoke all on function", start));
    assert.match(body, /p_actor_id/);
    assert.match(body, /assert_actor_permission/);
    assert.match(body, /for update/i);
    assert.match(body, /insert into public\.audit_logs/);
  }
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(courses|course_flags|lms_snapshots|import_records|audit_logs)/i);
  assert.doesNotMatch(migration, /where\s+is_sample/i);
});

test("course preferences use own-user RLS and a server-initialized GET/PUT boundary", async () => {
  const [migration, route, page] = await Promise.all([
    source("supabase/migrations/202608040007_course_operations.sql"),
    source("app/api/preferences/course-library/route.ts"),
    source("app/courses/page.tsx"),
  ]);
  assert.match(migration, /user_preferences_own[\s\S]*user_id = auth\.uid\(\)/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PUT/);
  assert.match(route, /z\.object\([\s\S]*visibleColumns[\s\S]*\.strict\(\)/);
  assert.match(page, /getCourseLibraryPreferences/);
});

test("health is canonical across repositories and reports", async () => {
  const [health, courseRepository, reportEngine] = await Promise.all([
    source("lib/health.ts"), source("db/course-repository.ts"), source("lib/report-engine.ts"),
  ]);
  assert.match(health, /unresolvedConflictPenalty:\s*7/);
  assert.match(health, /importValidationErrorPenalty:\s*15/);
  assert.match(health, /missingLmsSnapshotPenalty:\s*10/);
  assert.match(health, /HEALTH_SCORING\.minimumScore/);
  assert.match(courseRepository, /calculateCourseHealth/);
  assert.match(reportEngine, /course\.healthScore/);
});

test("all eight report APIs and immutable templates share the allowlisted report engine", async () => {
  const [engine, repository] = await Promise.all([source("lib/report-engine.ts"), source("db/report-repository.ts")]);
  for (const name of ["Course inventory", "Course health", "Accreditation risk and expiration", "Courses due for review", "Versions and publication activity", "Open tasks and callouts", "Revamp planning", "Source discrepancies"]) assert.match(engine, new RegExp(name));
  assert.match(engine, /REPORT_TEMPLATES/);
  assert.match(engine, /validateReportDefinition/);
  assert.match(engine, /spreadsheet|^[\s\S]*\^\[=\+\\-@\]/i);
  assert.match(repository, /prebuiltDefinition/);
  for (const path of [
    "app/api/reports/route.ts", "app/api/reports/[id]/route.ts", "app/api/reports/[id]/duplicate/route.ts",
    "app/api/reports/[id]/restore/route.ts", "app/api/reports/[id]/results/route.ts", "app/api/reports/[id]/export/route.ts",
  ]) await access(new URL(path, root));
});

test("Wrike discovery stays local and provider access remains GET-only", async () => {
  const [repository, client, searchRoute] = await Promise.all([
    source("db/wrike-repository.ts"), source("lib/wrike-http-client.ts"), source("app/api/course-versions/[id]/wrike/search/route.ts"),
  ]);
  assert.match(repository, /search_wrike_task_candidates/);
  assert.match(repository, /save_version_wrike_link/);
  assert.doesNotMatch(searchRoute, /callWrikeApi|fetch\s*\(.*wrike/i);
  assert.match(client, /method:\s*"GET"/);
  assert.doesNotMatch(repository, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
});

test("Administration shows real three-source Integration Mapping and bootstrap is a health check", async () => {
  const [admin, bootstrap] = await Promise.all([source("components/portfolio-workspaces.tsx"), source("app/api/bootstrap/route.ts")]);
  for (const label of ["Integration Mapping", "Uploaded data mapping", "Wrike task mapping", "Future LMS API mapping"]) assert.match(admin, new RegExp(label));
  assert.match(admin, /WrikeConnectionPanel/);
  assert.match(bootstrap, /requireApiUser/);
  assert.match(bootstrap, /dataPresent/);
  assert.doesNotMatch(bootstrap, /seeded|seed script/i);
});

test("retired generated/mock runtime modules and placeholder task route are absent", async () => {
  const removed = [
    "lib/imported-sample-data.ts", "lib/sample-course-index.ts", "lib/sample-data.ts", "lib/sample-wrike-data.ts",
    "providers/lms/mock-provider.ts", "providers/wrike/mock-provider.ts", "scripts/seed-supabase.mjs", "app/api/wrike/tasks/route.ts",
  ];
  for (const path of removed) await assert.rejects(access(new URL(path, root)), { code: "ENOENT" });
});
