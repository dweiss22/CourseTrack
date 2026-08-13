import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccreditationRecord,
  AuditHistoryRecord,
  Course,
  CourseFlag,
  CourseNote,
  CourseRelationship,
  CourseTagAssignment,
  CourseTopicAssignment,
  CourseVersion,
  ContentMetadataRecord,
  FieldComparison,
  LmsCourseSnapshot,
  ResolvedCourseFields,
  RevampProposal,
  Provenance,
  SourceHistoryRecord,
  Vertical,
  VerticalAssignment,
  VersionWrikeTaskReference,
} from "@/types/course";
import { verticals } from "@/types/course";
import { assessAccreditationHistory } from "@/lib/accreditation-grouping";
import { calculateCourseHealth, calculateMetadataCompleteness } from "@/lib/health";

const PAGE_SIZE = 1000;
const SLUG_TO_VERTICAL: Record<string, Vertical> = Object.fromEntries(
  verticals.map((vertical) => [vertical.toLowerCase(), vertical]),
);

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseQuery = any;

function toProvenance(value: unknown): Provenance {
  if (value === "coursetrack" || value === "manual") return "coursetrack";
  if (value === "lms_api") return "lms_api";
  return "uploaded";
}

async function fetchAllRows(
  client: SupabaseClient,
  table: string,
  columns: string,
  modify?: (query: SupabaseQuery) => SupabaseQuery,
): Promise<Row[]> {
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    let query: SupabaseQuery = client.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (modify) query = modify(query);
    const { data, error } = await query;
    if (error) {
      throw new Error(`Could not read Supabase table "${table}": ${error.message}`);
    }
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function groupBy<T extends Row>(rows: T[], key: string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = row[key] as string | null;
    if (!value) continue;
    const list = grouped.get(value) ?? [];
    list.push(row);
    grouped.set(value, list);
  }
  return grouped;
}

async function fetchGraph(client: SupabaseClient, courseAppId?: string): Promise<Course[] | null> {
  // Resolve the target course's internal id up front so every child table
  // can be filtered server-side instead of pulling the whole portfolio.
  let courseDbId: string | null = null;
  if (courseAppId) {
    const { data, error } = await client.from("courses").select("id").eq("app_id", courseAppId).maybeSingle();
    if (error) throw new Error(`Could not resolve course "${courseAppId}": ${error.message}`);
    if (!data) {
      return null;
    }
    courseDbId = data.id as string;
  }
  const byCourse = (query: SupabaseQuery): SupabaseQuery =>
    courseDbId ? query.eq("course_id", courseDbId) : query;

  const [
    verticalRows,
    retrievalRunRows,
    courseRows,
    courseVerticalRows,
    versionRows,
    wrikeRefRows,
    accreditationRows,
    flagRows,
    noteRows,
    revampRows,
    snapshotRows,
    metadataRecordRows,
    fieldComparisonRows,
    courseTopicRows,
    courseTagRows,
    relationshipRows,
    auditLogRows,
    profileRows,
  ] = await Promise.all([
    fetchAllRows(client, "verticals", "id,slug"),
    fetchAllRows(client, "lms_retrieval_runs", "id,external_run_id"),
    fetchAllRows(
      client,
      "courses",
      "id,app_id,course_code,lms_course_id,management_classification,monitoring_enabled,reconciliation_status,resolved_fields,source_timestamps,mapping_warnings,import_validation_errors,title,short_title,description,learning_audience,primary_vertical_id,primary_topic,lifecycle_status,publication_status,delivery_format,duration_minutes,training_credits,is_published,authoring_tool,state_code,owner_name,instructional_designer_name,current_version,original_publish_date,last_major_revision_date,next_review_date,backend_link,frontend_link,content_update_type,content_updated_at,content_notes,projection_origin,has_manual_overrides,source_difference_count,health_status,health_score,metadata_completeness_score,internal_summary,source_system,data_source,provenance,origin_provenance,field_provenance,retrieval_status,last_retrieved_at,is_sample,updated_at,archived_at",
      (query) => (courseDbId ? query.eq("id", courseDbId) : query).is("archived_at", null),
    ),
    fetchAllRows(client, "course_verticals", "course_id,vertical_id,relationship_type", byCourse),
    fetchAllRows(
      client,
      "course_versions",
      "id,course_id,version_number,version_type,publication_date,is_current,authoring_tool,package_standard,release_notes,managed_by,created_by_email,version_status,provenance,origin_provenance,created_at,updated_at,archived_at",
      byCourse,
    ),
    fetchAllRows(
      client,
      "version_wrike_task_references",
      "id,course_version_id,external_task_id,task_title,external_project_id,project_title,task_status,assignee_names,due_date,permalink,provider_name,retrieved_at,linked_by_email,linked_at,link_method,last_verified_at,updated_at,wrike_published_date",
      (query) => query.is("unlinked_at", null),
    ),
    fetchAllRows(
      client,
      "accreditation_records",
      "id,course_id,organization,jurisdiction,status,approval_number,topic_number,credit_hours,effective_date,expiration_date,risk_reasons,data_source,provenance,origin_provenance,source_domain,source_transport,source_normalized_payload,alignment_status,alignment_confirmed_by_email,alignment_confirmed_at,alignment_confirmation_note,created_at,updated_at,archived_at",
      byCourse,
    ),
    fetchAllRows(
      client,
      "course_flags",
      "id,course_id,record_kind,type,title,description,priority,status,owner_id,due_date,completion_notes,completed_by,completed_at,resolved_by,resolved_at,created_by,created_at,updated_by,updated_at,provenance,archived_at",
      byCourse,
    ),
    fetchAllRows(client, "notes", "id,course_id,note_type,author_id,visibility,body,created_at,updated_at,provenance,archived_at", (query) => byCourse(query).is("archived_at", null)),
    fetchAllRows(
      client,
      "revamp_proposals",
      "id,course_id,title,status,bucket_key,sort_order,priority,score,business_justification,target_publication_date,provenance,updated_at,archived_at",
      (query) => byCourse(query).is("archived_at", null),
    ),
    fetchAllRows(
      client,
      "lms_snapshots",
      "id,course_id,provider,external_id,retrieval_run_id,retrieved_at,normalized_payload,raw_payload,mapping_warnings,source_transport",
      (query) => byCourse(query).eq("is_current", true),
    ),
    fetchAllRows(client, "content_metadata_records", "course_id,normalized_payload", (query) => byCourse(query).eq("is_current", true).eq("is_importable", true)),
    fetchAllRows(
      client,
      "field_comparisons",
      "id,course_id,field_key,field_label,lms_raw_value,lms_normalized_value,content_metadata_raw_value,content_metadata_normalized_value,coursetrack_normalized_value,field_scope,alignment_status,source_value_hash,alignment_confirmed_source_hash,alignment_confirmed_by_email,alignment_confirmed_at,alignment_confirmation_note,resolved_value,selected_source,comparison_status,resolution_reason,resolved_by_email,resolved_at,last_compared_at,updated_at,is_comparable",
      byCourse,
    ),
    fetchAllRows(
      client,
      "course_topics",
      "id,course_id,assignment_source,imported_at,import_run_id,topics(display_label,original_label)",
      byCourse,
    ),
    fetchAllRows(
      client,
      "course_tags",
      "id,course_id,assignment_source,created_at,tags(display_label)",
      byCourse,
    ),
    fetchAllRows(
      client,
      "course_relationships",
      "id,course_id,relationship_type,related_course_id,related_lms_course_id,source,validation_status",
      byCourse,
    ),
    fetchAllRows(client, "audit_logs", "id,record_id,record_type,action,actor_email,reason,created_at", (query) =>
      query.in("record_type", ["course", "field_comparison"]),
    ),
    fetchAllRows(client, "profiles", "id,display_name,email"),
  ]);

  const verticalById = new Map(verticalRows.map((row) => [row.id as string, row.slug as string]));
  const retrievalRunIdByDbId = new Map(
    retrievalRunRows.map((row) => [row.id as string, (row.external_run_id as string) ?? (row.id as string)]),
  );
  const courseTitleByDbId = new Map(courseRows.map((row) => [row.id as string, row.title as string]));
  const courseAppIdByDbId = new Map(courseRows.map((row) => [row.id as string, row.app_id as string]));
  const profileById = new Map(profileRows.map((row) => [row.id as string, row]));

  const verticalsByCourse = groupBy(courseVerticalRows, "course_id");
  const versionsByCourse = groupBy(versionRows, "course_id");
  const wrikeRefsByVersion = groupBy(wrikeRefRows, "course_version_id");
  const accreditationsByCourse = groupBy(accreditationRows, "course_id");
  const flagsByCourse = groupBy(flagRows, "course_id");
  const notesByCourse = groupBy(noteRows, "course_id");
  const revampByCourse = groupBy(revampRows, "course_id");
  const snapshotByCourse = groupBy(snapshotRows, "course_id");
  const metadataRecordByCourse = groupBy(metadataRecordRows, "course_id");
  const fieldComparisonsByCourse = groupBy(fieldComparisonRows, "course_id");
  const topicAssignmentsByCourse = groupBy(courseTopicRows, "course_id");
  const tagAssignmentsByCourse = groupBy(courseTagRows, "course_id");
  const relationshipsByCourse = groupBy(relationshipRows, "course_id");
  const auditLogsByAppId = new Map<string, Row[]>();
  for (const row of auditLogRows) {
    const recordId = String(row.record_id ?? "");
    const appId = recordId.includes(":") ? recordId.split(":")[0] : recordId;
    const list = auditLogsByAppId.get(appId) ?? [];
    list.push(row);
    auditLogsByAppId.set(appId, list);
  }

  return courseRows.map((row) => buildCourseFromRows(row, {
    verticalById,
    retrievalRunIdByDbId,
    courseTitleByDbId,
    courseAppIdByDbId,
    verticalsByCourse,
    versionsByCourse,
    wrikeRefsByVersion,
    accreditationsByCourse,
    flagsByCourse,
    notesByCourse,
    revampByCourse,
    snapshotByCourse,
    metadataRecordByCourse,
    fieldComparisonsByCourse,
    topicAssignmentsByCourse,
    tagAssignmentsByCourse,
    relationshipsByCourse,
    auditLogsByAppId,
    profileById,
  }));
}

