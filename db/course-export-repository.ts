import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

type Row = Record<string, unknown>;

export const COURSE_EXPORT_COLUMNS = [
  "Course ID", "Course code", "LMS course ID", "LMS link status", "Title", "Short title", "Description",
  "Learning audience", "Management", "Verticals", "Topics", "Tags", "Lifecycle", "Publication status",
  "Delivery format", "Duration minutes", "Training credits", "Published", "Authoring tool", "State", "Owner",
  "Instructional designer", "Current version", "Original publish date", "Last major revision", "Next review",
  "Backend link", "Course link", "Update type", "Content updated", "Content notes", "Internal summary",
  "Health status", "Health score", "Course data completeness", "Retrieval status", "Last retrieved",
  "Provenance", "Field provenance", "Mapping warnings", "Validation errors", "Source differences",
  "Source timestamps", "Versions", "Version Wrike links", "Accreditation", "Field alignment", "Tasks and callouts",
  "Notes", "Relationships", "Revamp proposals",
] as const;

const EXPORT_PAGE_SIZE = 1000;
// Supabase's fluent builder is intentionally erased here so every child table
// can share one fully paged batch reader without per-course queries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseQuery = any;

async function allRelated(client: SupabaseClient, table: string, columns: string, field: string, ids: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const query: SupabaseQuery = client.from(table).select(columns).in(field, ids).range(from, from + EXPORT_PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Could not assemble ${table} for the course export: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < EXPORT_PAGE_SIZE) break;
  }
  return rows;
}

function database(): SupabaseClient {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("CourseTrack persistence is not configured.");
  return client;
}

function grouped(rows: Row[]): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row.course_id ?? "");
    const values = map.get(key) ?? [];
    values.push(row); map.set(key, values);
  }
  return map;
}

function sortedJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item as Row).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, normalize(nested)]));
    return item;
  };
  return JSON.stringify(normalize(value));
}

function compareText(left: Row, right: Row, key: string): number {
  return String(left[key] ?? "").localeCompare(String(right[key] ?? ""));
}

