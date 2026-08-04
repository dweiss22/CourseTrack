import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import type {
  AccreditationRecord,
  CourseFlag,
  CourseNote,
  CourseRelationship,
  CourseVersion,
  Provenance,
  RevampBucket,
  RevampProposal,
} from "@/types/course";
import type { ApplicationRole } from "@/lib/roles";

type Actor = { userId: string; email: string; role: ApplicationRole };
type Row = Record<string, unknown>;

function database(): SupabaseClient {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("CourseTrack persistence is not configured.");
  return client;
}

async function courseIdForAppId(client: SupabaseClient, appId: string): Promise<string> {
  const { data, error } = await client
    .from("courses")
    .select("id")
    .eq("app_id", appId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`Could not resolve the course: ${error.message}`);
  if (!data) throw new Error("Course not found.");
  return data.id as string;
}

function provenance(value: unknown): Provenance {
  return value === "lms_api" ? "lms_api" : value === "uploaded" ? "uploaded" : "coursetrack";
}

async function saveWorkflowEntity(input: { entity: "accreditation" | "flag" | "note" | "revamp"; id?: string; courseAppId?: string; payload: Row; expectedUpdatedAt?: string; actor: Actor }): Promise<Row> {
  const { data, error } = await database().rpc("save_workflow_entity", {
    p_entity: input.entity, p_record_id: input.id ?? null, p_course_app_id: input.courseAppId ?? null,
    p_payload: input.payload, p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_actor_id: input.actor.userId, p_actor_email: input.actor.email,
  });
  if (error) throw new Error(`Could not save the ${input.entity}: ${error.message}`);
  return data as Row;
}

export async function setFavorite(input: {
  courseId: string;
  favorite: boolean;
  actor: Actor;
}): Promise<boolean> {
  const client = database();
  const { data, error } = await client.rpc("set_course_favorite", {
    p_app_id: input.courseId,
    p_actor_id: input.actor.userId,
    p_actor_email: input.actor.email,
    p_favorite: input.favorite,
  });
  if (error) throw new Error(`Could not update the favorite: ${error.message}`);
  return data === true;
}

