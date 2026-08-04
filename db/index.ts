import { cache } from "react";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import {
  fetchAccreditationBoard,
  fetchAllTags,
  fetchAllTopics,
  fetchCourseGraphByAppId,
  fetchCoursesForTag,
  fetchCoursesForTopic,
  fetchFlagBoard,
  fetchFullCourseGraph,
  fetchPortfolioSummaries,
  fetchReportMetrics,
  fetchRevampBoard,
  fetchVersionBoard,
  type AccreditationBoardEntry,
  type CourseSummary,
  type FlagBoardEntry,
  type PortfolioReportMetrics,
  type PortfolioSummary,
  type RevampBoardEntry,
  type TaxonomyCourseEntry,
  type TaxonomySummary,
  type VersionBoardEntry,
} from "@/db/course-repository";
export type {
  AccreditationBoardEntry,
  CourseSummary,
  FlagBoardEntry,
  PortfolioReportMetrics,
  PortfolioSummary,
  RevampBoardEntry,
  TaxonomyCourseEntry,
  TaxonomySummary,
  VersionBoardEntry,
};
import {
  checkWrikeHealth,
  connectWrike,
  disconnectWrike,
  getCourseVersionSearchContext,
  getWrikeConnectionSummary,
  getWrikeSyncStatus,
  linkCourseVersionWrikeTask,
  runWrikeSync,
  searchWrikeTaskIndex,
  unlinkCourseVersionWrikeTask,
  verifyCourseVersionWrikeTask,
  type WrikeConnectionSummary,
  type WrikeSyncStatus,
  type WrikeTaskCandidate,
  type WrikeConnectorState,
  type WrikeTaskSearchFilters,
  type WrikeVersionLink,
} from "@/db/wrike-repository";
export type {
  WrikeConnectionSummary,
  WrikeSyncStatus,
  WrikeTaskCandidate,
  WrikeConnectorState,
  WrikeTaskSearchFilters,
  WrikeVersionLink,
};
import { buildWrikeTaskSearchQuery } from "@/lib/wrike-matching";
import {
  changeUserRoleOrStatus,
  createApplicationUserMembership,
  listApplicationUsers,
  resendUserRecoveryEmail,
  transferSuperAdmin,
  updateOwnProfile,
  type ApplicationUserSummary,
  type SuperAdminTransferResult,
} from "@/db/user-repository";
export type { ApplicationUserSummary, SuperAdminTransferResult };
export { getActiveAssignees } from "@/db/profile-repository";
export { getIntegrationMappingSummary } from "@/db/integration-repository";
import type { ApplicationRole } from "@/lib/auth";
export {
  archiveWorkflowRecord,
  assignCourseRelationship,
  createRevampTask,
  createCourseProjection,
  getFavorite,
  getFavoriteCourseIds,
  moveRevampTask,
  removeCourseRelationship,
  restoreTaskCallout,
  saveAccreditation,
  saveFlag,
  saveNote,
  saveVersion,
  setCourseArchived,
  setFavorite,
  updateRevampTask,
} from "@/db/workflow-repository";
import type { Course, RetrievalRun } from "@/types/course";

type DatabaseStatus = {
  available: boolean;
  configured: boolean;
  dataPresent: boolean;
  courseCount: number;
  databaseProvider: "Supabase/Postgres";
};

type PersistedRetrievalRun = {
  id: string;
  external_run_id: string | null;
  provider: string;
  started_at: string;
  completed_at: string | null;
  status: RetrievalRun["status"];
  records_requested: number;
  records_received: number;
  records_failed: number;
  message: string;
};

export type ImportPreviewSummary = {
  contentMetadata: {
    totalRows: number;
    matchedLmsCourses: number;
    contentMetadataOnlyRecords: number;
    lmsCoursesMissingMetadata: number;
    duplicateCourseIds: number;
    missingCourseIds: number;
    invalidVerticals: number;
    invalidUrls: number;
    missingRelationshipTargets: number;
    circularRelationships: number;
    overlappingFieldConflicts: number;
    fieldsWouldBeAdded: number;
    fieldsUnchanged: number;
    rowsBlocked: number;
  };
  topics: {
    topicCount: number;
    assignmentCount: number;
    uniqueCourseIdCount: number;
    duplicateAssignments: number;
    unknownCourseIds: number;
    emptyTopics: number;
    normalizedTopicNames: number;
  };
  monitoring: { sourceLabel: string; rows: number; enabled: number; excluded: number };
};
export type CourseIndexEntry = {
  id: string;
  title: string;
  courseCode: string;
  primaryVertical: string;
};

