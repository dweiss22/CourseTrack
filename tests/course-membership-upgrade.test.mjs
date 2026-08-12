import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { csvCell } from "../lib/csv.ts";
import { createCourseExportCsvStream } from "../lib/course-export-stream.ts";

const read = (path) => readFile(path, "utf8");

test("vertical membership rollout is additive, backfilled, and independent of primary/secondary semantics", async () => {
  const [migration, types, importer, repository] = await Promise.all([
    read("supabase/migrations/202608120003_course_membership_lms_link.sql"),
    read("types/course.ts"),
    read("scripts/import-course-workbooks.mjs"),
    read("db/course-repository.ts"),
  ]);
  assert.match(migration, /insert into public\.course_verticals[\s\S]*c\.primary_vertical_id[\s\S]*'applicable'/);
  assert.match(migration, /delete from public\.course_verticals[\s\S]*lower\(v\.slug\) = 'unclassified'/);
  assert.match(migration, /alter table public\.courses alter column primary_vertical_id drop not null/);
  assert.match(migration, /Deprecated rollout compatibility column/);
  assert.match(migration, /unnest\(coalesce\(p_verticals,'\{\}'::text\[\]\)\)/);
  assert.match(migration, /count\(distinct value\)/);
  assert.doesNotMatch(migration, /public\.create_course_projection\(/);
  assert.doesNotMatch(migration, /public\.update_course_projection_v2\(/);
  assert.doesNotMatch(types, /isPrimary/);
  assert.match(types, /verticals: Vertical\[\]/);
  assert.doesNotMatch(types, /primaryVertical: Vertical/);
  assert.doesNotMatch(types, /secondaryVerticals/);
  assert.match(importer, /relationship_type: "applicable"/);
  assert.doesNotMatch(importer, /relationship_type: "secondary"/);
  assert.doesNotMatch(repository, /course: CourseSummary & \{ primaryVertical/);
});

test("LMS linking is binary and derives only from a current snapshot", async () => {
  const [migration, types, library] = await Promise.all([
    read("supabase/migrations/202608120003_course_membership_lms_link.sql"),
    read("types/course.ts"),
    read("components/course-library/course-library.tsx"),
  ]);
  assert.match(types, /LmsLinkStatus = "linked" \| "not_linked"/);
  assert.match(migration, /exists\(select 1 from public\.lms_snapshots s where s\.course_id = c\.id and s\.is_current\) as has_lms/);
  assert.match(migration, /case when f\.has_lms then 'linked' else 'not_linked' end/);
  assert.doesNotMatch(library, /Missing from LMS/);
  assert.match(library, /LMS linked/);
  assert.match(library, /Not LMS linked/);
});

test("course mutation and accreditation deletion enforce field, permission, source, archive, concurrency, and audit contracts", async () => {
  const [migration, route, deleteRoute, validation] = await Promise.all([
    read("supabase/migrations/202608120003_course_membership_lms_link.sql"),
    read("app/api/courses/[id]/route.ts"),
    read("app/api/accreditations/[id]/permanent/route.ts"),
    read("lib/workflow-validation.ts"),
  ]);
  assert.match(migration, /p_field not in \(/);
  assert.match(migration, /for update/);
  assert.match(migration, /previous\.updated_at is distinct from p_expected_updated_at/);
  assert.match(migration, /'course\.field_updated'/);
  assert.match(route, /courseFieldMutationSchema/);
  assert.match(route, /getFreshCourseRecord/);
  assert.match(migration, /assert_actor_permission\(p_actor_id,p_actor_email,'accreditation:manage'\)/);
  assert.match(migration, /previous\.archived_at is null/);
  assert.match(migration, /previous\.source_domain <> 'coursetrack'/);
  assert.match(migration, /'accreditation\.deleted'/);
  assert.match(deleteRoute, /expectedUpdatedAt/);
  assert.match(validation, /courseFieldMutationSchema[\s\S]*\.transform\(/);
  assert.match(validation, /return \{ \.\.\.input, value: parsed\.data \}/);
});

test("course export streams every filtered 200-row page and includes normalized child data without raw payloads", async () => {
  const [route, repository] = await Promise.all([
    read("app/api/courses/export/route.ts"),
    read("db/course-export-repository.ts"),
  ]);
  assert.match(route, /createCourseExportCsvStream/);
  assert.match(route, /pageSize: 200/);
  assert.match(route, /search: params\.get\("search"\)/);
  assert.match(route, /const sort = params\.get\("sort"\)/);
  assert.match(repository, /EXPORT_PAGE_SIZE = 1000/);
  assert.match(repository, /course_verticals/);
  assert.match(repository, /version_wrike_task_references/);
  assert.match(repository, /accreditation_records/);
  assert.match(repository, /field_comparisons/);
  assert.match(repository, /course_flags/);
  assert.match(repository, /course_relationships/);
  assert.doesNotMatch(repository, /raw_payload|source_payload/);
  assert.match(repository, /"LMS link status"/);
  assert.match(repository, /"Version Wrike links"/);
  assert.equal(csvCell("=HYPERLINK(\"bad\")"), "\"'=HYPERLINK(\"\"bad\"\")\"");
  assert.equal(csvCell("\n=HYPERLINK(\"bad\")"), "\"'\n=HYPERLINK(\"\"bad\"\")\"");
  assert.equal(csvCell("normal, value"), "\"normal, value\"");
});

test("course export includes all records beyond the first 200-row page in stable order", async () => {
  const ids = Array.from({ length: 405 }, (_, index) => `course-${String(index + 1).padStart(3, "0")}`);
  const requestedPages = [];
  const stream = createCourseExportCsvStream({ classification: "Lexipol Managed", sort: "title" }, {
    columns: ["Course ID"], csvCell,
    getPage: async ({ page, pageSize }) => {
      requestedPages.push(page);
      const start = (page - 1) * pageSize;
      return { items: ids.slice(start, start + pageSize).map((id) => ({ id })), total: ids.length };
    },
    getBatch: async (pageIds) => pageIds.map((id) => [id]),
    pageSize: 200,
  });
  const csv = await new Response(stream).text();
  assert.deepEqual(requestedPages, [1, 2, 3]);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 406);
  assert.equal(lines[1], '"course-001"');
  assert.equal(lines.at(-1), '"course-405"');
});

test("pagination and dashboard contracts distinguish unique courses from membership totals", async () => {
  const [migration, pagination, dashboard, globals] = await Promise.all([
    read("supabase/migrations/202608120003_course_membership_lms_link.sql"),
    read("components/table-pagination.tsx"),
    read("components/dashboard/dashboard.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(migration, /least\(greatest\(p_limit, 1\), 200\)/);
  assert.match(pagination, /\[25, 50, 100, 200\]/);
  assert.match(pagination, /clampedPage = Math\.min\(page, pageCount\)/);
  assert.match(migration, /'unmanaged'/);
  assert.match(migration, /'verticalUnclassified'/);
  assert.match(migration, /'verticalMemberships'/);
  assert.match(dashboard, /Memberships/);
  assert.match(dashboard, /Unclassified/);
  assert.match(dashboard, /Unmanaged/);
  assert.match(globals, /\.wrike-link-popout\s*\{[\s\S]*?position:\s*fixed/);
});
