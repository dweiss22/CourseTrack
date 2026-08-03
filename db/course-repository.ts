import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccreditationRecord,
  AuditHistoryRecord,
  Course,
  CourseFlag,
  CourseNote,
  CourseRelationship,
  CourseTopicAssignment,
  CourseVersion,
  ContentMetadataRecord,
  FieldComparison,
  LmsCourseSnapshot,
  ResolvedCourseFields,
  RevampProposal,
  SourceHistoryRecord,
  Vertical,
  VerticalAssignment,
  VersionWrikeTaskReference,
} from "@/types/course";
import { verticals } from "@/types/course";

const PAGE_SIZE = 1000;
const SLUG_TO_VERTICAL: Record<string, Vertical> = Object.fromEntries(
  verticals.map((vertical) => [vertical.toLowerCase(), vertical]),
);

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseQuery = any;

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
    relationshipRows,
    auditLogRows,
  ] = await Promise.all([
    fetchAllRows(client, "verticals", "id,slug"),
    fetchAllRows(client, "lms_retrieval_runs", "id,external_run_id"),
    fetchAllRows(
      client,
      "courses",
      "id,app_id,course_code,lms_course_id,management_classification,monitoring_enabled,reconciliation_status,resolved_fields,source_timestamps,mapping_warnings,import_validation_errors,title,short_title,description,learning_audience,primary_vertical_id,primary_topic,tags,lifecycle_status,publication_status,delivery_format,duration_minutes,authoring_tool,state_code,owner_name,instructional_designer_name,current_version,original_publish_date,last_major_revision_date,next_review_date,health_status,health_score,metadata_completeness_score,internal_summary,source_system,data_source,retrieval_status,last_retrieved_at,is_sample",
      (query) => (courseDbId ? query.eq("id", courseDbId) : query),
    ),
    fetchAllRows(client, "course_verticals", "course_id,vertical_id,relationship_type", byCourse),
    fetchAllRows(
      client,
      "course_versions",
      "id,course_id,version_number,version_type,publication_date,is_current,authoring_tool,package_standard,release_notes,managed_by,created_by_email,version_status",
      byCourse,
    ),
    fetchAllRows(
      client,
      "version_wrike_task_references",
      "id,course_version_id,external_task_id,task_title,external_project_id,project_title,task_status,assignee_names,due_date,permalink,provider_name,retrieved_at,linked_by_email,linked_at",
    ),
    fetchAllRows(
      client,
      "accreditation_records",
      "id,course_id,organization,jurisdiction,status,approval_number,credit_hours,effective_date,expiration_date,risk_reasons,data_source",
      byCourse,
    ),
    fetchAllRows(
      client,
      "course_flags",
      "id,course_id,type,title,priority,status,owner_id,due_date",
      byCourse,
    ),
    fetchAllRows(client, "notes", "id,course_id,note_type,visibility,body,created_at", byCourse),
    fetchAllRows(
      client,
      "revamp_proposals",
      "id,course_id,title,status,priority,score,business_justification,target_publication_date",
      byCourse,
    ),
    fetchAllRows(
      client,
      "lms_snapshots",
      "id,course_id,provider,external_id,retrieved_at,normalized_payload,raw_payload,mapping_warnings",
      (query) => byCourse(query).eq("is_current", true),
    ),
    fetchAllRows(client, "content_metadata_records", "course_id,normalized_payload", byCourse),
    fetchAllRows(
      client,
      "field_comparisons",
      "course_id,field_key,field_label,lms_raw_value,lms_normalized_value,content_metadata_raw_value,content_metadata_normalized_value,resolved_value,selected_source,comparison_status,resolution_reason,resolved_by_email,resolved_at,last_compared_at",
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
      "course_relationships",
      "id,course_id,relationship_type,related_course_id,related_lms_course_id,source,validation_status",
      byCourse,
    ),
    fetchAllRows(client, "audit_logs", "id,record_id,record_type,action,actor_email,reason,created_at", (query) =>
      query.in("record_type", ["course", "field_comparison"]),
    ),
  ]);

  const verticalById = new Map(verticalRows.map((row) => [row.id as string, row.slug as string]));
  const retrievalRunIdByDbId = new Map(
    retrievalRunRows.map((row) => [row.id as string, (row.external_run_id as string) ?? (row.id as string)]),
  );
  const courseTitleByDbId = new Map(courseRows.map((row) => [row.id as string, row.title as string]));
  const courseAppIdByDbId = new Map(courseRows.map((row) => [row.id as string, row.app_id as string]));

  const secondaryVerticalsByCourse = groupBy(courseVerticalRows, "course_id");
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
    secondaryVerticalsByCourse,
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
    relationshipsByCourse,
    auditLogsByAppId,
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
  secondaryVerticalsByCourse: Map<string, Row[]>;
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
  relationshipsByCourse: Map<string, Row[]>;
  auditLogsByAppId: Map<string, Row[]>;
}

