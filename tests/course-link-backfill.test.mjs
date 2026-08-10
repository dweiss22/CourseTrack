import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202608100001_backfill_course_links.sql", import.meta.url),
  "utf8",
);

test("course link backfill uses only current importable metadata", () => {
  assert.match(migration, /record\.is_current/i);
  assert.match(migration, /record\.is_importable/i);
  assert.match(migration, /normalized_payload->>'backendLink'/);
  assert.match(migration, /normalized_payload->>'frontendLink'/);
});

test("course link backfill preserves populated values and CourseTrack overrides", () => {
  assert.match(migration, /nullif\(btrim\(course\.backend_link\), ''\) is null/i);
  assert.match(migration, /nullif\(btrim\(course\.frontend_link\), ''\) is null/i);
  assert.match(migration, /field_provenance->>'backendLink'.*<> 'coursetrack'/i);
  assert.match(migration, /field_provenance->>'frontendLink'.*<> 'coursetrack'/i);
});

test("course link backfill refreshes comparisons and verifies completion", () => {
  assert.match(migration, /refresh_all_course_comparisons\(\)/i);
  assert.match(migration, /Eligible course link backfill rows remain missing/i);
});
