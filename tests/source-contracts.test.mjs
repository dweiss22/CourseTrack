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
  assert.doesNotMatch(
    source,
    /\b(create|update|delete|remove|publish|assign|enroll)Course/i,
  );
});

test("sample portfolio is deterministic and complete", async () => {
  const [sample, types] = await Promise.all([
    readFile(new URL("lib/sample-data.ts", root), "utf8"),
    readFile(new URL("types/course.ts", root), "utf8"),
  ]);

  assert.match(sample, /Array\.from\(\{ length: 64 \}/);
  assert.match(sample, /new Date\("2026-07-30T12:00:00\.000Z"\)/);
  assert.match(types, /"Law Enforcement"/);
  assert.match(types, /"Cross-Vertical"/);
});

test("production schema and social metadata assets exist", async () => {
  await Promise.all([
    access(
      new URL(
        "supabase/migrations/202607300001_phase1_foundation.sql",
        root,
      ),
    ),
    access(new URL("public/og.png", root)),
    access(new URL("docs/architecture.md", root)),
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
});
