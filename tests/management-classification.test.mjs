import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("management normalization uses only importable metadata and CourseTrack provenance", async () => {
  const migration = await source("supabase/migrations/202608110001_management_classification_authority.sql");
  assert.match(migration, /metadata\.is_current = true[\s\S]*metadata\.is_importable = true/);
  assert.match(migration, /previous_provenance->>'managementClassification' = 'coursetrack'/);
  assert.match(migration, /previous_classification = 'Lexipol managed'/);
  assert.match(migration, /else 'Unclassified'/);
  assert.match(migration, /management_classification in \('Lexipol managed', 'Unclassified'\)/);
  assert.match(migration, /classification in \('Lexipol managed', 'Unclassified'\)/);
  assert.doesNotMatch(migration, /is_lexipol|mapped_verticals/i);
});

test("metadata changes and app saves keep classification authority synchronized", async () => {
  const migration = await source("supabase/migrations/202608110001_management_classification_authority.sql");
  assert.match(migration, /refresh_course_management_classification/);
  assert.match(migration, /sync_course_management_from_metadata/);
  assert.match(migration, /enforce_course_management_classification/);
  assert.match(migration, /before insert or update of management_classification, field_provenance/);
  assert.match(migration, /after insert or delete or update of course_id, is_current, is_importable/);
});

test("the Course Library SQL exposes the exact three filters with shared search and pagination", async () => {
  const migration = await source("supabase/migrations/202608110001_management_classification_authority.sql");
  const start = migration.indexOf("create or replace function public.search_course_library");
  const end = migration.indexOf("revoke all on function public.search_course_library", start);
  const search = migration.slice(start, end);
  assert.match(search, /p_classification text default 'All courses'/);
  assert.match(search, /p_classification = 'Lexipol Managed'[\s\S]*management_classification = 'Lexipol managed'/);
  assert.match(search, /p_classification = 'Unclassified'[\s\S]*management_classification = 'Unclassified'/);
  assert.match(search, /p_search[\s\S]*p_vertical[\s\S]*p_lifecycle[\s\S]*p_health[\s\S]*p_classification[\s\S]*p_work_queue/);
  assert.match(search, /count\(\*\) over\(\)/);
  assert.match(search, /limit least[\s\S]*offset greatest/);
});

test("site availability is retained without becoming course vertical membership", async () => {
  const [loader, importer] = await Promise.all([
    source("scripts/course-workbook-loader.mjs"),
    source("scripts/import-course-workbooks.mjs"),
  ]);
  assert.match(loader, /verticals: \[\]/);
  assert.match(importer, /const verticals = metadata\?\.verticals \?\? \[\]/);
  assert.doesNotMatch(importer, /managementClassification:[^\n]*(isLexipol|mappedVerticals|sites)/);
});
