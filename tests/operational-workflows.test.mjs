import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("the operational migration backfills provenance without deleting source history", async () => {
  const sql = await read("supabase/migrations/202608040006_operational_workflows.sql");
  assert.match(sql, /provenance.*uploaded.*lms_api.*coursetrack/is);
  assert.match(sql, /origin_provenance|field_provenance/);
  assert.match(sql, /archived_at|archived_by/);
  assert.match(sql, /coursetrack-import@system\.local/);
  assert.match(sql, /Mock Wrike/);
  assert.match(sql, /move_revamp_task/);
  assert.match(sql, /p_expected_updated_at/);
  assert.doesNotMatch(sql, /delete\s+from\s+(courses|course_versions|accreditation_records|notes|course_flags|revamp_proposals)/i);
});

test("the course health trigger casts PostgreSQL bigint counts to the score function contract", async () => {
  const sql = await read("supabase/migrations/202608040007_course_operations.sql");
  assert.match(
    sql,
    /select count\(\*\)::integer from public\.field_comparisons/,
  );
});

test("mutation routes authenticate before record lookup and use shared validation", async () => {
  const paths = [
    "app/api/courses/[id]/route.ts",
    "app/api/courses/[id]/resolution/route.ts",
    "app/api/revamp-tasks/[id]/move/route.ts",
    "app/api/accreditations/[id]/route.ts",
    "app/api/course-versions/[id]/route.ts",
    "app/api/notes/[id]/route.ts",
  ];
  for (const path of paths) {
    const source = await read(path);
    const authAt = source.indexOf("requireApi");
    const lookupAt = source.search(/getCourseRecord|editableRow|save[A-Z]|archiveWorkflowRecord|moveRevampTask/);
    assert.ok(authAt >= 0, `${path} authenticates requests`);
    assert.ok(lookupAt < 0 || authAt < lookupAt, `${path} authenticates before lookup or mutation`);
  }
});

test("Revamp UI has pointer, keyboard, menu, permission, and rollback contracts", async () => {
  const source = await read("components/portfolio-workspaces.tsx");
  assert.match(source, /draggable/);
  assert.match(source, /onDrop/);
  assert.match(source, /Move .* left|Move .* right/);
  assert.match(source, /to another stage/);
  assert.match(source, /Only an administrator can move work into Approved/);
  assert.match(source, /original board was restored/);
});

test("responsive version and course-header accessibility contracts are present", async () => {
  const [component, detail, css] = await Promise.all([
    read("components/portfolio-workspaces.tsx"),
    read("components/course-detail/course-detail.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(component, /aria-expanded=.*version-details/);
  assert.match(component, /version-card-list/);
  assert.match(detail, /aria-expanded/);
  assert.match(detail, /data-tooltip/);
  assert.match(detail, /aria-label=.*LMS refresh unavailable/);
  assert.match(css, /@media \(max-width: 699px\)[\s\S]*\.versions-table[\s\S]*display: none/);
});