export async function getCourseExportBatch(appIds: string[]): Promise<string[][]> {
  if (appIds.length === 0) return [];
  const client = database();
  const { data: courses, error } = await client.from("courses").select("id,app_id,course_code,lms_course_id,title,short_title,description,learning_audience,management_classification,lifecycle_status,publication_status,delivery_format,duration_minutes,training_credits,is_published,authoring_tool,state_code,owner_name,instructional_designer_name,current_version,original_publish_date,last_major_revision_date,next_review_date,backend_link,frontend_link,content_update_type,content_updated_at,content_notes,internal_summary,health_status,health_score,metadata_completeness_score,retrieval_status,last_retrieved_at,provenance,field_provenance,mapping_warnings,import_validation_errors,source_difference_count,source_timestamps").in("app_id", appIds);
  if (error) throw new Error(`Could not read courses for export: ${error.message}`);
  const ids = (courses ?? []).map((row) => row.id as string);
  if (ids.length === 0) return [];
  const [verticalRows, topicRows, tagRows, versionRows, accreditationRows, comparisonRows, snapshotRows, flagRows, noteRows, relationshipRows, revampRows] = await Promise.all([
    allRelated(client, "course_verticals", "course_id,verticals!inner(slug,name,sort_order)", "course_id", ids),
    allRelated(client, "course_topics", "id,course_id,assignment_source,topics!inner(display_label)", "course_id", ids),
    allRelated(client, "course_tags", "id,course_id,assignment_source,tags!inner(display_label)", "course_id", ids),
    allRelated(client, "course_versions", "id,course_id,version_number,version_type,publication_date,version_status,is_current,authoring_tool,package_standard,release_notes,provenance,archived_at", "course_id", ids),
    allRelated(client, "accreditation_records", "id,course_id,organization,jurisdiction,status,approval_number,topic_number,credit_hours,effective_date,expiration_date,source_domain,source_transport,alignment_status,archived_at,updated_at", "course_id", ids),
    allRelated(client, "field_comparisons", "id,course_id,field_key,field_label,lms_normalized_value,coursetrack_normalized_value,alignment_status,comparison_status,resolved_value,selected_source", "course_id", ids),
    allRelated(client, "lms_snapshots", "course_id,is_current", "course_id", ids),
    allRelated(client, "course_flags", "id,course_id,record_kind,type,title,description,priority,status,due_date,completion_notes,completed_at,provenance,archived_at", "course_id", ids),
    allRelated(client, "notes", "id,course_id,note_type,visibility,body,created_at,updated_at,provenance,archived_at", "course_id", ids),
    allRelated(client, "course_relationships", "id,course_id,relationship_type,related_course_id,related_lms_course_id,source,validation_status", "course_id", ids),
    allRelated(client, "revamp_proposals", "id,course_id,title,status,bucket_key,priority,score,business_justification,target_publication_date,provenance,archived_at", "course_id", ids),
  ]);
  const versionIds = versionRows.map((row) => String(row.id));
  const wrikeRows = versionIds.length ? await allRelated(client, "version_wrike_task_references", "id,course_version_id,external_task_id,task_title,project_title,task_status,assignee_names,due_date,permalink,provider_name,linked_at,last_verified_at,unlinked_at", "course_version_id", versionIds) : [];
  const courseByVersion = new Map(versionRows.map((row) => [String(row.id), String(row.course_id)]));
  const wrikeByCourse = new Map<string, Row[]>();
  for (const row of wrikeRows) {
    const courseId = courseByVersion.get(String(row.course_version_id));
    if (courseId) wrikeByCourse.set(courseId, [...(wrikeByCourse.get(courseId) ?? []), row]);
  }
  const verticalsByCourse = grouped(verticalRows);
  const topicsByCourse = grouped(topicRows);
  const tagsByCourse = grouped(tagRows);
  const versionsByCourse = grouped(versionRows);
  const accreditationsByCourse = grouped(accreditationRows);
  const comparisonsByCourse = grouped(comparisonRows);
  const flagsByCourse = grouped(flagRows);
  const notesByCourse = grouped(noteRows);
  const relationshipsByCourse = grouped(relationshipRows);
  const revampsByCourse = grouped(revampRows);
  const linked = new Set(snapshotRows.filter((row) => row.is_current).map((row) => row.course_id as string));
  const courseByAppId = new Map((courses ?? []).map((row) => [row.app_id as string, row as Row]));

  return appIds.flatMap((appId) => {
    const course = courseByAppId.get(appId);
    if (!course) return [];
    const id = String(course.id);
    const verticalValues = verticalsByCourse.get(id)?.map((row) => row.verticals as Row).sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || compareText(a, b, "slug")).map((vertical) => vertical.slug) ?? [];
    const topicValues = topicsByCourse.get(id)?.map((row) => ({ id: row.id, topic: (row.topics as Row).display_label, source: row.assignment_source })).sort((a, b) => String(a.topic).localeCompare(String(b.topic)) || String(a.source).localeCompare(String(b.source)) || String(a.id).localeCompare(String(b.id))) ?? [];
    const tagValues = tagsByCourse.get(id)?.map((row) => ({ id: row.id, tag: (row.tags as Row).display_label, source: row.assignment_source })).sort((a, b) => String(a.tag).localeCompare(String(b.tag)) || String(a.source).localeCompare(String(b.source)) || String(a.id).localeCompare(String(b.id))) ?? [];
    return [[
      appId, course.course_code, course.lms_course_id, linked.has(id) ? "LMS linked" : "Not LMS linked",
      course.title, course.short_title, course.description, course.learning_audience,
      course.management_classification === "Lexipol managed" ? "Lexipol Managed" : "Unmanaged", sortedJson(verticalValues),
      sortedJson(topicValues), sortedJson(tagValues), course.lifecycle_status, course.publication_status, course.delivery_format,
      course.duration_minutes, sortedJson(course.training_credits), course.is_published, course.authoring_tool, course.state_code,
      course.owner_name, course.instructional_designer_name, course.current_version, course.original_publish_date,
      course.last_major_revision_date, course.next_review_date, course.backend_link, course.frontend_link, course.content_update_type,
      course.content_updated_at, course.content_notes, course.internal_summary, course.health_status, course.health_score,
      course.metadata_completeness_score, course.retrieval_status, course.last_retrieved_at, course.provenance,
      sortedJson(course.field_provenance), sortedJson(course.mapping_warnings), sortedJson(course.import_validation_errors),
      course.source_difference_count, sortedJson(course.source_timestamps),
      sortedJson((versionsByCourse.get(id) ?? []).sort((left, right) => String(right.publication_date ?? "").localeCompare(String(left.publication_date ?? "")) || compareText(left, right, "id"))),
      sortedJson((wrikeByCourse.get(id) ?? []).sort((left, right) => compareText(left, right, "external_task_id") || compareText(left, right, "id"))),
      sortedJson((accreditationsByCourse.get(id) ?? []).sort((left, right) => String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")) || compareText(left, right, "id"))),
      sortedJson((comparisonsByCourse.get(id) ?? []).sort((left, right) => compareText(left, right, "field_key") || compareText(left, right, "id"))),
      sortedJson((flagsByCourse.get(id) ?? []).sort((left, right) => compareText(left, right, "title") || compareText(left, right, "id"))),
      sortedJson((notesByCourse.get(id) ?? []).sort((left, right) => compareText(left, right, "created_at") || compareText(left, right, "id"))),
      sortedJson((relationshipsByCourse.get(id) ?? []).sort((left, right) => compareText(left, right, "relationship_type") || compareText(left, right, "related_course_id") || compareText(left, right, "related_lms_course_id") || compareText(left, right, "id"))),
      sortedJson((revampsByCourse.get(id) ?? []).sort((left, right) => compareText(left, right, "title") || compareText(left, right, "id"))),
    ].map((value) => value === null || value === undefined ? "" : String(value))];
  });
}