export async function fetchFullCourseGraph(client: SupabaseClient): Promise<Course[]> {
  return (await fetchGraph(client)) ?? [];
}

export async function fetchCourseGraphByAppId(
  client: SupabaseClient,
  appId: string,
): Promise<Course | null> {
  const courses = await fetchGraph(client, appId);
  return courses?.[0] ?? null;
}

interface GraphMaps {
  verticalById: Map<string, string>;
  retrievalRunIdByDbId: Map<string, string>;
  courseTitleByDbId: Map<string, string>;
  courseAppIdByDbId: Map<string, string>;
  verticalsByCourse: Map<string, Row[]>;
  versionsByCourse: Map<string, Row[]>;
  wrikeRefsByVersion: Map<string, Row[]>;
  accreditationsByCourse: Map<string, Row[]>;
  flagsByCourse: Map<string, Row[]>;
  notesByCourse: Map<string, Row[]>;
  revampByCourse: Map<string, Row[]>;
  snapshotByCourse: Map<string, Row[]>;
  metadataRecordByCourse: Map<string, Row[]>;
  fieldComparisonsByCourse: Map<string, Row[]>;
  topicAssignmentsByCourse: Map<string, Row[]>;
  tagAssignmentsByCourse: Map<string, Row[]>;
  relationshipsByCourse: Map<string, Row[]>;
  auditLogsByAppId: Map<string, Row[]>;
  profileById: Map<string, Row>;
}

function taskCalloutActor(profileById: Map<string, Row>, id: unknown): CourseFlag["assignee"] {
  if (!id) return null;
  const profile = profileById.get(String(id));
  if (!profile) return null;
  return {
    id: String(profile.id),
    displayName: String(profile.display_name ?? profile.email ?? "Unknown user"),
    email: String(profile.email ?? ""),
  };
}

function buildTaskCallout(row: Row, profileById: Map<string, Row>): CourseFlag {
  return {
    id: String(row.id),
    recordKind: row.record_kind === "Task" ? "Task" : "Callout",
    category: String(row.type ?? "General"),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    priority: row.priority as CourseFlag["priority"],
    status: row.status as CourseFlag["status"],
    assignee: taskCalloutActor(profileById, row.owner_id),
    assigneeId: row.owner_id ? String(row.owner_id) : null,
    dueDate: row.due_date ? String(row.due_date) : null,
    completionNotes: row.completion_notes ? String(row.completion_notes) : null,
    completedBy: taskCalloutActor(profileById, row.completed_by),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    resolvedBy: taskCalloutActor(profileById, row.resolved_by),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    createdBy: taskCalloutActor(profileById, row.created_by),
    createdAt: String(row.created_at ?? row.updated_at ?? ""),
    updatedBy: taskCalloutActor(profileById, row.updated_by),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    provenance: toProvenance(row.provenance),
  };
}

