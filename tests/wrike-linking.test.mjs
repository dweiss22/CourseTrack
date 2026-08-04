import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const { assertValidWrikeApiHost, isValidWrikeHost } = await import("../lib/wrike-env.ts");
const { normalizeForMatch, buildWrikeTaskSearchQuery } = await import("../lib/wrike-matching.ts");

test("isValidWrikeHost accepts wrike.com and subdomains only", () => {
  assert.ok(isValidWrikeHost("wrike.com"));
  assert.ok(isValidWrikeHost("www.wrike.com"));
  assert.ok(isValidWrikeHost("app-us2.wrike.com"));
  assert.equal(isValidWrikeHost("wrike.com.evil.example"), false);
  assert.equal(isValidWrikeHost("notwrike.com"), false);
  assert.equal(isValidWrikeHost("evil.example.com"), false);
});

test("assertValidWrikeApiHost rejects non-https and non-Wrike hosts", () => {
  assert.throws(() => assertValidWrikeApiHost("http://www.wrike.com"), /https/i);
  assert.throws(() => assertValidWrikeApiHost("https://evil.example.com"), /wrike\.com/i);
  assert.throws(() => assertValidWrikeApiHost("not a url"), /valid https url/i);
});

test("assertValidWrikeApiHost accepts a valid Wrike host and strips a trailing slash", () => {
  assert.equal(assertValidWrikeApiHost("https://www.wrike.com/"), "https://www.wrike.com");
});

test("normalizeForMatch collapses whitespace, case, and common punctuation", () => {
  assert.equal(normalizeForMatch("  EMS-101:  Airway  Management "), "ems 101 airway management");
});

test("buildWrikeTaskSearchQuery uses meaningful title tokens instead of a CourseTrack code", () => {
  assert.equal(buildWrikeTaskSearchQuery({ courseCode: "EMS1-102035773", title: "The Critical Incident Leadership Course" }), "critical incident leadership");
  assert.equal(buildWrikeTaskSearchQuery({ courseCode: "", title: "Airway Management" }), "airway management");
});

test("the migration enforces zero-or-one active Wrike link per version and per task, scoped to Live Wrike only", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/202608040001_wrike_task_sync.sql", root),
    "utf8",
  );
  assert.match(migration, /version_wrike_task_one_active_per_version_idx/);
  assert.match(migration, /version_wrike_task_one_active_per_task_idx/);
  assert.match(migration, /where unlinked_at is null and provider_name = 'Live Wrike'/i);
});

test("the migration drops the legacy full-pair uniqueness constraint so a task can be relinked after unlinking", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/202608040001_wrike_task_sync.sql", root),
    "utf8",
  );
  assert.match(migration, /drop constraint %I/);
  assert.match(migration, /course_version_id.*external_task_id/s);
});

test("the migration adds an email-keyed permission check for service-role-client routes", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/202608040001_wrike_task_sync.sql", root),
    "utf8",
  );
  assert.match(migration, /create or replace function public\.has_permission_for_email/);
  assert.match(migration, /grant execute on function public\.has_permission_for_email\(text, text\) to service_role/);
});

test("all Wrike API routes check the caller's actual permission, not a hardcoded demo role", async () => {
  // Originally checked for the now-retired lib/wrike-authz.ts bridge; the
  // real-auth system (lib/auth.ts, see tests/auth-guards.test.mjs) replaced
  // it with requireApi*() guards keyed off the signed-in user's real role.
  const routeFiles = [
    "app/api/wrike/connect/route.ts",
    "app/api/wrike/disconnect/route.ts",
    "app/api/wrike/health/route.ts",
    "app/api/wrike/sync/route.ts",
    "app/api/wrike/sync/status/route.ts",
    "app/api/course-versions/[id]/wrike/link/route.ts",
    "app/api/course-versions/[id]/wrike/search/route.ts",
    "app/api/course-versions/[id]/wrike/verify/route.ts",
  ];
  const sources = await Promise.all(routeFiles.map((file) => readFile(new URL(file, root), "utf8")));
  for (const [index, source] of sources.entries()) {
    assert.match(source, /requireApi\w+/, `${routeFiles[index]} should use a lib/auth.ts requireApi* guard`);
    assert.doesNotMatch(
      source,
      /hasPermission\(demoUser\.role|getChatGPTUser/,
      `${routeFiles[index]} should not gate on the retired fake-auth path`,
    );
  }
});

test("unlinking a Wrike task never calls the Wrike HTTP client", async () => {
  const source = await readFile(new URL("db/wrike-repository.ts", root), "utf8");
  const start = source.indexOf("export async function unlinkCourseVersionWrikeTask");
  assert.ok(start >= 0, "unlinkCourseVersionWrikeTask should exist");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /callWrikeApi|fetchAllWrikePages/);
});

test("linking a Wrike task verifies it server-side before persisting", async () => {
  const source = await readFile(new URL("db/wrike-repository.ts", root), "utf8");
  const start = source.indexOf("export async function linkCourseVersionWrikeTask");
  const persistIndex = source.indexOf('client.rpc("save_version_wrike_link"', start);
  const callIndex = source.indexOf("callWrikeApi", start);
  assert.ok(callIndex >= 0 && persistIndex >= 0 && callIndex < persistIndex, "the Wrike task must be verified before the atomic persistence RPC");
});

test("relinking atomically retires and replaces the active reference with audit and concurrency checks", async () => {
  const migration = await readFile(new URL("supabase/migrations/202608040007_course_operations.sql", root), "utf8");
  const start = migration.indexOf("create or replace function public.save_version_wrike_link");
  const end = migration.indexOf("revoke all on function public.save_version_wrike_link", start);
  const body = migration.slice(start, end);
  const retireIndex = body.indexOf("update public.version_wrike_task_references set unlinked_at");
  const insertIndex = body.indexOf("insert into public.version_wrike_task_references");
  assert.ok(retireIndex >= 0 && retireIndex < insertIndex, "must retire the prior active reference before replacing it");
  assert.match(body, /for update/i);
  assert.match(body, /p_expected_updated_at/);
  assert.match(body, /insert into public\.audit_logs/);
});