function databaseError(context: string, error: { message: string; code?: string }) {
  const migrationHint =
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /app_id|relation .* does not exist|schema cache/i.test(error.message)
      ? " Apply the checked-in Supabase migrations, then configure and run the authorized workbook import."
      : "";
  return new Error(`${context}: ${error.message}.${migrationHint}`);
}

export async function ensureDatabase(): Promise<DatabaseStatus> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("CourseTrack persistence is not configured.");
  }

  const { count, error } = await client.from("courses").select("id", { count: "exact", head: true });
  if (error) {
    throw databaseError("Could not reach the Supabase course schema", error);
  }

  const courseCount = count ?? 0;
  return {
    available: true,
    configured: true,
    dataPresent: courseCount > 0,
    courseCount,
    databaseProvider: "Supabase/Postgres",
  };
}

export async function getPortfolioCourses(): Promise<Course[]> {
  return fetchFullCourseGraph(requireDatabaseClient());
}

// Dashboard and Course Library only need flat/derived fields, never the full
// nested graph — see fetchPortfolioSummaries for why this exists separately
// from getPortfolioCourses.
export async function getPortfolioSummaries(): Promise<PortfolioSummary[]> {
  return fetchPortfolioSummaries(requireDatabaseClient());
}

export const getCourseRecord = cache(async (courseId: string): Promise<Course | undefined> => {
  const course = await fetchCourseGraphByAppId(requireDatabaseClient(), courseId);
  return course ?? undefined;
});

export async function getRecentRetrievalRuns(): Promise<RetrievalRun[]> {
  const client = requireDatabaseClient();
    const { data, error } = await client
      .from("lms_retrieval_runs")
      .select(
        "id,external_run_id,provider,started_at,completed_at,status,records_requested,records_received,records_failed,message",
      )
      .order("started_at", { ascending: false })
      .limit(10);
    if (error) {
      throw databaseError("Could not read Supabase retrieval history", error);
    }

  return ((data ?? []) as PersistedRetrievalRun[]).map((run) => ({
      id: run.external_run_id ?? run.id,
      provider: run.provider,
      startedAt: run.started_at,
      completedAt: run.completed_at ?? run.started_at,
      status: run.status,
      recordsRequested: run.records_requested,
      recordsReceived: run.records_received,
      recordsFailed: run.records_failed,
      message: run.message,
  }));
}

export async function getImportPreviewSummary(): Promise<ImportPreviewSummary> {
  const client = requireDatabaseClient();
    const { data, error } = await client
      .from("content_metadata_import_runs")
      .select("source_filename,preview_summary");
    if (error) {
      throw databaseError("Could not read Supabase import preview summaries", error);
    }
    const { count: courseCount, error: countError } = await client
      .from("courses")
      .select("id", { count: "exact", head: true });
    if (countError) {
      throw databaseError("Could not read Supabase course count", countError);
    }

    const contentMetadataRun = data?.find((run) => run.source_filename.includes("master"));
    const topicsRun = data?.find((run) => run.source_filename.includes("Topics"));
    const total = courseCount ?? 0;
    const emptyContent: ImportPreviewSummary["contentMetadata"] = {
      totalRows: total, matchedLmsCourses: 0, contentMetadataOnlyRecords: 0,
      lmsCoursesMissingMetadata: 0, duplicateCourseIds: 0, missingCourseIds: 0,
      invalidVerticals: 0, invalidUrls: 0, missingRelationshipTargets: 0,
      circularRelationships: 0, overlappingFieldConflicts: 0, fieldsWouldBeAdded: 0,
      fieldsUnchanged: 0, rowsBlocked: 0,
    };
    const emptyTopics: ImportPreviewSummary["topics"] = {
      topicCount: 0, assignmentCount: 0, uniqueCourseIdCount: 0,
      duplicateAssignments: 0, unknownCourseIds: 0, emptyTopics: 0,
      normalizedTopicNames: 0,
    };
    return {
      contentMetadata: (contentMetadataRun?.preview_summary as ImportPreviewSummary["contentMetadata"]) ?? emptyContent,
      topics: (topicsRun?.preview_summary as ImportPreviewSummary["topics"]) ?? emptyTopics,
      monitoring: {
        sourceLabel: "Uploaded monitoring data",
        rows: total,
        enabled: total,
        excluded: 0,
      },
    };
}