function buildCourseFromRows(row: Row, maps: GraphMaps): Course {
  const courseDbId = row.id as string;
  const appId = row.app_id as string;
  const courseVerticals = (maps.verticalsByCourse.get(courseDbId) ?? [])
    .map((entry) => SLUG_TO_VERTICAL[maps.verticalById.get(entry.vertical_id as string) ?? ""])
    .filter((vertical): vertical is Vertical => Boolean(vertical))
    .filter((vertical, index, all) => all.indexOf(vertical) === index)
    .sort((left, right) => verticals.indexOf(left) - verticals.indexOf(right));

  const versions: CourseVersion[] = (maps.versionsByCourse.get(courseDbId) ?? [])
    .map((version) => buildVersion(version, maps.wrikeRefsByVersion))
    .sort((a, b) => a.publicationDate.localeCompare(b.publicationDate));

  const accreditations: AccreditationRecord[] = (maps.accreditationsByCourse.get(courseDbId) ?? []).map(
    (record) => ({
      id: record.id as string,
      organization: record.organization as string,
      jurisdiction: (record.jurisdiction as string) ?? "",
      status: record.status as AccreditationRecord["status"],
      approvalNumber: (record.approval_number as string) ?? null,
      topicNumber: (record.topic_number as string) ?? null,
      creditHours: Number(record.credit_hours ?? 0),
      effectiveDate: (record.effective_date as string) ?? null,
      expirationDate: (record.expiration_date as string) ?? null,
      source: toProvenance(record.provenance ?? record.data_source),
      riskReasons: (record.risk_reasons as string[]) ?? [],
      createdAt: (record.created_at as string) ?? undefined,
      updatedAt: (record.updated_at as string) ?? undefined,
      archivedAt: (record.archived_at as string) ?? null,
      originProvenance: toProvenance(record.origin_provenance ?? record.provenance ?? record.data_source),
      sourceDomain: (record.source_domain as AccreditationRecord["sourceDomain"]) ?? "coursetrack",
      sourceTransport: (record.source_transport as AccreditationRecord["sourceTransport"]) ?? "manual",
      sourceNormalizedValues: (record.source_normalized_payload as AccreditationRecord["sourceNormalizedValues"]) ?? {},
      alignmentStatus: (record.alignment_status as AccreditationRecord["alignmentStatus"]) ?? "App only",
      confirmationActor: (record.alignment_confirmed_by_email as string) ?? null,
      confirmationTime: (record.alignment_confirmed_at as string) ?? null,
      confirmationNote: (record.alignment_confirmation_note as string) ?? null,
    }),
  );

  const flags: CourseFlag[] = (maps.flagsByCourse.get(courseDbId) ?? []).map((flag) =>
    buildTaskCallout(flag, maps.profileById),
  );

  const notes: CourseNote[] = (maps.notesByCourse.get(courseDbId) ?? []).map((note) => ({
    id: note.id as string,
    type: note.note_type as string,
    author: "CourseTrack Import",
    createdAt: note.created_at as string,
    visibility: note.visibility as CourseNote["visibility"],
    body: note.body as string,
    authorId: (note.author_id as string) ?? null,
    updatedAt: (note.updated_at as string) ?? undefined,
    archivedAt: (note.archived_at as string) ?? null,
    provenance: toProvenance(note.provenance),
  }));

  const revampRows = (maps.revampByCourse.get(courseDbId) ?? [])
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
  const revampRow = revampRows[0];
  const revampProposal: RevampProposal | null = revampRow
    ? {
        id: revampRow.id as string,
        title: revampRow.title as string,
        status: revampRow.status as RevampProposal["status"],
        priority: revampRow.priority as RevampProposal["priority"],
        score: Number(revampRow.score),
        targetPublicationDate: (revampRow.target_publication_date as string) ?? null,
        businessJustification: revampRow.business_justification as string,
        bucket: (revampRow.bucket_key as RevampProposal["bucket"]) ?? null,
        sortOrder: Number(revampRow.sort_order ?? 0),
        updatedAt: (revampRow.updated_at as string) ?? undefined,
        archivedAt: (revampRow.archived_at as string) ?? null,
        provenance: toProvenance(revampRow.provenance),
      }
    : null;
  const revampTasks: RevampProposal[] = revampRows.map((item) => ({
    id: item.id as string,
    title: item.title as string,
    status: item.status as RevampProposal["status"],
    priority: item.priority as RevampProposal["priority"],
    score: Number(item.score),
    targetPublicationDate: (item.target_publication_date as string) ?? null,
    businessJustification: item.business_justification as string,
    bucket: (item.bucket_key as RevampProposal["bucket"]) ?? null,
    sortOrder: Number(item.sort_order ?? 0),
    updatedAt: (item.updated_at as string) ?? undefined,
    archivedAt: (item.archived_at as string) ?? null,
    provenance: toProvenance(item.provenance),
  }));

  const snapshotRow = (maps.snapshotByCourse.get(courseDbId) ?? [])[0];
  const lmsSnapshot: LmsCourseSnapshot | null = snapshotRow
    ? {
        id: `${appId}-SNAPSHOT-1`,
        retrievalRunId: maps.retrievalRunIdByDbId.get(snapshotRow.retrieval_run_id as string) ?? "",
        provider: snapshotRow.provider as string,
        lmsCourseId: snapshotRow.external_id as string,
        retrievedAt: snapshotRow.retrieved_at as string,
        isCurrent: true,
        rawPayload: (snapshotRow.raw_payload as Record<string, unknown>) ?? {},
        normalized: snapshotRow.normalized_payload as LmsCourseSnapshot["normalized"],
        mappingWarnings: (snapshotRow.mapping_warnings as string[]) ?? [],
        sourceTransport: (snapshotRow.source_transport as LmsCourseSnapshot["sourceTransport"]) ?? "uploaded",
      }
    : null;

  const metadataRow = (maps.metadataRecordByCourse.get(courseDbId) ?? [])[0];
  const contentMetadata = metadataRow
    ? metadataRow.normalized_payload as ContentMetadataRecord
    : null;

  const fieldComparisons: FieldComparison[] = (maps.fieldComparisonsByCourse.get(courseDbId) ?? []).map(
    (comparison) => ({
      id: comparison.id as string,
      fieldKey: comparison.field_key as string,
      fieldLabel: comparison.field_label as string,
      lmsRawValue: comparison.lms_raw_value,
      lmsNormalizedValue: comparison.lms_normalized_value,
      contentMetadataRawValue: comparison.content_metadata_raw_value,
      contentMetadataNormalizedValue: comparison.content_metadata_normalized_value,
      courseTrackNormalizedValue: comparison.coursetrack_normalized_value,
      fieldScope: (comparison.field_scope as FieldComparison["fieldScope"]) ?? "shared",
      alignmentStatus: (comparison.alignment_status as FieldComparison["alignmentStatus"]) ?? "Mapping required",
      lmsSourceTimestamp: (row.last_retrieved_at as string) ?? null,
      metadataSourceTimestamp: contentMetadata?.importedAt ?? null,
      confirmationActor: (comparison.alignment_confirmed_by_email as string) ?? null,
      confirmationTime: (comparison.alignment_confirmed_at as string) ?? null,
      confirmationNote: (comparison.alignment_confirmation_note as string) ?? null,
      sourceValueHash: (comparison.source_value_hash as string) ?? null,
      confirmedSourceHash: (comparison.alignment_confirmed_source_hash as string) ?? null,
      resolvedValue: comparison.resolved_value,
      selectedSource: comparison.selected_source as FieldComparison["selectedSource"],
      comparisonStatus: comparison.comparison_status as FieldComparison["comparisonStatus"],
      resolutionReason: (comparison.resolution_reason as string) ?? null,
      resolvedBy: (comparison.resolved_by_email as string) ?? null,
      resolvedAt: (comparison.resolved_at as string) ?? null,
      lastComparedAt: comparison.last_compared_at as string,
      updatedAt: comparison.updated_at as string,
      isComparable: comparison.is_comparable !== false,
    }),
  );

  const topicAssignments: CourseTopicAssignment[] = (maps.topicAssignmentsByCourse.get(courseDbId) ?? []).map(
    (assignment) => {
      const topic = assignment.topics as { display_label?: string; original_label?: string } | null;
      return {
        id: assignment.id as string,
        topic: topic?.display_label ?? "",
        originalTopicLabel: topic?.original_label ?? "",
        source: assignment.assignment_source as CourseTopicAssignment["source"],
        importRunId: assignment.import_run_id ? "topics-import" : null,
        assignedAt: assignment.imported_at as string,
      } satisfies CourseTopicAssignment;
    },
  );

  const tagAssignments: CourseTagAssignment[] = (maps.tagAssignmentsByCourse.get(courseDbId) ?? []).map(
    (assignment) => {
      const tag = assignment.tags as { display_label?: string } | null;
      return {
        id: assignment.id as string,
        tag: tag?.display_label ?? "",
        source: "Manual",
        assignedAt: assignment.created_at as string,
      } satisfies CourseTagAssignment;
    },
  );

  const relationships: CourseRelationship[] = (maps.relationshipsByCourse.get(courseDbId) ?? []).map(
    (relationship) => ({
      id: relationship.id as string,
      relationship: relationship.relationship_type as CourseRelationship["relationship"],
      relatedCourseId: relationship.related_lms_course_id as string,
      relatedCourseTitle: relationship.related_course_id
        ? maps.courseTitleByDbId.get(relationship.related_course_id as string) ?? null
        : null,
      source: relationship.source as CourseRelationship["source"],
      validationStatus: relationship.validation_status as CourseRelationship["validationStatus"],
    }),
  );

  const verticalAssignments = buildVerticalAssignments({
    verticals: courseVerticals,
    metadataVerticals: contentMetadata?.verticals ?? [],
    mappedVerticals: lmsSnapshot?.normalized.mappedVerticals ?? [],
  });

  const conflictCount = fieldComparisons.filter(
    (comparison) => comparison.comparisonStatus === "Conflict" && !comparison.selectedSource,
  ).length;
  const accreditationGroups = assessAccreditationHistory(accreditations.filter((record) => !record.archivedAt), { courseKey: appId });
  const riskPriority = ["expired", "expiring_soon", "renewal_due", "conditional", "renewal_submitted", "undated", "active", "not_required", "future"];
  const prioritizedGroups = [...accreditationGroups].sort(
    (left, right) => riskPriority.indexOf(left.riskState) - riskPriority.indexOf(right.riskState),
  );
  const accreditationStatus = prioritizedGroups[0]?.current?.record.status ?? "Not Required";
  const nearestAccreditationExpiration =
    accreditationGroups
      .map((group) => group.current?.record.expirationDate ?? null)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
  const currentVersion = versions.find((version) => version.isCurrent && !version.archivedAt)?.versionNumber ?? (row.current_version as string) ?? "1.0";
  const nextReviewDateValue = (row.next_review_date as string) ?? null;
  const health = calculateCourseHealth({
    metadataCompletenessScore: calculateMetadataCompleteness(contentMetadata),
    unresolvedConflictCount: conflictCount,
    nextReviewDate: nextReviewDateValue,
  });

  const importHistory: SourceHistoryRecord[] = [
    ...(contentMetadata ? [{
      id: `${appId}-IMPORT-METADATA`,
      source: "Content Metadata" as const,
      runId: "content-metadata-import",
      status: (contentMetadata.validationErrors.length > 0 ? "Succeeded with warnings" : "Succeeded") as SourceHistoryRecord["status"],
      occurredAt: contentMetadata.importedAt,
      summary: "Course metadata imported from LMS new list - master.xlsx.",
    }] : []),
    ...(topicAssignments.some((assignment) => assignment.source === "Topics import")
      ? [
          {
            id: `${appId}-IMPORT-TOPICS`,
            source: "Topics" as const,
            runId: "topics-import",
            status: "Succeeded" as const,
            occurredAt: contentMetadata?.importedAt ?? topicAssignments[0]?.assignedAt ?? new Date(0).toISOString(),
            summary: `${topicAssignments.filter((assignment) => assignment.source === "Topics import").length} topic assignment(s) imported from LMS new list - Topics.xlsx.`,
          },
        ]
      : []),
  ];
  const retrievalHistory: SourceHistoryRecord[] = lmsSnapshot
    ? [
        {
          id: `${appId}-RETRIEVAL-1`,
          source: "LMS",
          runId: lmsSnapshot.retrievalRunId,
          status: lmsSnapshot.mappingWarnings.length > 0 ? "Succeeded with warnings" : "Succeeded",
          occurredAt: lmsSnapshot.retrievedAt,
          summary: "Read-only LMS snapshot loaded from the supplied LMS exports.",
        },
      ]
    : [];
  const auditHistory: AuditHistoryRecord[] = (maps.auditLogsByAppId.get(appId) ?? []).map((audit) => ({
    id: audit.id as string,
    action: audit.action as string,
    actor: (audit.actor_email as string) ?? "Unknown",
    occurredAt: audit.created_at as string,
    reason: (audit.reason as string) ?? null,
  }));

  return {
    id: appId,
    updatedAt: (row.updated_at as string) ?? undefined,
    archivedAt: (row.archived_at as string) ?? null,
    courseCode: row.course_code as string,
    lmsCourseId: (row.lms_course_id as string) ?? null,
    managementClassification: row.management_classification as Course["managementClassification"],
    monitoringEnabled: Boolean(row.monitoring_enabled),
    lmsLinkStatus: lmsSnapshot ? "linked" : "not_linked",
    title: row.title as string,
    shortTitle: row.short_title as string,
    description: row.description as string,
    learningAudience: row.learning_audience as string,
    verticals: courseVerticals,
    primaryTopic: row.primary_topic as string,
    tags: tagAssignments.map((assignment) => assignment.tag),
    lifecycleStatus: row.lifecycle_status as Course["lifecycleStatus"],
    publicationStatus: row.publication_status as Course["publicationStatus"],
    deliveryFormat: row.delivery_format as string,
    durationMinutes: row.duration_minutes === null || row.duration_minutes === undefined ? null : Number(row.duration_minutes),
    trainingCredits: (row.training_credits as Course["trainingCredits"]) ?? contentMetadata?.trainingCredits ?? { rawDisplay: null, amount: null, unit: null },
    published: (row.is_published as boolean | null) ?? contentMetadata?.published ?? null,
    authoringTool: row.authoring_tool as string,
    stateCode: (row.state_code as string) ?? null,
    owner: (row.owner_name as string) ?? null,
    instructionalDesigner: (row.instructional_designer_name as string) ?? null,
    currentVersion,
    originalPublishDate: (row.original_publish_date as string) ?? null,
    lastMajorRevisionDate: (row.last_major_revision_date as string) ?? null,
    nextReviewDate: (row.next_review_date as string) ?? null,
    backendLink: (row.backend_link as string) ?? contentMetadata?.backendLink ?? null,
    frontendLink: (row.frontend_link as string) ?? contentMetadata?.frontendLink ?? null,
    updateType: (row.content_update_type as string) ?? contentMetadata?.updateType ?? null,
    contentUpdatedAt: (row.content_updated_at as string) ?? null,
    contentNotes: (row.content_notes as string) ?? contentMetadata?.notes ?? null,
    accreditationStatus,
    nearestAccreditationExpiration,
    healthStatus: health.status,
    healthScore: health.score,
    metadataCompletenessScore: calculateMetadataCompleteness(contentMetadata),
    dataSource: toProvenance(row.provenance ?? row.data_source),
    fieldProvenance: (row.field_provenance as Record<string, Provenance>) ?? {},
    sourceSystem: row.source_system as string,
    retrievalStatus: row.retrieval_status as Course["retrievalStatus"],
    lastRetrievedAt: (row.last_retrieved_at as string) ?? null,
    isSample: false,
    internalSummary: row.internal_summary as string,
    versions,
    accreditations,
    flags,
    notes,
    revampProposal,
    revampTasks,
    lmsSnapshot,
    contentMetadata,
    resolvedFields: (row.resolved_fields as ResolvedCourseFields) ?? {
      courseName: null,
      durationMinutes: null,
      trainingCredits: null,
      published: null,
      description: null,
      publishedDate: null,
    },
    fieldComparisons,
    sourceTimestamps: (row.source_timestamps as Course["sourceTimestamps"]) ?? {
      lmsRetrievedAt: null,
      contentMetadataImportedAt: null,
      topicsImportedAt: null,
      lastComparedAt: null,
    },
    mappingWarnings: (row.mapping_warnings as string[]) ?? [],
    topicAssignments,
    tagAssignments,
    verticalAssignments,
    relationships,
    importHistory,
    retrievalHistory,
    auditHistory,
    conflictCount,
    sourceDifferenceCount: Number(row.source_difference_count ?? fieldComparisons.filter((comparison) => comparison.isComparable && comparison.comparisonStatus === "Conflict").length),
    projectionOrigin: (row.projection_origin as Course["projectionOrigin"]) ?? "coursetrack_created",
    hasManualOverrides: Boolean(row.has_manual_overrides),
    importValidationErrors: (row.import_validation_errors as string[]) ?? [],
  };
}

