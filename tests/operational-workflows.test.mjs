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

test("course cleanup keeps LMS truth immutable while projections, comparisons, and workflow deletion are explicit", async () => {
  const sql = await read("supabase/migrations/202608040008_course_data_cleanup.sql");
  assert.match(sql, /drop trigger if exists prevent_lms_api_mutation on public\.courses/);
  assert.match(sql, /projection_origin/);
  assert.match(sql, /has_manual_overrides/);
  assert.match(sql, /source_difference_count/);
  assert.match(sql, /refresh_course_comparisons/);
  assert.match(sql, /comparison_status = 'Conflict'/);
  assert.match(sql, /update_course_projection_v2/);
  assert.match(sql, /secondaryVerticals/);
  assert.match(sql, /resolved_by = case when p_selected_source is null then null else p_actor_id end/);
  assert.match(sql, /new\.health_status := public\.course_health_level\(score\)/);
  assert.doesNotMatch(sql, /public\.course_health_status\(/);
  assert.match(sql, /delete_workflow_record_permanently/);
  assert.match(sql, /when 'course_flags' then 'flags:manage'/);
  assert.match(sql, /when 'revamp_proposals' then 'revamp:propose'/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(courses|lms_snapshots|content_metadata_records|accreditation_records)/i);
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

test("course data repair adds three-source alignment, authority locks, archive restore, and server pagination", async () => {
  const sql = await read("supabase/migrations/202608050001_course_data_repair_and_comparison.sql");
  assert.match(sql, /lms_authority_settings/);
  assert.match(sql, /authority_mode in \('workbook', 'api'\)/);
  assert.match(sql, /content_metadata_one_current_per_course_idx/);
  assert.match(sql, /coursetrack_normalized_value/);
  for (const status of ["In sync", "Pending LMS update", "Manually confirmed", "Missing metadata", "App only", "Mapping required"]) assert.match(sql, new RegExp(status));
  assert.match(sql, /source_normalized_payload/);
  assert.match(sql, /coursetrack-import@system\.local/);
  assert.match(sql, /topic_number/);
  assert.match(sql, /confirm_data_alignment/);
  assert.match(sql, /restore_managed_record/);
  assert.match(sql, /Select another current version before archiving/);
  assert.match(sql, /healthy connector and successful API snapshot/i);
  assert.match(sql, /search_course_library/);
  assert.match(sql, /refresh_all_course_comparisons\(\)[\s\S]*set statement_timeout = '15min'/);
  assert.match(sql, /get_dashboard_snapshot/);
  assert.match(sql, /limit 5/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(lms_snapshots|content_metadata_records|accreditation_records|course_versions)/i);
});

test("dashboard aggregation stays server-side and returns bounded queues", async () => {
  const [page, dashboard] = await Promise.all([
    read("app/page.tsx"),
    read("components/dashboard/dashboard.tsx"),
  ]);
  assert.match(page, /getDashboardSnapshot/);
  assert.doesNotMatch(page, /getPortfolioSummaries/);
  assert.match(await read("db/course-repository.ts"), /error\?\.code === "PGRST202"[\s\S]*fetchLegacyDashboardSnapshot/);
  assert.match(dashboard, /snapshot\.reviewQueue/);
  assert.match(dashboard, /snapshot\.riskQueue/);
  assert.doesNotMatch(dashboard, /courses:\s*DashboardCourse\[\]/);
});

test("inline comparison indicators and managed-record endpoints expose the required workflows", async () => {
  const [detail, comparisonRoute, accreditationRestore, versionRestore] = await Promise.all([
    read("components/course-detail/course-detail.tsx"),
    read("app/api/courses/[id]/data-comparisons/[comparisonId]/confirm/route.ts"),
    read("app/api/accreditations/[id]/restore/route.ts"),
    read("app/api/course-versions/[id]/restore/route.ts"),
  ]);
  assert.doesNotMatch(detail, /"Data Comparison"/);
  assert.doesNotMatch(detail, /"LMS Data"/);
  assert.match(detail, /inline-field-grid/);
  assert.match(detail, /CourseTrack value/);
  assert.match(detail, /LMS value/);
  assert.match(detail, /expectedUpdatedAt: course\.updatedAt/);
  assert.match(detail, /Create version/);
  assert.match(detail, /Add accreditation/);
  assert.match(comparisonRoute, /confirmDataAlignment/);
  assert.match(accreditationRestore, /requireApiRole\("super_admin", "admin", "accreditation"\)/);
  assert.match(versionRestore, /requireApiRole\("super_admin", "admin"\)/);
});

test("Revamp UI has one pointer/keyboard drag handle, permission, ordering, and rollback contracts", async () => {
  const source = await read("components/portfolio-workspaces.tsx");
  assert.match(source, /className={`drag-handle/);
  assert.match(source, /draggable/);
  assert.match(source, /onDrop/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /affectedColumns/);
  assert.doesNotMatch(source, /Move .* left|Move .* right/);
  assert.doesNotMatch(source, /to another stage/);
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
  assert.match(detail, /<details className="panel accreditation-accordion"[^>]*>/);
  assert.match(detail, /<summary>/);
  assert.match(detail, /data-tooltip/);
  assert.match(detail, /aria-label=.*LMS refresh unavailable/);
  assert.match(css, /@media \(max-width: 699px\)[\s\S]*\.versions-table[\s\S]*display: none/);
});