export async function getFavorite(courseAppId: string, userId: string): Promise<boolean> {
  const client = database();
  const courseId = await courseIdForAppId(client, courseAppId);
  const { data, error } = await client
    .from("course_favorites")
    .select("course_id")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the favorite: ${error.message}`);
  return Boolean(data);
}

export async function getFavoriteCourseIds(userId: string): Promise<string[]> {
  const client = database();
  const { data, error } = await client
    .from("course_favorites")
    .select("courses!inner(app_id)")
    .eq("user_id", userId);
  if (error) throw new Error(`Could not load favorites: ${error.message}`);
  return (data ?? []).flatMap((row) => {
    const course = row.courses as unknown as { app_id?: string } | null;
    return course?.app_id ? [course.app_id] : [];
  });
}

export async function createCourseProjection(input: {
  courseCode: string; title: string; shortTitle: string | null; description: string;
  primaryVertical: string; lifecycleStatus: string; publicationStatus: string; actor: Actor;
}): Promise<{ id: string; updatedAt: string }> {
  const client = database();
  const { data, error } = await client.rpc("create_course_projection", {
    p_course_code: input.courseCode, p_title: input.title, p_short_title: input.shortTitle,
    p_description: input.description, p_primary_vertical: input.primaryVertical,
    p_lifecycle_status: input.lifecycleStatus, p_publication_status: input.publicationStatus,
    p_actor_id: input.actor.userId, p_actor_email: input.actor.email,
  });
  if (error) throw new Error(`Could not create the course: ${error.message}`);
  const row = data as Row; return { id: row.app_id as string, updatedAt: row.updated_at as string };
}

export async function setCourseArchived(input: { courseId: string; archived: boolean; expectedUpdatedAt?: string; actor: Actor }): Promise<void> {
  const client = database();
  const { error } = await client.rpc("set_course_archived", {
    p_app_id: input.courseId, p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_archived: input.archived, p_actor_id: input.actor.userId, p_actor_email: input.actor.email,
  });
  if (error) throw new Error(`Could not ${input.archived ? "archive" : "restore"} the course: ${error.message}`);
}

export async function assignCourseRelationship(input: { courseId: string; relatedCourseId: string; relationship: "parent" | "child"; actor: Actor }): Promise<CourseRelationship> {
  const client = database();
  const { data, error } = await client.rpc("assign_course_relationship", { p_app_id: input.courseId, p_related_app_id: input.relatedCourseId, p_relationship_type: input.relationship, p_actor_id: input.actor.userId, p_actor_email: input.actor.email });
  if (error) throw new Error(`Could not assign the relationship: ${error.message}`);
  const row = data as Row;
  return { id: row.id as string, relationship: row.relationship_type as "parent" | "child", relatedCourseId: input.relatedCourseId, relatedCourseTitle: null, source: "CourseTrack", validationStatus: "Resolved" };
}

export async function removeCourseRelationship(input: { id: string; actor: Actor }): Promise<void> {
  const client = database();
  const { data, error } = await client.rpc("remove_course_relationship", { p_relationship_id: input.id, p_actor_id: input.actor.userId, p_actor_email: input.actor.email });
  if (error || data !== true) throw new Error(`Could not remove the relationship: ${error?.message ?? "Database did not confirm removal."}`);
}

function mapRevamp(row: Row): RevampProposal {
  return {
    id: row.id as string,
    title: row.title as string,
    status: row.status as RevampProposal["status"],
    bucket: (row.bucket_key as RevampBucket | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    priority: row.priority as RevampProposal["priority"],
    score: Number(row.score ?? 0),
    targetPublicationDate: (row.target_publication_date as string) ?? null,
    businessJustification: row.business_justification as string,
    updatedAt: row.updated_at as string,
    archivedAt: (row.archived_at as string) ?? null,
    provenance: provenance(row.provenance),
  };
}

export async function createRevampTask(input: {
  courseAppId: string;
  title: string;
  bucket: RevampBucket;
  priority: RevampProposal["priority"];
  score: number;
  targetPublicationDate: string | null;
  businessJustification: string;
  actor: Actor;
}): Promise<RevampProposal> {
  return mapRevamp(await saveWorkflowEntity({ entity: "revamp", courseAppId: input.courseAppId, payload: { title: input.title, bucket: input.bucket, priority: input.priority, score: input.score, targetPublicationDate: input.targetPublicationDate, businessJustification: input.businessJustification }, actor: input.actor }));
}

export async function updateRevampTask(input: {
  id: string;
  title: string;
  priority: RevampProposal["priority"];
  score: number;
  targetPublicationDate: string | null;
  businessJustification: string;
  expectedUpdatedAt: string;
  actor: Actor;
}): Promise<RevampProposal> {
  return mapRevamp(await saveWorkflowEntity({ entity: "revamp", id: input.id, expectedUpdatedAt: input.expectedUpdatedAt, payload: { title: input.title, priority: input.priority, score: input.score, targetPublicationDate: input.targetPublicationDate, businessJustification: input.businessJustification }, actor: input.actor }));
}

export async function moveRevampTask(input: {
  id: string;
  bucket: RevampBucket;
  targetIndex: number;
  expectedUpdatedAt: string;
  actor: Actor;
}): Promise<RevampProposal> {
  const client = database();
  const { data, error } = await client.rpc("move_revamp_task", {
    p_task_id: input.id,
    p_bucket_key: input.bucket,
    p_target_index: input.targetIndex,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_actor_id: input.actor.userId,
    p_actor_email: input.actor.email,
  });
  if (error) throw new Error(`Could not move the Revamp task: ${error.message}`);
  return mapRevamp(data as Row);
}

export async function archiveWorkflowRecord(input: {
  table: "revamp_proposals" | "course_versions" | "accreditation_records" | "course_flags" | "notes";
  id: string;
  expectedUpdatedAt?: string;
  actor: Actor;
}): Promise<void> {
  const client = database();
  const { data, error } = await client.rpc("archive_workflow_record", {
    p_table_name: input.table, p_record_id: input.id,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_actor_id: input.actor.userId, p_actor_email: input.actor.email,
  });
  if (error || data !== true) throw new Error(`Could not archive the record: ${error?.message ?? "Database did not confirm archival."}`);
}

function mapAccreditation(row: Row): AccreditationRecord {
  return {
    id: row.id as string,
    organization: row.organization as string,
    jurisdiction: (row.jurisdiction as string) || "National",
    status: row.status as AccreditationRecord["status"],
    approvalNumber: (row.approval_number as string) ?? null,
    creditHours: Number(row.credit_hours ?? 0),
    effectiveDate: (row.effective_date as string) ?? null,
    expirationDate: (row.expiration_date as string) ?? null,
    source: provenance(row.provenance),
    originProvenance: provenance(row.origin_provenance ?? row.provenance),
    riskReasons: (row.risk_reasons as string[]) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    archivedAt: (row.archived_at as string) ?? null,
  };
}

export async function saveAccreditation(input: {
  id?: string;
  courseAppId?: string;
  organization: string;
  jurisdiction: string;
  status: AccreditationRecord["status"];
  approvalNumber: string | null;
  creditHours: number;
  effectiveDate: string | null;
  expirationDate: string | null;
  expectedUpdatedAt?: string;
  actor: Actor;
}): Promise<AccreditationRecord> {
  return mapAccreditation(await saveWorkflowEntity({ entity: "accreditation", id: input.id, courseAppId: input.courseAppId, expectedUpdatedAt: input.expectedUpdatedAt, payload: { organization: input.organization, jurisdiction: input.jurisdiction, status: input.status, approvalNumber: input.approvalNumber, creditHours: input.creditHours, effectiveDate: input.effectiveDate, expirationDate: input.expirationDate }, actor: input.actor }));
}

function mapVersion(row: Row): CourseVersion {
  return {
    id: row.id as string,
    versionNumber: row.version_number as string,
    versionType: row.version_type as CourseVersion["versionType"],
    publicationDate: (row.publication_date as string) ?? "",
    isCurrent: Boolean(row.is_current),
    versionStatus: row.version_status as CourseVersion["versionStatus"],
    managedBy: "CourseTrack",
    createdAt: row.created_at as string,
    createdBy: (row.created_by_email as string) ?? "CourseTrack",
    releaseNotes: (row.release_notes as string) ?? "",
    authoringTool: (row.authoring_tool as string) ?? "",
    packageStandard: (row.package_standard as string) ?? "",
    wrikeTaskReferences: [],
    provenance: provenance(row.provenance),
    originProvenance: provenance(row.origin_provenance ?? row.provenance),
    updatedAt: row.updated_at as string,
    archivedAt: (row.archived_at as string) ?? null,
  };
}

export async function saveVersion(input: {
  id?: string;
  courseAppId?: string;
  versionNumber: string;
  versionType: CourseVersion["versionType"];
  publicationDate: string;
  versionStatus: CourseVersion["versionStatus"];
  isCurrent: boolean;
  releaseNotes: string;
  authoringTool: string;
  packageStandard: string;
  expectedUpdatedAt?: string;
  actor: Actor;
}): Promise<CourseVersion> {
  const client = database();
  const { data, error } = await client.rpc("save_course_version", {
    p_version_id: input.id ?? null, p_course_app_id: input.courseAppId ?? null,
    p_version_number: input.versionNumber, p_version_type: input.versionType,
    p_publication_date: input.publicationDate, p_version_status: input.versionStatus,
    p_is_current: input.isCurrent, p_release_notes: input.releaseNotes,
    p_authoring_tool: input.authoringTool, p_package_standard: input.packageStandard,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_actor_id: input.actor.userId, p_actor_email: input.actor.email,
  });
  if (error) throw new Error(`Could not save the version: ${error.message}`);
  return mapVersion(data as Row);
}

export async function saveFlag(input: {
  id?: string;
  courseAppId?: string;
  recordKind: CourseFlag["recordKind"];
  category: string;
  title: string;
  description: string;
  priority: CourseFlag["priority"];
  status: CourseFlag["status"];
  assigneeId: string | null;
  dueDate: string | null;
  completionNotes: string | null;
  expectedUpdatedAt?: string;
  actor: Actor;
}): Promise<CourseFlag> {
  const client = database();
  const { data, error } = await client.rpc("save_task_callout", {
    p_record_id: input.id ?? null,
    p_course_app_id: input.courseAppId ?? null,
    p_payload: {
      recordKind: input.recordKind,
      category: input.category,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: input.status,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate,
      completionNotes: input.completionNotes,
    },
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_actor_id: input.actor.userId,
    p_actor_email: input.actor.email,
  });
  if (error) throw new Error(`Could not save the task or callout: ${error.message}`);
  const row = data as Row;
  const actorIds = [row.owner_id, row.completed_by, row.resolved_by, row.created_by, row.updated_by]
    .filter((value): value is string => typeof value === "string");
  const profileById = new Map<string, { id: string; display_name: string | null; email: string }>();
  if (actorIds.length > 0) {
    const { data: profiles, error: profileError } = await client
      .from("profiles")
      .select("id,display_name,email")
      .in("id", [...new Set(actorIds)]);
    if (profileError) throw new Error(`Could not load task or callout people: ${profileError.message}`);
    for (const profile of profiles ?? []) profileById.set(profile.id as string, profile as { id: string; display_name: string | null; email: string });
  }
  const person = (id: unknown): CourseFlag["assignee"] => {
    if (typeof id !== "string") return null;
    const profile = profileById.get(id);
    return profile ? { id, displayName: profile.display_name || profile.email, email: profile.email } : null;
  };
  return {
    id: row.id as string,
    recordKind: row.record_kind as CourseFlag["recordKind"],
    category: row.type as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    priority: row.priority as CourseFlag["priority"],
    status: row.status as CourseFlag["status"],
    assignee: person(row.owner_id),
    assigneeId: (row.owner_id as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
    completionNotes: (row.completion_notes as string) ?? null,
    completedBy: person(row.completed_by),
    completedAt: (row.completed_at as string) ?? null,
    resolvedBy: person(row.resolved_by),
    resolvedAt: (row.resolved_at as string) ?? null,
    createdBy: person(row.created_by),
    createdAt: row.created_at as string,
    updatedBy: person(row.updated_by),
    updatedAt: row.updated_at as string,
    archivedAt: (row.archived_at as string) ?? null,
    provenance: "coursetrack",
  };
}

export async function restoreTaskCallout(input: { id: string; expectedUpdatedAt: string; actor: Actor }): Promise<void> {
  const { data, error } = await database().rpc("restore_task_callout", {
    p_record_id: input.id,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_actor_id: input.actor.userId,
    p_actor_email: input.actor.email,
  });
  if (error || data !== true) {
    throw new Error(`Could not restore the task or callout: ${error?.message ?? "Database did not confirm restoration."}`);
  }
}

export async function saveNote(input: {
  id?: string;
  courseAppId?: string;
  type: string;
  visibility: CourseNote["visibility"];
  body: string;
  expectedUpdatedAt?: string;
  actor: Actor;
}): Promise<CourseNote> {
  const data = await saveWorkflowEntity({ entity: "note", id: input.id, courseAppId: input.courseAppId, expectedUpdatedAt: input.expectedUpdatedAt, payload: { type: input.type, visibility: input.visibility, body: input.body }, actor: input.actor });
  return {
    id: data.id as string,
    type: data.note_type as string,
    author: input.actor.email,
    authorId: data.author_id as string,
    createdAt: data.created_at as string,
    visibility: data.visibility as CourseNote["visibility"],
    body: data.body as string,
    updatedAt: data.updated_at as string,
    archivedAt: (data.archived_at as string) ?? null,
    provenance: "coursetrack",
  };
}