export async function getCourseIndex(): Promise<CourseIndexEntry[]> {
  const client = requireDatabaseClient();
    const { data: verticalRows, error: verticalError } = await client.from("verticals").select("id,slug");
    if (verticalError) {
      throw databaseError("Could not read Supabase verticals", verticalError);
    }
    const verticalLabelById = new Map(
      (verticalRows ?? []).map((row) => [row.id as string, (row.slug as string).toUpperCase()]),
    );

    const entries: CourseIndexEntry[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await client
        .from("courses")
        .select("app_id,title,course_code,primary_vertical_id")
        .range(from, from + pageSize - 1);
      if (error) {
        throw databaseError("Could not read the Supabase course index", error);
      }
      for (const row of data ?? []) {
        entries.push({
          id: row.app_id as string,
          title: row.title as string,
          courseCode: row.course_code as string,
          primaryVertical: verticalLabelById.get(row.primary_vertical_id as string) ?? "",
        });
      }
      if (!data || data.length < pageSize) break;
    }
  return entries;
}

export async function getAccreditationBoard(): Promise<AccreditationBoardEntry[]> {
  return fetchAccreditationBoard(requireDatabaseClient());
}

export async function getVersionBoard(): Promise<VersionBoardEntry[]> {
  return fetchVersionBoard(requireDatabaseClient());
}

export async function getRevampBoard(): Promise<RevampBoardEntry[]> {
  return fetchRevampBoard(requireDatabaseClient());
}

export async function getFlagBoard(): Promise<FlagBoardEntry[]> {
  return fetchFlagBoard(requireDatabaseClient());
}

export async function getReportMetrics(): Promise<PortfolioReportMetrics> {
  const reviewDueBy = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  return fetchReportMetrics(requireDatabaseClient(), reviewDueBy);
}

export async function updateInternalCourseMetadata(input: {
  courseId: string;
  actorId: string;
  actorEmail: string;
  internalSummary: string;
  owner: string | null;
  nextReviewDate: string | null;
  expectedUpdatedAt: string;
}): Promise<string> {
  const client = requireDatabaseClient();

  const { data, error } = await client.rpc(
    "update_course_projection",
    {
      p_app_id: input.courseId,
      p_actor_id: input.actorId,
      p_actor_email: input.actorEmail,
      p_internal_summary: input.internalSummary,
      p_owner_name: input.owner,
      p_next_review_date: input.nextReviewDate,
      p_expected_updated_at: input.expectedUpdatedAt,
    },
  );
  if (error) {
    throw databaseError(
      "Could not save internal CourseTrack metadata",
      error,
    );
  }
  return (data as { updated_at?: string } | null)?.updated_at ?? input.expectedUpdatedAt;
}