function buildVersion(row: Row, wrikeRefsByVersion: Map<string, Row[]>): CourseVersion {
  const wrikeTaskReferences: VersionWrikeTaskReference[] = (wrikeRefsByVersion.get(row.id as string) ?? []).map(
    (ref) => ({
      id: ref.id as string,
      wrikeTaskId: ref.external_task_id as string,
      taskTitle: ref.task_title as string,
      projectId: (ref.external_project_id as string) ?? null,
      projectTitle: (ref.project_title as string) ?? null,
      taskStatus: (ref.task_status as string) ?? null,
      assigneeNames: (ref.assignee_names as string[]) ?? [],
      dueDate: (ref.due_date as string) ?? null,
      permalink: (ref.permalink as string) ?? null,
      provider: ref.provider_name as VersionWrikeTaskReference["provider"],
      retrievedAt: ref.retrieved_at as string,
      linkedAt: ref.linked_at as string,
      linkedBy: (ref.linked_by_email as string) ?? "",
      linkMethod: (ref.link_method as VersionWrikeTaskReference["linkMethod"]) ?? null,
      lastVerifiedAt: (ref.last_verified_at as string) ?? null,
      updatedAt: String(ref.updated_at ?? ref.linked_at ?? ""),
      wrikePublishedDate: (ref.wrike_published_date as string) ?? null,
    }),
  );
  return {
    id: row.id as string,
    versionNumber: row.version_number as string,
    versionType: row.version_type as CourseVersion["versionType"],
    publicationDate: row.publication_date as string,
    isCurrent: Boolean(row.is_current),
    versionStatus: row.version_status as CourseVersion["versionStatus"],
    managedBy: "CourseTrack",
    createdAt: (row.created_at as string) ?? `${row.publication_date}T15:00:00.000Z`,
    createdBy: (row.created_by_email as string) ?? "CourseTrack import",
    releaseNotes: row.release_notes as string,
    authoringTool: row.authoring_tool as string,
    packageStandard: row.package_standard as string,
    wrikeTaskReferences,
    provenance: toProvenance(row.provenance),
    originProvenance: toProvenance(row.origin_provenance ?? row.provenance),
    updatedAt: (row.updated_at as string) ?? undefined,
    archivedAt: (row.archived_at as string) ?? null,
  };
}

