import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const { sampleWrikeTasks } = await import("../lib/sample-wrike-data.ts");

test("CourseTrack is the sole version authority and LMS version retrieval is absent", async () => {
  const [types, contract, mock, live, docs] = await Promise.all([
    readFile(new URL("types/course.ts", root), "utf8"),
    readFile(new URL("providers/lms/read-only-lms-provider.ts", root), "utf8"),
    readFile(new URL("providers/lms/mock-lms-provider.ts", root), "utf8"),
    readFile(new URL("providers/lms/live-lms-provider.ts", root), "utf8"),
    readFile(new URL("docs/lms-provider.md", root), "utf8"),
  ]);

  assert.match(types, /managedBy:\s*"CourseTrack"/);
  assert.match(types, /wrikeTaskReferences:\s*VersionWrikeTaskReference\[\]/);
  for (const source of [contract, mock, live]) {
    assert.doesNotMatch(source, /getCourseVersions|LmsCourseVersion/);
  }
  assert.match(docs, /does not infer version changes/i);
  assert.match(docs, /app-owned ledger/i);
});

test("mock Wrike fixtures are deterministic, clearly labeled, and contain no invented live links", () => {
  assert.equal(sampleWrikeTasks.length, 18);
  assert.equal(new Set(sampleWrikeTasks.map((task) => task.projectId)).size, 5);
  assert.ok(sampleWrikeTasks.every((task) => task.isSample));
  assert.ok(sampleWrikeTasks.every((task) => task.providerName === "Mock Wrike"));
  assert.ok(sampleWrikeTasks.every((task) => task.externalTaskId.startsWith("MOCK-WRIKE-TASK-")));
  assert.ok(sampleWrikeTasks.every((task) => task.permalink === null));
  assert.equal(new Set(sampleWrikeTasks.map((task) => task.externalTaskId)).size, 18);
});

test("Wrike provider is read-only and the live adapter remains unconfigured", async () => {
  const [contract, live, mock, route] = await Promise.all([
    readFile(new URL("providers/wrike/read-only-wrike-provider.ts", root), "utf8"),
    readFile(new URL("providers/wrike/live-wrike-provider.ts", root), "utf8"),
    readFile(new URL("providers/wrike/mock-wrike-provider.ts", root), "utf8"),
    readFile(new URL("app/api/wrike/tasks/route.ts", root), "utf8"),
  ]);

  assert.match(contract, /searchTasks/);
  assert.match(contract, /getTaskById/);
  assert.match(contract, /healthCheck/);
  for (const source of [contract, live, mock]) {
    assert.doesNotMatch(
      source,
      /\b(create|update|edit|delete|remove|complete|assign)Task\b/i,
    );
  }
  assert.match(live, /not configured/i);
  assert.doesNotMatch(live, /fetch\s*\(|https?:\/\//i);
  assert.match(route, /readOnly:\s*true/);
});

test("version-to-Wrike persistence is prepared with RLS but remains an unapplied migration", async () => {
  const migrationUrl = new URL(
    "supabase/migrations/202607310005_app_owned_versions_wrike.sql",
    root,
  );
  await access(migrationUrl);
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /CourseTrack-owned version ledger/i);
  assert.match(migration, /managed_by\s+text\s+not null\s+default 'CourseTrack'/i);
  assert.match(migration, /create table if not exists public\.version_wrike_task_references/i);
  assert.match(migration, /raw_payload jsonb/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /has_permission\('versions:manage'\)/i);
  assert.match(migration, /never write back to Wrike/i);
});