export async function persistFieldResolution(input: {
  courseId: string;
  actorId: string;
  actorEmail: string;
  fieldKey: string;
  selectedSource: "lms" | "content_metadata" | null;
  resolutionReason: string | null;
  expectedUpdatedAt: string;
}): Promise<string> {
  const client = requireDatabaseClient();

  const { data, error } = await client.rpc("resolve_course_field_v2", {
    p_app_id: input.courseId,
    p_actor_id: input.actorId,
    p_actor_email: input.actorEmail,
    p_field_key: input.fieldKey,
    p_selected_source: input.selectedSource,
    p_resolution_reason: input.resolutionReason,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  if (error) {
    throw databaseError("Could not save the CourseTrack field resolution", error);
  }
  const saved = data as { updated_at?: string } | null;
  if (!saved?.updated_at) throw new Error("Could not save the CourseTrack field resolution: no concurrency token was returned.");
  return saved.updated_at;
}

export async function getAllTopics(): Promise<TaxonomySummary[]> {
  return fetchAllTopics(requireDatabaseClient());
}

export async function getAllTags(): Promise<TaxonomySummary[]> {
  return fetchAllTags(requireDatabaseClient());
}

export async function getCoursesForTopic(topicId: string): Promise<TaxonomyCourseEntry[]> {
  return fetchCoursesForTopic(requireDatabaseClient(), topicId);
}

export async function getCoursesForTag(tagId: string): Promise<TaxonomyCourseEntry[]> {
  return fetchCoursesForTag(requireDatabaseClient(), tagId);
}

export async function assignCourseTopic(input: {
  courseId: string;
  topicLabel: string;
  actorEmail: string;
}): Promise<boolean> {
  const client = requireDatabaseClient();
  const { data, error } = await client.rpc("assign_course_topic", {
    p_app_id: input.courseId,
    p_topic_label: input.topicLabel,
    p_actor_email: input.actorEmail,
  });
  if (error) throw databaseError("Could not assign the topic", error);
  return data === true;
}

export async function removeCourseTopic(input: {
  courseTopicId: string;
  actorEmail: string;
}): Promise<boolean> {
  const client = requireDatabaseClient();
  const { data, error } = await client.rpc("remove_course_topic", {
    p_course_topic_id: input.courseTopicId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw databaseError("Could not remove the topic assignment", error);
  return data === true;
}

export async function assignTopicToCourses(input: {
  topicLabel: string;
  courseIds: string[];
  actorEmail: string;
}): Promise<number> {
  const client = requireDatabaseClient();
  const { data, error } = await client.rpc("assign_topic_to_courses", {
    p_topic_label: input.topicLabel,
    p_app_ids: input.courseIds,
    p_actor_email: input.actorEmail,
  });
  if (error) throw databaseError("Could not bulk-assign the topic", error);
  return Number(data ?? 0);
}

export async function assignCourseTag(input: {
  courseId: string;
  tagLabel: string;
  actorEmail: string;
}): Promise<boolean> {
  const client = requireDatabaseClient();
  const { data, error } = await client.rpc("assign_course_tag", {
    p_app_id: input.courseId,
    p_tag_label: input.tagLabel,
    p_actor_email: input.actorEmail,
  });
  if (error) throw databaseError("Could not assign the tag", error);
  return data === true;
}

export async function removeCourseTag(input: {
  courseTagId: string;
  actorEmail: string;
}): Promise<boolean> {
  const client = requireDatabaseClient();
  const { data, error } = await client.rpc("remove_course_tag", {
    p_course_tag_id: input.courseTagId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw databaseError("Could not remove the tag assignment", error);
  return data === true;
}

export async function assignTagToCourses(input: {
  tagLabel: string;
  courseIds: string[];
  actorEmail: string;
}): Promise<number> {
  const client = requireDatabaseClient();
  const { data, error } = await client.rpc("assign_tag_to_courses", {
    p_tag_label: input.tagLabel,
    p_app_ids: input.courseIds,
    p_actor_email: input.actorEmail,
  });
  if (error) throw databaseError("Could not bulk-assign the tag", error);
  return Number(data ?? 0);
}

export async function recordRetrievalRun(input: {
  actorEmail: string;
  status: "Retrieved" | "Retrieved with Warnings" | "Retrieval Failed";
  message: string;
  requested: number;
  received: number;
  failed: number;
}): Promise<string | null> {
  const client = requireDatabaseClient();

  const externalRunId = `RUN-${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("lms_retrieval_runs")
    .insert({
      external_run_id: externalRunId,
      provider: "Connected via LMS API",
      started_at: now,
      completed_at: now,
      status: input.status,
      records_requested: input.requested,
      records_received: input.received,
      records_failed: input.failed,
      message: input.message,
      initiated_by_email: input.actorEmail,
    })
    .select("external_run_id")
    .single();
  if (error) {
    throw databaseError("Could not record the Supabase retrieval run", error);
  }
  return (data?.external_run_id as string | undefined) ?? externalRunId;
}

function requireDatabaseClient() {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error(
      "CourseTrack persistence is not configured.",
    );
  }
  return client;
}

export async function getWrikeConnection(): Promise<WrikeConnectionSummary> {
  return getWrikeConnectionSummary(requireDatabaseClient());
}

export async function connectToWrike(input: {
  token: string;
  apiHost: string;
  actorId: string;
  actorEmail: string;
}): Promise<WrikeConnectionSummary> {
  return connectWrike(requireDatabaseClient(), input);
}

export async function disconnectFromWrike(actorId: string, actorEmail: string): Promise<void> {
  await disconnectWrike(requireDatabaseClient(), actorId, actorEmail);
}

export async function checkWrikeConnectionHealth(): Promise<WrikeConnectionSummary> {
  return checkWrikeHealth(requireDatabaseClient());
}

export async function triggerWrikeSync(triggeredBy: string, actorId: string | null = null) {
  return runWrikeSync(requireDatabaseClient(), triggeredBy, actorId);
}

export async function getWrikeSync(): Promise<WrikeSyncStatus> {
  return getWrikeSyncStatus(requireDatabaseClient());
}

export async function searchWrikeTasks(filters: WrikeTaskSearchFilters) {
  return searchWrikeTaskIndex(requireDatabaseClient(), filters);
}

export async function searchWrikeTasksForCourseVersion(
  courseVersionId: string,
  searchText?: string,
): Promise<{ items: WrikeTaskCandidate[]; total: number; hasMore: boolean; state: WrikeConnectorState }> {
  const client = requireDatabaseClient();
  const context = await getCourseVersionSearchContext(client, courseVersionId);
  if (!context) throw new Error("Course version not found.");
  const query = searchText?.trim() || buildWrikeTaskSearchQuery(context);
  return searchWrikeTaskIndex(client, { query: query || undefined, pageSize: 10 });
}

export async function linkWrikeTaskToCourseVersion(input: {
  courseVersionId: string;
  permalink?: string;
  candidateTaskId?: string;
  expectedUpdatedAt?: string;
  actorId: string;
  actorEmail: string;
}): Promise<WrikeVersionLink> {
  return linkCourseVersionWrikeTask(requireDatabaseClient(), input);
}

export async function verifyWrikeTaskLink(input: { referenceId: string; expectedUpdatedAt: string; actorId: string; actorEmail: string }) {
  return verifyCourseVersionWrikeTask(requireDatabaseClient(), input);
}

export async function unlinkWrikeTaskFromCourseVersion(input: { referenceId: string; expectedUpdatedAt: string; actorId: string; actorEmail: string }): Promise<boolean> {
  return unlinkCourseVersionWrikeTask(requireDatabaseClient(), input);
}

export async function updateMyProfile(input: {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  jobTitle: string;
  department: string;
  timezone: string;
}): Promise<void> {
  return updateOwnProfile(requireDatabaseClient(), input);
}

export async function listUsers(filters: {
  role?: ApplicationRole;
  status?: "active" | "disabled";
} = {}): Promise<ApplicationUserSummary[]> {
  return listApplicationUsers(requireDatabaseClient(), filters);
}

export interface EnvironmentSnapshotStatus {
  refreshedAt: string;
  sourceSnapshotAt: string;
}

export async function getEnvironmentSnapshotStatus(): Promise<EnvironmentSnapshotStatus | null> {
  const client = requireDatabaseClient();
  const { data, error } = await client
    .from("environment_snapshot_status")
    .select("refreshed_at,source_snapshot_at")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw databaseError("Could not read the environment snapshot status", error);
  if (!data) return null;
  return {
    refreshedAt: data.refreshed_at as string,
    sourceSnapshotAt: data.source_snapshot_at as string,
  };
}

export async function createUser(input: {
  email: string;
  displayName: string;
  role: ApplicationRole;
  actorId: string;
  actorRole: ApplicationRole;
  redirectTo: string;
}): Promise<ApplicationUserSummary> {
  return createApplicationUserMembership(requireDatabaseClient(), input);
}

export async function changeUserRole(input: {
  targetId: string;
  actorId: string;
  actorRole: ApplicationRole;
  newRole?: ApplicationRole;
  newStatus?: "active" | "disabled";
}): Promise<ApplicationUserSummary> {
  return changeUserRoleOrStatus(requireDatabaseClient(), input);
}

export async function resendRecoveryEmail(input: { email: string; redirectTo: string }): Promise<void> {
  return resendUserRecoveryEmail(requireDatabaseClient(), input);
}

export async function transferSuperAdminRole(input: {
  actorId: string;
  targetId: string;
  confirmationEmail: string;
}): Promise<SuperAdminTransferResult> {
  return transferSuperAdmin(requireDatabaseClient(), input);
}