function buildVerticalAssignments(input: {
  verticals: Vertical[];
  metadataVerticals: Vertical[];
  mappedVerticals: Vertical[];
}): VerticalAssignment[] {
  const assignments: VerticalAssignment[] = [
    ...input.verticals.map((vertical) => ({
      vertical,
      source: input.metadataVerticals.includes(vertical)
        ? ("Content Metadata" as const)
        : ("CourseTrack" as const),
      kind: "membership" as const,
      sourceValue: vertical,
    })),
    ...input.mappedVerticals.map((vertical) => ({
      vertical,
      source: "LMS Site availability" as const,
      kind: "availability" as const,
      sourceValue: vertical,
    })),
  ];
  return assignments.filter(
    (assignment, index, all) =>
      all.findIndex(
        (candidate) => candidate.vertical === assignment.vertical && candidate.source === assignment.source,
      ) === index,
  );
}

// Lightweight, single-table reads for the portfolio workspaces below. These
// avoid reconstructing the full nested Course graph (courses + ~12 child
// tables) when a workspace only ever renders one collection at a time —
// pulling the whole graph on every workspace page load is what exhausted the
// Workers runtime's subrequest budget.

export interface PortfolioSummary {
  id: string;
  title: string;
  shortTitle: string;
  courseCode: string;
  lmsCourseId: string | null;
  description: string;
  verticals: Vertical[];
  managementClassification: Course["managementClassification"];
  lmsLinkStatus: Course["lmsLinkStatus"];
  retrievalStatus: Course["retrievalStatus"];
  lastRetrievedAt: string | null;
  healthStatus: Course["healthStatus"];
  lifecycleStatus: Course["lifecycleStatus"];
  primaryTopic: string;
  tags: string[];
  owner: string | null;
  durationMinutes: number | null;
  dataSource: Course["dataSource"];
  updateType: string | null;
  nextReviewDate: string | null;
  metadataCompletenessScore: number;
  conflictCount: number;
  sourceDifferenceCount: number;
  flagCount: number;
  hasLmsSnapshot: boolean;
  hasContentMetadata: boolean;
  importValidationErrorCount: number;
  topicAssignments: { topic: string }[];
  backendLink: string | null;
  frontendLink: string | null;
}

// Dashboard and Course Library only ever render these flat/derived fields —
// never the full nested graph (versions, field comparisons, notes, etc.).
// Reconstructing the whole Course object for every row on these hot list
// pages is what exhausted the Workers subrequest budget; this reads only
// what's actually rendered.
export interface DashboardQueueCourse {
  id: string;
  title: string;
  verticals: Vertical[];
  owner: string | null;
  nextReviewDate: string | null;
  healthStatus: Course["healthStatus"];
  flagCount: number;
  metadataCompletenessScore: number;
}

export interface DashboardSnapshot {
  metrics: {
    totalLmsRetrieved: number;
    lexipolManaged: number;
    unmanaged: number;
    verticalUnclassified: number;
    missingContentMetadata: number;
    notLmsLinked: number;
    unresolvedConflicts: number;
    mappingRequired: number;
    staleLms: number;
    importValidationErrors: number;
  };
  coursesInView: number;
  verticalMemberships: number;
  verticalData: { name: Vertical; courses: number }[];
  healthData: { name: Course["healthStatus"]; value: number }[];
  reviewQueue: DashboardQueueCourse[];
  riskQueue: DashboardQueueCourse[];
  degradedMode?: boolean;
}

export async function fetchDashboardSnapshot(client: SupabaseClient, input: { vertical?: string } = {}): Promise<DashboardSnapshot> {
  const { data, error } = await client.rpc("get_dashboard_snapshot_v2");
  if (error?.code === "PGRST202") return fetchLegacyDashboardSnapshot(client, input);
  if (error) throw new Error(`Could not read the dashboard snapshot: ${error.message}`);
  return data as DashboardSnapshot;
}

async function fetchLegacyDashboardSnapshot(client: SupabaseClient, input: { vertical?: string }): Promise<DashboardSnapshot> {
  const [verticalRows, courseRows, flagRows, snapshotRows, metadataRows, conflictRows] = await Promise.all([
    fetchAllRows(client, "verticals", "id,slug"),
    fetchAllRows(client, "courses", "id,app_id,title,primary_vertical_id,management_classification,health_status,next_review_date,owner_name,metadata_completeness_score,reconciliation_status,retrieval_status,import_validation_errors", (query) => query.is("archived_at", null)),
    fetchAllRows(client, "course_flags", "course_id", (query) => query.is("archived_at", null)),
    fetchAllRows(client, "lms_snapshots", "course_id", (query) => query.eq("is_current", true)),
    fetchAllRows(client, "content_metadata_records", "course_id", (query) => query.eq("is_current", true).eq("is_importable", true)),
    fetchAllRows(client, "field_comparisons", "course_id", (query) => query.eq("comparison_status", "Conflict").is("selected_source", null)),
  ]);
  const verticalById = new Map(verticalRows.map((row) => [row.id as string, row.slug as string]));
  const countByCourse = (rows: Row[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.course_id as string, (counts.get(row.course_id as string) ?? 0) + 1);
    return counts;
  };
  const flagCounts = countByCourse(flagRows);
  const conflictCounts = countByCourse(conflictRows);
  const lmsCourseIds = new Set(snapshotRows.map((row) => row.course_id as string));
  const metadataCourseIds = new Set(metadataRows.map((row) => row.course_id as string));
  const courses = courseRows.map((row) => {
    const databaseId = row.id as string;
    return {
      id: row.app_id as string,
      title: row.title as string,
      verticals: [SLUG_TO_VERTICAL[verticalById.get(row.primary_vertical_id as string) ?? ""]].filter((value): value is Vertical => Boolean(value)),
      managementClassification: row.management_classification as Course["managementClassification"],
      healthStatus: row.health_status as Course["healthStatus"],
      nextReviewDate: (row.next_review_date as string) ?? null,
      owner: (row.owner_name as string) ?? null,
      metadataCompletenessScore: Number(row.metadata_completeness_score ?? 0),
      retrievalStatus: row.retrieval_status as Course["retrievalStatus"],
      validationCount: Array.isArray(row.import_validation_errors) ? row.import_validation_errors.length : 0,
      hasLms: lmsCourseIds.has(databaseId),
      hasMetadata: metadataCourseIds.has(databaseId),
      conflictCount: conflictCounts.get(databaseId) ?? 0,
      flagCount: flagCounts.get(databaseId) ?? 0,
    };
  });
  const portfolio = courses;
  const filtered = !input.vertical || input.vertical === "All verticals" ? portfolio : portfolio.filter((course) => course.verticals.includes(input.vertical as Vertical));
  const queueCourse = (course: (typeof courses)[number]): DashboardQueueCourse => ({
    id: course.id, title: course.title, verticals: course.verticals, owner: course.owner,
    nextReviewDate: course.nextReviewDate, healthStatus: course.healthStatus, flagCount: course.flagCount,
    metadataCompletenessScore: course.metadataCompletenessScore,
  });
  return {
    degradedMode: true,
    metrics: {
      totalLmsRetrieved: courses.filter((course) => course.hasLms).length,
      lexipolManaged: portfolio.filter((course) => course.managementClassification === "Lexipol managed").length,
      unmanaged: portfolio.filter((course) => course.managementClassification === "Unclassified").length,
      verticalUnclassified: portfolio.filter((course) => course.managementClassification === "Lexipol managed" && course.verticals.length === 0).length,
      missingContentMetadata: portfolio.filter((course) => course.hasLms && !course.hasMetadata).length,
      notLmsLinked: portfolio.filter((course) => !course.hasLms).length,
      unresolvedConflicts: portfolio.filter((course) => course.conflictCount > 0).length,
      mappingRequired: 0,
      staleLms: portfolio.filter((course) => ["Stale Data", "Retrieval Failed"].includes(course.retrievalStatus)).length,
      importValidationErrors: portfolio.reduce((total, course) => total + course.validationCount, 0),
    },
    coursesInView: filtered.length,
    verticalMemberships: portfolio.filter((course) => course.managementClassification === "Lexipol managed").reduce((count, course) => count + course.verticals.length, 0),
    verticalData: verticals.map((name) => ({ name, courses: portfolio.filter((course) => course.managementClassification === "Lexipol managed" && course.verticals.includes(name)).length })),
    healthData: (["Healthy", "Monitor", "Needs Review", "At Risk", "Critical"] as Course["healthStatus"][]).map((name) => ({ name, value: filtered.filter((course) => course.healthStatus === name).length })),
    reviewQueue: filtered.filter((course) => course.nextReviewDate).sort((left, right) => (left.nextReviewDate ?? "").localeCompare(right.nextReviewDate ?? "") || left.id.localeCompare(right.id)).slice(0, 5).map(queueCourse),
    riskQueue: filtered.filter((course) => ["Critical", "At Risk"].includes(course.healthStatus)).sort((left, right) => (left.healthStatus === right.healthStatus ? right.flagCount - left.flagCount : left.healthStatus === "Critical" ? -1 : 1) || left.id.localeCompare(right.id)).slice(0, 5).map(queueCourse),
  };
}