function buildCourseFromRows(row: Row, maps: GraphMaps): Course {
  const courseDbId = row.id as string;
  const appId = row.app_id as string;
  const primaryVertical = SLUG_TO_VERTICAL[maps.verticalById.get(row.primary_vertical_id as string) ?? ""];

  const secondaryVerticals = (maps.secondaryVerticalsByCourse.get(courseDbId) ?? [])
    .map((entry) => SLUG_TO_VERTICAL[maps.verticalById.get(entry.vertical_id as string) ?? ""])
    .filter((vertical): vertical is Vertical => Boolean(vertical));

  const versions: CourseVersion[] = (maps.versionsByCourse.get(courseDbId) ?? [])
    .map((version) => buildVersion(version, maps.wrikeRefsByVersion))
    .sort((a, b) => a.publicationDate.localeCompare(b.publicationDate));

  const accreditations: AccreditationRecord[] = (maps.accreditationsByCourse.get(courseDbId) ?? []).map(
    (record) => ({
      id: record.id as string,
      organization: record.organization as string,
      jurisdiction: (record.jurisdiction as string) ?? "National",
      status: record.status as AccreditationRecord["status"],
      approvalNumber: (record.approval_number as string) ?? null,
      creditHours: Number(record.credit_hours ?? 0),
      effectiveDate: (record.effective_date as string) ?? null,
      expirationDate: (record.expiration_date as string) ?? null,
      source: record.data_source as AccreditationRecord["source"],
      riskReasons: (record.risk_reasons as string[]) ?? [],
    }),
  );

  const flags: CourseFlag[] = (maps.flagsByCourse.get(courseDbId) ?? []).map((flag) => ({
    id: flag.id as string,
    type: flag.type as string,
    title: flag.title as string,
    priority: flag.priority as CourseFlag["priority"],
    status: flag.status as CourseFlag["status"],
    owner: (flag.owner_id as string) ?? null,
    dueDate: (flag.due_date as string) ?? null,
  }));

  const notes: CourseNote[] = (maps.notesByCourse.get(courseDbId) ?? []).map((note) => ({
    id: note.id as string,
    type: note.note_type as string,
    author: "CourseTrack Import",
    createdAt: note.created_at as string,
    visibility: note.visibility as CourseNote["visibility"],
    body: note.body as string,
  }));

  const revampRow = (maps.revampByCourse.get(courseDbId) ?? [])[0];
  const revampProposal: RevampProposal | null = revampRow
    ? {
        id: revampRow.id as string,
        title: revampRow.title as string,
        status: revampRow.status as RevampProposal["status"],
        priority: revampRow.priority as RevampProposal["priority"],
        score: Number(revampRow.score),
        targetPublicationDate: (revampRow.target_publication_date as string) ?? null,
        businessJustification: revampRow.business_justification as string,
      }
    : null;

  const snapshotRow = (maps.snapshotByCourse.get(courseDbId) ?? [])[0];
  const lmsSnapshot: LmsCourseSnapshot | null = snapshotRow
    ? {
        id: `${appId}-SNAPSHOT-1`,
        retrievalRunId: maps.retrievalRunIdByDbId.get(snapshotRow.id as string) ?? "",
        provider: snapshotRow.provider as string,
        lmsCourseId: snapshotRow.external_id as string,
        retrievedAt: snapshotRow.retrieved_at as string,
        isCurrent: true,
        rawPayload: (snapshotRow.raw_payload as Record<string, unknown>) ?? {},
        normalized: snapshotRow.normalized_payload as LmsCourseSnapshot["normalized"],
        mappingWarnings: (snapshotRow.mapping_warnings as string[]) ?? [],
      }
    : null;

  const metadataRow = (maps.metadataRecordByCourse.get(courseDbId) ?? [])[0];
  const contentMetadata = (metadataRow?.normalized_payload as ContentMetadataRecord) ?? {
    id: `${appId}-METADATA`,
    importRunId: "content-metadata-import",
    importedAt: row.last_retrieved_at as string,
    rawCourseId: null,
    lmsCourseId: row.lms_course_id as string,
    courseName: row.title as string,
    contentType: null,
    durationMinutes: row.duration_minutes as number,
    trainingCredits: { rawDisplay: null, amount: null, unit: null },
    published: row.publication_status === "Published",
    authoringTool: (row.authoring_tool as string) ?? null,
    description: row.description as string,
    backendLink: null,
    frontendLink: null,
    publishedDate: row.original_publish_date as string,
    updateType: null,
    updatedRawValue: null,
    verticals: [primaryVertical],
    parentCourseIds: [],
    childCourseIds: [],
    notes: null,
    rawPayload: {},
    mappingWarnings: [],
    validationErrors: [],
  };

  const fieldComparisons: FieldComparison[] = (maps.fieldComparisonsByCourse.get(courseDbId) ?? []).map(
    (comparison) => ({
      fieldKey: comparison.field_key as string,
      fieldLabel: comparison.field_label as string,
      lmsRawValue: comparison.lms_raw_value,
      lmsNormalizedValue: comparison.lms_normalized_value,
      contentMetadataRawValue: comparison.content_metadata_raw_value,
      contentMetadataNormalizedValue: comparison.content_metadata_normalized_value,
      resolvedValue: comparison.resolved_value,
      selectedSource: comparison.selected_source as FieldComparison["selectedSource"],
      comparisonStatus: comparison.comparison_status as FieldComparison["comparisonStatus"],
      resolutionReason: (comparison.resolution_reason as string) ?? null,
      resolvedBy: (comparison.resolved_by_email as string) ?? null,
      resolvedAt: (comparison.resolved_at as string) ?? null,
      lastComparedAt: comparison.last_compared_at as string,
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
    primaryVertical,
    secondaryVerticals,
    metadataVerticals: contentMetadata.verticals,
    mappedVerticals: lmsSnapshot?.normalized.mappedVerticals ?? [],
  });

  const conflictCount = fieldComparisons.filter(
    (comparison) => comparison.comparisonStatus === "Conflict" && !comparison.selectedSource,
  ).length;
  const accreditationStatus = accreditations[0]?.status ?? "Not Required";
  const nearestAccreditationExpiration =
    accreditations
      .map((record) => record.expirationDate)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
  const currentVersion = versions.find((version) => version.isCurrent)?.versionNumber ?? (row.current_version as string) ?? "1.0";

  const importHistory: SourceHistoryRecord[] = [
    {
      id: `${appId}-IMPORT-METADATA`,
      source: "Content Metadata",
      runId: "content-metadata-import",
      status: contentMetadata.validationErrors.length > 0 ? "Succeeded with warnings" : "Succeeded",
      occurredAt: contentMetadata.importedAt,
      summary: "Course metadata imported from LMS new list - master.xlsx.",
    },
    ...(topicAssignments.some((assignment) => assignment.source === "Topics import")
      ? [
          {
            id: `${appId}-IMPORT-TOPICS`,
            source: "Topics" as const,
            runId: "topics-import",
            status: "Succeeded" as const,
            occurredAt: contentMetadata.importedAt,
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
    courseCode: row.course_code as string,
    lmsCourseId: (row.lms_course_id as string) ?? null,
    managementClassification: row.management_classification as Course["managementClassification"],
    monitoringEnabled: Boolean(row.monitoring_enabled),
    reconciliationStatus: row.reconciliation_status as Course["reconciliationStatus"],
    title: row.title as string,
    shortTitle: row.short_title as string,
    description: row.description as string,
    learningAudience: row.learning_audience as string,
    primaryVertical,
    secondaryVerticals,
    primaryTopic: row.primary_topic as string,
    tags: (row.tags as string[]) ?? [],
    lifecycleStatus: row.lifecycle_status as Course["lifecycleStatus"],
    publicationStatus: row.publication_status as Course["publicationStatus"],
    deliveryFormat: row.delivery_format as string,
    durationMinutes: Number(row.duration_minutes ?? 0),
    authoringTool: row.authoring_tool as string,
    stateCode: (row.state_code as string) ?? null,
    owner: (row.owner_name as string) ?? null,
    instructionalDesigner: (row.instructional_designer_name as string) ?? null,
    currentVersion,
    originalPublishDate: (row.original_publish_date as string) ?? null,
    lastMajorRevisionDate: (row.last_major_revision_date as string) ?? null,
    nextReviewDate: (row.next_review_date as string) ?? null,
    accreditationStatus,
    nearestAccreditationExpiration,
    healthStatus: row.health_status as Course["healthStatus"],
    healthScore: Number(row.health_score),
    metadataCompletenessScore: Number(row.metadata_completeness_score),
    dataSource: row.data_source as Course["dataSource"],
    sourceSystem: row.source_system as string,
    retrievalStatus: row.retrieval_status as Course["retrievalStatus"],
    lastRetrievedAt: (row.last_retrieved_at as string) ?? null,
    isSample: Boolean(row.is_sample),
    internalSummary: row.internal_summary as string,
    versions,
    accreditations,
    flags,
    notes,
    revampProposal,
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
    verticalAssignments,
    relationships,
    importHistory,
    retrievalHistory,
    auditHistory,
    conflictCount,
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
      isSample: true,
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
    createdAt: `${row.publication_date}T15:00:00.000Z`,
    createdBy: (row.created_by_email as string) ?? "CourseTrack import",
    releaseNotes: row.release_notes as string,
    authoringTool: row.authoring_tool as string,
    packageStandard: row.package_standard as string,
    wrikeTaskReferences,
  };
}

function buildVerticalAssignments(input: {
  primaryVertical: Vertical;
  secondaryVerticals: Vertical[];
  metadataVerticals: Vertical[];
  mappedVerticals: Vertical[];
}): VerticalAssignment[] {
  const assignedVerticals = [input.primaryVertical, ...input.secondaryVerticals];
  const assignments: VerticalAssignment[] = [
    ...assignedVerticals.map((vertical, index) => ({
      vertical,
      source: input.metadataVerticals.includes(vertical)
        ? ("Content Metadata" as const)
        : ("CourseTrack" as const),
      sourceValue: vertical,
      isPrimary: index === 0,
    })),
    ...input.mappedVerticals.map((vertical) => ({
      vertical,
      source: "LMS Site mapping" as const,
      sourceValue: vertical,
      isPrimary: vertical === input.primaryVertical,
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

export type CourseSummary = { courseId: string; courseTitle: string; courseCode: string };

export interface AccreditationBoardEntry {
  course: CourseSummary;
  record: AccreditationRecord;
}

export async function fetchAccreditationBoard(client: SupabaseClient): Promise<AccreditationBoardEntry[]> {
  const rows = await fetchAllRows(
    client,
    "accreditation_records",
    "id,organization,jurisdiction,status,approval_number,credit_hours,effective_date,expiration_date,risk_reasons,data_source,courses(app_id,title,course_code)",
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
          jurisdiction: (row.jurisdiction as string) ?? "National",
          status: row.status as AccreditationRecord["status"],
          approvalNumber: (row.approval_number as string) ?? null,
          creditHours: Number(row.credit_hours ?? 0),
          effectiveDate: (row.effective_date as string) ?? null,
          expirationDate: (row.expiration_date as string) ?? null,
          source: row.data_source as AccreditationRecord["source"],
          riskReasons: (row.risk_reasons as string[]) ?? [],
        },
      };
    });
}

export interface VersionBoardEntry {
  course: CourseSummary;
  version: CourseVersion;
}

export async function fetchVersionBoard(client: SupabaseClient): Promise<VersionBoardEntry[]> {
  const [versionRows, wrikeRefRows] = await Promise.all([
    fetchAllRows(
      client,
      "course_versions",
      "id,version_number,version_type,publication_date,is_current,authoring_tool,package_standard,release_notes,managed_by,created_by_email,version_status,courses(app_id,title,course_code)",
    ),
    fetchAllRows(
      client,
      "version_wrike_task_references",
      "id,course_version_id,external_task_id,task_title,external_project_id,project_title,task_status,assignee_names,due_date,permalink,provider_name,retrieved_at,linked_by_email,linked_at",
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
  course: CourseSummary & { primaryVertical: Vertical };
  proposal: RevampProposal;
}

export async function fetchRevampBoard(client: SupabaseClient): Promise<RevampBoardEntry[]> {
  const [proposalRows, verticalRows] = await Promise.all([
    fetchAllRows(
      client,
      "revamp_proposals",
      "id,title,status,priority,score,business_justification,target_publication_date,courses(app_id,title,course_code,primary_vertical_id)",
    ),
    fetchAllRows(client, "verticals", "id,slug"),
  ]);
  const verticalById = new Map(verticalRows.map((row) => [row.id as string, row.slug as string]));
  return proposalRows
    .filter((row) => row.courses)
    .map((row) => {
      const course = row.courses as {
        app_id: string;
        title: string;
        course_code: string;
        primary_vertical_id: string;
      };
      return {
        course: {
          courseId: course.app_id,
          courseTitle: course.title,
          courseCode: course.course_code,
          primaryVertical: SLUG_TO_VERTICAL[verticalById.get(course.primary_vertical_id) ?? ""],
        },
        proposal: {
          id: row.id as string,
          title: row.title as string,
          status: row.status as RevampProposal["status"],
          priority: row.priority as RevampProposal["priority"],
          score: Number(row.score),
          targetPublicationDate: (row.target_publication_date as string) ?? null,
          businessJustification: row.business_justification as string,
        },
      };
    });
}

export interface FlagBoardEntry {
  course: CourseSummary;
  flag: CourseFlag;
}

export async function fetchFlagBoard(client: SupabaseClient): Promise<FlagBoardEntry[]> {
  const rows = await fetchAllRows(
    client,
    "course_flags",
    "id,type,title,priority,status,owner_id,due_date,courses(app_id,title,course_code)",
  );
  return rows
    .filter((row) => row.courses)
    .map((row) => {
      const course = row.courses as { app_id: string; title: string; course_code: string };
      return {
        course: { courseId: course.app_id, courseTitle: course.title, courseCode: course.course_code },
        flag: {
          id: row.id as string,
          type: row.type as string,
          title: row.title as string,
          priority: row.priority as CourseFlag["priority"],
          status: row.status as CourseFlag["status"],
          owner: (row.owner_id as string) ?? null,
          dueDate: (row.due_date as string) ?? null,
        },
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
      client.from("courses").select("id", { count: "exact", head: true }),
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
    countDistinctCourseIds("accreditation_records", (query) => query.not("expiration_date", "is", null)),
    count((query) => query.lte("next_review_date", reviewDueBy)),
    countDistinctCourseIds("revamp_proposals", (query) => query),
    fetchAllRows(client, "course_flags", "id").then((rows) => rows.length),
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

export interface SampleDataCounts {
  courses: number;
  versions: number;
  accreditations: number;
  flags: number;
}

export async function fetchSampleDataCounts(client: SupabaseClient): Promise<SampleDataCounts> {
  const count = async (table: string): Promise<number> => {
    const { count: result, error } = await client.from(table).select("id", { count: "exact", head: true });
    if (error) throw new Error(`Could not count ${table}: ${error.message}`);
    return result ?? 0;
  };
  const [courses, versions, accreditations, flags] = await Promise.all([
    count("courses"),
    count("course_versions"),
    count("accreditation_records"),
    count("course_flags"),
  ]);
  return { courses, versions, accreditations, flags };
}