export async function fetchPortfolioSummaries(client: SupabaseClient): Promise<PortfolioSummary[]> {
  const [
    verticalRows,
    courseRows,
    courseVerticalRows,
    flagRows,
    snapshotRows,
    metadataRows,
    conflictRows,
    topicRows,
    tagRows,
  ] = await Promise.all([
    fetchAllRows(client, "verticals", "id,slug"),
    fetchAllRows(
      client,
      "courses",
      "id,app_id,title,short_title,course_code,lms_course_id,description,primary_vertical_id,management_classification,reconciliation_status,retrieval_status,last_retrieved_at,health_status,lifecycle_status,primary_topic,owner_name,duration_minutes,data_source,content_update_type,next_review_date,metadata_completeness_score,source_difference_count,import_validation_errors,backend_link,frontend_link",
    ),
    fetchAllRows(client, "course_verticals", "course_id,vertical_id"),
    fetchAllRows(client, "course_flags", "course_id", (query) => query.is("archived_at", null)),
    fetchAllRows(client, "lms_snapshots", "course_id", (query) => query.eq("is_current", true)),
    fetchAllRows(client, "content_metadata_records", "course_id,normalized_payload", (query) => query.eq("is_current", true).eq("is_importable", true)),
    fetchAllRows(
      client,
      "field_comparisons",
      "course_id",
      (query) => query.eq("comparison_status", "Conflict").is("selected_source", null),
    ),
    fetchAllRows(client, "course_topics", "course_id,topics(display_label)"),
    fetchAllRows(client, "course_tags", "course_id,tags(display_label)"),
  ]);

  const verticalById = new Map(verticalRows.map((row) => [row.id as string, row.slug as string]));
  const verticalsByCourse = groupBy(courseVerticalRows, "course_id");
  const countByCourse = (rows: Row[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const id = row.course_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  };
  const flagCounts = countByCourse(flagRows);
  const conflictCounts = countByCourse(conflictRows);
  const snapshotCourseIds = new Set(snapshotRows.map((row) => row.course_id as string));
  const metadataCourseIds = new Set(metadataRows.map((row) => row.course_id as string));
  const metadataByCourse = new Map(metadataRows.map((row) => [row.course_id as string, row.normalized_payload as ContentMetadataRecord]));
  const topicsByCourse = new Map<string, { topic: string }[]>();
  for (const row of topicRows) {
    const courseId = row.course_id as string;
    const topic = (row.topics as { display_label?: string } | null)?.display_label;
    if (!topic) continue;
    const list = topicsByCourse.get(courseId) ?? [];
    list.push({ topic });
    topicsByCourse.set(courseId, list);
  }
  const tagsByCourse = new Map<string, string[]>();
  for (const row of tagRows) {
    const courseId = row.course_id as string;
    const tag = (row.tags as { display_label?: string } | null)?.display_label;
    if (!tag) continue;
    const list = tagsByCourse.get(courseId) ?? [];
    list.push(tag);
    tagsByCourse.set(courseId, list);
  }

  return courseRows.map((row) => {
    const courseDbId = row.id as string;
    const appId = row.app_id as string;
    return {
      id: appId,
      title: row.title as string,
      shortTitle: row.short_title as string,
      courseCode: row.course_code as string,
      lmsCourseId: (row.lms_course_id as string) ?? null,
      description: row.description as string,
      verticals: (verticalsByCourse.get(courseDbId) ?? [])
        .map((entry) => SLUG_TO_VERTICAL[verticalById.get(entry.vertical_id as string) ?? ""])
        .filter((value): value is Vertical => Boolean(value))
        .filter((value, index, all) => all.indexOf(value) === index)
        .sort((left, right) => verticals.indexOf(left) - verticals.indexOf(right)),
      managementClassification: row.management_classification as Course["managementClassification"],
      lmsLinkStatus: snapshotCourseIds.has(courseDbId) ? "linked" : "not_linked",
      retrievalStatus: row.retrieval_status as Course["retrievalStatus"],
      lastRetrievedAt: (row.last_retrieved_at as string) ?? null,
      healthStatus: calculateCourseHealth({
        metadataCompletenessScore: calculateMetadataCompleteness(metadataByCourse.get(courseDbId)),
        unresolvedConflictCount: conflictCounts.get(courseDbId) ?? 0,
        nextReviewDate: (row.next_review_date as string) ?? null,
      }).status,
      lifecycleStatus: row.lifecycle_status as Course["lifecycleStatus"],
      primaryTopic: row.primary_topic as string,
      tags: tagsByCourse.get(courseDbId) ?? [],
      owner: (row.owner_name as string) ?? null,
      durationMinutes: row.duration_minutes === null || row.duration_minutes === undefined ? null : Number(row.duration_minutes),
      dataSource: row.data_source as Course["dataSource"],
      updateType: (row.content_update_type as string) ?? metadataByCourse.get(courseDbId)?.updateType ?? null,
      nextReviewDate: (row.next_review_date as string) ?? null,
      metadataCompletenessScore: calculateMetadataCompleteness(metadataByCourse.get(courseDbId)),
      conflictCount: conflictCounts.get(courseDbId) ?? 0,
      sourceDifferenceCount: Number(row.source_difference_count ?? 0),
      flagCount: flagCounts.get(courseDbId) ?? 0,
      hasLmsSnapshot: snapshotCourseIds.has(courseDbId),
      hasContentMetadata: metadataCourseIds.has(courseDbId),
      importValidationErrorCount: ((row.import_validation_errors as string[]) ?? []).length,
      topicAssignments: topicsByCourse.get(courseDbId) ?? [],
      backendLink: (row.backend_link as string) ?? null,
      frontendLink: (row.frontend_link as string) ?? null,
    };
  });
}

export type CourseSummary = { courseId: string; courseTitle: string; courseCode: string };

export interface AccreditationBoardEntry {
  course: CourseSummary;
  record: AccreditationRecord;
}

export async function fetchAccreditationBoardPage(client: SupabaseClient, page = 1, pageSize = 100): Promise<{ items: AccreditationBoardEntry[]; total: number }> {
  const from = (Math.max(1, page) - 1) * pageSize;
  const { data, error, count } = await client.from("accreditation_records").select(
    "id,course_id,organization,jurisdiction,status,approval_number,topic_number,credit_hours,effective_date,expiration_date,risk_reasons,data_source,provenance,origin_provenance,source_domain,source_transport,source_normalized_payload,alignment_status,alignment_confirmed_by_email,alignment_confirmed_at,alignment_confirmation_note,created_at,updated_at,archived_at,courses!inner(app_id,title,course_code)",
    { count: "exact" },
  ).order("course_id", { ascending: true }).order("expiration_date", { ascending: true, nullsFirst: false }).order("id", { ascending: true }).range(from, from + pageSize - 1);
  if (error) throw new Error(`Could not read the accreditation page: ${error.message}`);
  const items = ((data ?? []) as Row[]).map((row) => {
    const course = row.courses as { app_id: string; title: string; course_code: string };
    return { course: { courseId: course.app_id, courseTitle: course.title, courseCode: course.course_code }, record: {
      id: row.id as string, organization: row.organization as string, jurisdiction: (row.jurisdiction as string) ?? "", status: row.status as AccreditationRecord["status"],
      approvalNumber: (row.approval_number as string) ?? null, topicNumber: (row.topic_number as string) ?? null, creditHours: Number(row.credit_hours ?? 0),
      effectiveDate: (row.effective_date as string) ?? null, expirationDate: (row.expiration_date as string) ?? null, source: toProvenance(row.provenance ?? row.data_source),
      riskReasons: (row.risk_reasons as string[]) ?? [], createdAt: row.created_at as string, updatedAt: row.updated_at as string, archivedAt: (row.archived_at as string) ?? null,
      originProvenance: toProvenance(row.origin_provenance ?? row.provenance ?? row.data_source), sourceDomain: (row.source_domain as AccreditationRecord["sourceDomain"]) ?? "coursetrack",
      sourceTransport: (row.source_transport as AccreditationRecord["sourceTransport"]) ?? "manual", sourceNormalizedValues: (row.source_normalized_payload as AccreditationRecord["sourceNormalizedValues"]) ?? {},
      alignmentStatus: (row.alignment_status as AccreditationRecord["alignmentStatus"]) ?? "App only", confirmationActor: (row.alignment_confirmed_by_email as string) ?? null,
      confirmationTime: (row.alignment_confirmed_at as string) ?? null, confirmationNote: (row.alignment_confirmation_note as string) ?? null,
    } } satisfies AccreditationBoardEntry;
  });
  return { items, total: count ?? 0 };
}

export async function fetchAccreditationBoard(client: SupabaseClient): Promise<AccreditationBoardEntry[]> {
  const rows = await fetchAllRows(
    client,
    "accreditation_records",
    "id,organization,jurisdiction,status,approval_number,topic_number,credit_hours,effective_date,expiration_date,risk_reasons,data_source,provenance,origin_provenance,source_domain,source_transport,source_normalized_payload,alignment_status,alignment_confirmed_by_email,alignment_confirmed_at,alignment_confirmation_note,created_at,updated_at,archived_at,courses(app_id,title,course_code)",
  );
  return rows
    .filter((row) => row.courses)
    .map((row) => {
      const course = row.courses as { app_id: string; title: string; course_code: string };
      return {
        course: { courseId: course.app_id, courseTitle: course.title, courseCode: course.course_code },
        record: {
          id: row.id as string,
          organization: row.organization as string,
          jurisdiction: (row.jurisdiction as string) ?? "",
          status: row.status as AccreditationRecord["status"],
          approvalNumber: (row.approval_number as string) ?? null,
          topicNumber: (row.topic_number as string) ?? null,
          creditHours: Number(row.credit_hours ?? 0),
          effectiveDate: (row.effective_date as string) ?? null,
          expirationDate: (row.expiration_date as string) ?? null,
          source: toProvenance(row.provenance ?? row.data_source),
          riskReasons: (row.risk_reasons as string[]) ?? [],
          createdAt: (row.created_at as string) ?? undefined,
          updatedAt: (row.updated_at as string) ?? undefined,
          archivedAt: (row.archived_at as string) ?? null,
          originProvenance: toProvenance(row.origin_provenance ?? row.provenance ?? row.data_source),
          sourceDomain: (row.source_domain as AccreditationRecord["sourceDomain"]) ?? "coursetrack",
          sourceTransport: (row.source_transport as AccreditationRecord["sourceTransport"]) ?? "manual",
          sourceNormalizedValues: (row.source_normalized_payload as AccreditationRecord["sourceNormalizedValues"]) ?? {},
          alignmentStatus: (row.alignment_status as AccreditationRecord["alignmentStatus"]) ?? "App only",
          confirmationActor: (row.alignment_confirmed_by_email as string) ?? null,
          confirmationTime: (row.alignment_confirmed_at as string) ?? null,
          confirmationNote: (row.alignment_confirmation_note as string) ?? null,
        },
      };
    });
}

export interface VersionBoardEntry {
  course: CourseSummary;
  version: CourseVersion;
}

export async function fetchVersionBoardPage(client: SupabaseClient, page = 1, pageSize = 100): Promise<{ items: VersionBoardEntry[]; total: number }> {
  const from = (Math.max(1, page) - 1) * pageSize;
  const { data, error, count } = await client.from("course_versions").select(
    "id,version_number,version_type,publication_date,is_current,authoring_tool,package_standard,release_notes,managed_by,created_by_email,version_status,provenance,origin_provenance,created_at,updated_at,archived_at,courses!inner(app_id,title,course_code)",
    { count: "exact" },
  ).order("publication_date", { ascending: false }).order("id", { ascending: true }).range(from, from + pageSize - 1);
  if (error) throw new Error(`Could not read the version page: ${error.message}`);
  const versionRows = (data ?? []) as Row[];
  const ids = versionRows.map((row) => row.id as string);
  const wrikeRefRows = ids.length ? await fetchAllRows(client, "version_wrike_task_references", "id,course_version_id,external_task_id,task_title,external_project_id,project_title,task_status,assignee_names,due_date,permalink,provider_name,retrieved_at,linked_by_email,linked_at,link_method,last_verified_at,updated_at,wrike_published_date", (query) => query.in("course_version_id", ids).is("unlinked_at", null)) : [];
  const refs = groupBy(wrikeRefRows, "course_version_id");
  const items = versionRows.map((row) => { const course = row.courses as { app_id: string; title: string; course_code: string }; return { course: { courseId: course.app_id, courseTitle: course.title, courseCode: course.course_code }, version: buildVersion(row, refs) }; });
  return { items, total: count ?? 0 };
}

export async function fetchVersionBoard(client: SupabaseClient): Promise<VersionBoardEntry[]> {
  const [versionRows, wrikeRefRows] = await Promise.all([
    fetchAllRows(
      client,
      "course_versions",
      "id,version_number,version_type,publication_date,is_current,authoring_tool,package_standard,release_notes,managed_by,created_by_email,version_status,provenance,origin_provenance,created_at,updated_at,archived_at,courses(app_id,title,course_code)",
    ),
    fetchAllRows(
      client,
      "version_wrike_task_references",
      "id,course_version_id,external_task_id,task_title,external_project_id,project_title,task_status,assignee_names,due_date,permalink,provider_name,retrieved_at,linked_by_email,linked_at,link_method,last_verified_at,updated_at,wrike_published_date",
      (query) => query.is("unlinked_at", null),
    ),
  ]);
  const wrikeRefsByVersion = groupBy(wrikeRefRows, "course_version_id");
  return versionRows
    .filter((row) => row.courses)
    .map((row) => {
      const course = row.courses as { app_id: string; title: string; course_code: string };
      return {
        course: { courseId: course.app_id, courseTitle: course.title, courseCode: course.course_code },
        version: buildVersion(row, wrikeRefsByVersion),
      };
    });
}

export interface RevampBoardEntry {
  course: CourseSummary & { verticals: Vertical[] };
  proposal: RevampProposal;
}

export async function fetchRevampBoard(client: SupabaseClient): Promise<RevampBoardEntry[]> {
  const [proposalRows, verticalRows, membershipRows] = await Promise.all([
    fetchAllRows(
      client,
      "revamp_proposals",
      "id,title,status,bucket_key,sort_order,priority,score,business_justification,target_publication_date,provenance,updated_at,archived_at,courses(id,app_id,title,course_code)",
      undefined,
    ),
    fetchAllRows(client, "verticals", "id,slug"),
    fetchAllRows(client, "course_verticals", "course_id,vertical_id"),
  ]);
  const verticalById = new Map(verticalRows.map((row) => [row.id as string, row.slug as string]));
  const membershipsByCourse = groupBy(membershipRows, "course_id");
  return proposalRows
    .filter((row) => row.courses)
    .map((row) => {
      const course = row.courses as {
        id: string;
        app_id: string;
        title: string;
        course_code: string;
      };
      return {
        course: {
          courseId: course.app_id,
          courseTitle: course.title,
          courseCode: course.course_code,
          verticals: (membershipsByCourse.get(course.id) ?? [])
            .map((membership) => SLUG_TO_VERTICAL[verticalById.get(membership.vertical_id as string) ?? ""])
            .filter((vertical): vertical is Vertical => Boolean(vertical)),
        },
        proposal: {
          id: row.id as string,
          title: row.title as string,
          status: row.status as RevampProposal["status"],
          priority: row.priority as RevampProposal["priority"],
          score: Number(row.score),
          targetPublicationDate: (row.target_publication_date as string) ?? null,
          businessJustification: row.business_justification as string,
          bucket: row.bucket_key as RevampProposal["bucket"],
          sortOrder: Number(row.sort_order ?? 0),
          updatedAt: (row.updated_at as string) ?? undefined,
          archivedAt: (row.archived_at as string) ?? null,
          provenance: toProvenance(row.provenance),
        },
      };
    });
}

export interface FlagBoardEntry {
  course: CourseSummary;
  flag: CourseFlag;
}

export async function fetchFlagBoard(client: SupabaseClient): Promise<FlagBoardEntry[]> {
  const [rows, profileRows] = await Promise.all([
    fetchAllRows(
      client,
      "course_flags",
      "id,record_kind,type,title,description,priority,status,owner_id,due_date,completion_notes,completed_by,completed_at,resolved_by,resolved_at,created_by,created_at,updated_by,updated_at,provenance,archived_at,courses(app_id,title,course_code)",
    ),
    fetchAllRows(client, "profiles", "id,display_name,email"),
  ]);
  const profileById = new Map(profileRows.map((row) => [String(row.id), row]));
  return rows
    .filter((row) => row.courses)
    .map((row) => {
      const course = row.courses as { app_id: string; title: string; course_code: string };
      return {
        course: { courseId: course.app_id, courseTitle: course.title, courseCode: course.course_code },
        flag: buildTaskCallout(row, profileById),
      };
    });
}

export interface PortfolioReportMetrics {
  totalCourses: number;
  coursesWithAccreditationExpiration: number;
  coursesDueForReview: number;
  coursesWithRevampProposal: number;
  totalOpenFlags: number;
  coursesBelowCompletenessThreshold: number;
  coursesWithLmsRetrievalExceptions: number;
}

export async function fetchReportMetrics(
  client: SupabaseClient,
  reviewDueBy: string,
): Promise<PortfolioReportMetrics> {
  const count = async (modify: (query: SupabaseQuery) => SupabaseQuery): Promise<number> => {
    const { count: result, error } = await modify(
      client.from("courses").select("id", { count: "exact", head: true }).is("archived_at", null),
    );
    if (error) throw new Error(`Could not count courses: ${error.message}`);
    return result ?? 0;
  };
  const countDistinctCourseIds = async (table: string, modify: (query: SupabaseQuery) => SupabaseQuery) => {
    const rows = await fetchAllRows(client, table, "course_id", modify);
    return new Set(rows.map((row) => row.course_id)).size;
  };

  const [
    totalCourses,
    coursesWithAccreditationExpiration,
    coursesDueForReview,
    coursesWithRevampProposal,
    totalOpenFlags,
    coursesBelowCompletenessThreshold,
    coursesWithLmsRetrievalExceptions,
  ] = await Promise.all([
    count((query) => query),
    countDistinctCourseIds("accreditation_records", (query) => query.not("expiration_date", "is", null).is("archived_at", null)),
    count((query) => query.lte("next_review_date", reviewDueBy)),
    countDistinctCourseIds("revamp_proposals", (query) => query.is("archived_at", null)),
    fetchAllRows(client, "course_flags", "id", (query) =>
      query.is("archived_at", null).not("status", "in", '("Completed","Resolved")'),
    ).then((rows) => rows.length),
    count((query) => query.lt("metadata_completeness_score", 80)),
    count((query) => query.neq("retrieval_status", "Retrieved")),
  ]);

  return {
    totalCourses,
    coursesWithAccreditationExpiration,
    coursesDueForReview,
    coursesWithRevampProposal,
    totalOpenFlags,
    coursesBelowCompletenessThreshold,
    coursesWithLmsRetrievalExceptions,
  };
}

export interface TaxonomySummary {
  id: string;
  label: string;
  courseCount: number;
}

export interface TaxonomyCourseEntry {
  assignmentId: string;
  courseId: string;
  title: string;
  courseCode: string;
}

async function fetchTaxonomySummaries(
  client: SupabaseClient,
  entityTable: "topics" | "tags",
  assignmentTable: "course_topics" | "course_tags",
  foreignKey: "topic_id" | "tag_id",
): Promise<TaxonomySummary[]> {
  const [entityRows, assignmentRows] = await Promise.all([
    fetchAllRows(client, entityTable, "id,display_label"),
    fetchAllRows(client, assignmentTable, foreignKey),
  ]);
  const counts = new Map<string, number>();
  for (const row of assignmentRows) {
    const id = row[foreignKey] as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return entityRows
    .map((row) => ({
      id: row.id as string,
      label: row.display_label as string,
      courseCount: counts.get(row.id as string) ?? 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function fetchAllTopics(client: SupabaseClient): Promise<TaxonomySummary[]> {
  return fetchTaxonomySummaries(client, "topics", "course_topics", "topic_id");
}

export function fetchAllTags(client: SupabaseClient): Promise<TaxonomySummary[]> {
  return fetchTaxonomySummaries(client, "tags", "course_tags", "tag_id");
}

async function fetchCoursesForTaxonomy(
  client: SupabaseClient,
  assignmentTable: "course_topics" | "course_tags",
  foreignKey: "topic_id" | "tag_id",
  entityId: string,
): Promise<TaxonomyCourseEntry[]> {
  const rows = await fetchAllRows(
    client,
    assignmentTable,
    "id,course_id,courses(app_id,title,course_code)",
    (query) => query.eq(foreignKey, entityId),
  );
  return rows
    .map((row) => {
      const course = row.courses as { app_id?: string; title?: string; course_code?: string } | null;
      if (!course?.app_id) return null;
      return {
        assignmentId: row.id as string,
        courseId: course.app_id,
        title: course.title ?? "",
        courseCode: course.course_code ?? "",
      };
    })
    .filter((entry): entry is TaxonomyCourseEntry => entry !== null);
}

export function fetchCoursesForTopic(client: SupabaseClient, topicId: string): Promise<TaxonomyCourseEntry[]> {
  return fetchCoursesForTaxonomy(client, "course_topics", "topic_id", topicId);
}

export function fetchCoursesForTag(client: SupabaseClient, tagId: string): Promise<TaxonomyCourseEntry[]> {
  return fetchCoursesForTaxonomy(client, "course_tags", "tag_id", tagId);
}
