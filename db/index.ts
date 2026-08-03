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
  fetchSampleDataCounts,
  fetchVersionBoard,
  type AccreditationBoardEntry,
  type CourseSummary,
  type FlagBoardEntry,
  type PortfolioReportMetrics,
  type PortfolioSummary,
  type RevampBoardEntry,
  type SampleDataCounts,
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
  SampleDataCounts,
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
  searchLocalWrikeTasks,
  unlinkCourseVersionWrikeTask,
  verifyCourseVersionWrikeTask,
  type WrikeConnectionSummary,
  type WrikeSyncStatus,
  type WrikeTaskCandidate,
  type WrikeTaskSearchFilters,
  type WrikeVersionLink,
} from "@/db/wrike-repository";
export type {
  WrikeConnectionSummary,
  WrikeSyncStatus,
  WrikeTaskCandidate,
  WrikeTaskSearchFilters,
  WrikeVersionLink,
};
import { buildWrikeTaskSearchQuery } from "@/lib/wrike-matching";
import {
  sampleCourses,
  sampleRetrievalRuns,
  sampleImportPreviews,
} from "@/lib/sample-data";
import { sampleCourseIndex } from "@/lib/sample-course-index";
import type { Course, RetrievalRun } from "@/types/course";

export const SAMPLE_COURSE_COUNT = sampleCourses.length;

type DatabaseStatus = {
  available: boolean;
  configured: boolean;
  seeded: boolean;
  courseCount: number;
  databaseProvider: "Supabase/Postgres" | "Sample fallback";
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

export type ImportPreviewSummary = typeof sampleImportPreviews;
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
      ? " Apply the checked-in Supabase migrations and run scripts/seed-supabase.mjs before enabling the database."
      : "";
  return new Error(`${context}: ${error.message}.${migrationHint}`);
}

export async function ensureDatabase(): Promise<DatabaseStatus> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      available: false,
      configured: false,
      seeded: false,
      courseCount: sampleCourses.length,
      databaseProvider: "Sample fallback",
    };
  }

  const { count, error } = await client.from("courses").select("id", { count: "exact", head: true });
  if (error) {
    throw databaseError("Could not reach the Supabase course schema", error);
  }

  const courseCount = count ?? 0;
  return {
    available: true,
    configured: true,
    seeded: courseCount > 0,
    courseCount,
    databaseProvider: "Supabase/Postgres",
  };
}

export async function getPortfolioCourses(): Promise<Course[]> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleCourses;

  try {
    return await fetchFullCourseGraph(client);
  } catch {
    return sampleCourses;
  }
}

function sampleSummaries(): PortfolioSummary[] {
  return sampleCourses.map((course) => ({
    id: course.id,
    title: course.title,
    shortTitle: course.shortTitle,
    courseCode: course.courseCode,
    lmsCourseId: course.lmsCourseId,
    description: course.description,
    primaryVertical: course.primaryVertical,
    managementClassification: course.managementClassification,
    reconciliationStatus: course.reconciliationStatus,
    retrievalStatus: course.retrievalStatus,
    lastRetrievedAt: course.lastRetrievedAt,
    healthStatus: course.healthStatus,
    lifecycleStatus: course.lifecycleStatus,
    primaryTopic: course.primaryTopic,
    tags: course.tags,
    owner: course.owner,
    durationMinutes: course.durationMinutes,
    dataSource: course.dataSource,
    nextReviewDate: course.nextReviewDate,
    metadataCompletenessScore: course.metadataCompletenessScore,
    conflictCount: course.conflictCount,
    flagCount: course.flags.length,
    hasLmsSnapshot: Boolean(course.lmsSnapshot),
    hasContentMetadata: Boolean(course.contentMetadata),
    importValidationErrorCount: course.importValidationErrors.length,
    topicAssignments: course.topicAssignments.map(({ topic }) => ({ topic })),
  }));
}

// Dashboard and Course Library only need flat/derived fields, never the full
// nested graph — see fetchPortfolioSummaries for why this exists separately
// from getPortfolioCourses.
export async function getPortfolioSummaries(): Promise<PortfolioSummary[]> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleSummaries();

  try {
    return await fetchPortfolioSummaries(client);
  } catch {
    return sampleSummaries();
  }
}

export const getCourseRecord = cache(async (courseId: string): Promise<Course | undefined> => {
  const client = getSupabaseAdminClient();
  if (!client) return sampleCourses.find((course) => course.id === courseId);

  try {
    const course = await fetchCourseGraphByAppId(client, courseId);
    return course ?? undefined;
  } catch {
    return sampleCourses.find((course) => course.id === courseId);
  }
});

export async function getRecentRetrievalRuns(): Promise<RetrievalRun[]> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleRetrievalRuns;

  try {
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
  } catch {
    return sampleRetrievalRuns;
  }
}

export async function getImportPreviewSummary(): Promise<ImportPreviewSummary> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleImportPreviews;

  try {
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
    return {
      contentMetadata: (contentMetadataRun?.preview_summary as ImportPreviewSummary["contentMetadata"]) ?? sampleImportPreviews.contentMetadata,
      topics: (topicsRun?.preview_summary as ImportPreviewSummary["topics"]) ?? sampleImportPreviews.topics,
      monitoring: {
        fixtureLabel: "Supabase-backed monitoring preview",
        rows: total,
        enabled: total,
        excluded: 0,
      },
    };
  } catch {
    return sampleImportPreviews;
  }
}

export async function getCourseIndex(): Promise<CourseIndexEntry[]> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleCourseIndex;

  try {
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
  } catch {
    return sampleCourseIndex;
  }
}

export async function getAccreditationBoard(): Promise<AccreditationBoardEntry[]> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return sampleCourses.flatMap((course) =>
      course.accreditations.map((record) => ({
        course: { courseId: course.id, courseTitle: course.title, courseCode: course.courseCode },
        record,
      })),
    );
  }
  try {
    return await fetchAccreditationBoard(client);
  } catch {
    return sampleCourses.flatMap((course) =>
      course.accreditations.map((record) => ({
        course: { courseId: course.id, courseTitle: course.title, courseCode: course.courseCode },
        record,
      })),
    );
  }
}

export async function getVersionBoard(): Promise<VersionBoardEntry[]> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return sampleCourses.flatMap((course) =>
      course.versions.map((version) => ({
        course: { courseId: course.id, courseTitle: course.title, courseCode: course.courseCode },
        version,
      })),
    );
  }
  try {
    return await fetchVersionBoard(client);
  } catch {
    return sampleCourses.flatMap((course) =>
      course.versions.map((version) => ({
        course: { courseId: course.id, courseTitle: course.title, courseCode: course.courseCode },
        version,
      })),
    );
  }
}

export async function getRevampBoard(): Promise<RevampBoardEntry[]> {
  const client = getSupabaseAdminClient();
  const sampleBoard = () =>
    sampleCourses
      .filter((course) => course.revampProposal)
      .map((course) => ({
        course: {
          courseId: course.id,
          courseTitle: course.title,
          courseCode: course.courseCode,
          primaryVertical: course.primaryVertical,
        },
        proposal: course.revampProposal!,
      }));
  if (!client) return sampleBoard();
  try {
    return await fetchRevampBoard(client);
  } catch {
    return sampleBoard();
  }
}

export async function getFlagBoard(): Promise<FlagBoardEntry[]> {
  const client = getSupabaseAdminClient();
  const sampleBoard = () =>
    sampleCourses.flatMap((course) =>
      course.flags.map((flag) => ({
        course: { courseId: course.id, courseTitle: course.title, courseCode: course.courseCode },
        flag,
      })),
    );
  if (!client) return sampleBoard();
  try {
    return await fetchFlagBoard(client);
  } catch {
    return sampleBoard();
  }
}

export async function getReportMetrics(reviewDueBy: string): Promise<PortfolioReportMetrics> {
  const client = getSupabaseAdminClient();
  const sampleMetrics = (): PortfolioReportMetrics => ({
    totalCourses: sampleCourses.length,
    coursesWithAccreditationExpiration: sampleCourses.filter((course) => course.nearestAccreditationExpiration)
      .length,
    coursesDueForReview: sampleCourses.filter(
      (course) => course.nextReviewDate && course.nextReviewDate <= reviewDueBy,
    ).length,
    coursesWithRevampProposal: sampleCourses.filter((course) => course.revampProposal).length,
    totalOpenFlags: sampleCourses.reduce((total, course) => total + course.flags.length, 0),
    coursesBelowCompletenessThreshold: sampleCourses.filter((course) => course.metadataCompletenessScore < 80)
      .length,
    coursesWithLmsRetrievalExceptions: sampleCourses.filter(
      (course) => !course.lmsSnapshot || course.retrievalStatus !== "Retrieved",
    ).length,
  });
  if (!client) return sampleMetrics();
  try {
    return await fetchReportMetrics(client, reviewDueBy);
  } catch {
    return sampleMetrics();
  }
}

export async function getSampleDataCounts(): Promise<SampleDataCounts> {
  const client = getSupabaseAdminClient();
  const sampleCounts = (): SampleDataCounts => ({
    courses: sampleCourses.length,
    versions: sampleCourses.reduce((total, course) => total + course.versions.length, 0),
    accreditations: sampleCourses.reduce((total, course) => total + course.accreditations.length, 0),
    flags: sampleCourses.reduce((total, course) => total + course.flags.length, 0),
  });
  if (!client) return sampleCounts();
  try {
    return await fetchSampleDataCounts(client);
  } catch {
    return sampleCounts();
  }
}

export async function updateInternalCourseMetadata(input: {
  courseId: string;
  actorEmail: string;
  internalSummary: string;
  owner: string | null;
  nextReviewDate: string | null;
}): Promise<boolean> {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const { data, error } = await client.rpc(
    "update_internal_course_metadata",
    {
      p_app_id: input.courseId,
      p_actor_email: input.actorEmail,
      p_internal_summary: input.internalSummary,
      p_owner_name: input.owner,
      p_next_review_date: input.nextReviewDate,
    },
  );
  if (error) {
    throw databaseError(
      "Could not save internal CourseTrack metadata",
      error,
    );
  }
  return data === true;
}

export async function persistFieldResolution(input: {
  courseId: string;
  actorEmail: string;
  fieldKey: string;
  selectedSource: "lms" | "content_metadata" | null;
  resolvedValue: unknown;
  resolutionReason: string | null;
  resolvedAt: string;
}): Promise<boolean> {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const { data, error } = await client.rpc("resolve_course_field", {
    p_app_id: input.courseId,
    p_actor_email: input.actorEmail,
    p_field_key: input.fieldKey,
    p_selected_source: input.selectedSource,
    p_resolved_value: input.resolvedValue,
    p_resolution_reason: input.resolutionReason,
    p_resolved_at: input.resolvedAt,
  });
  if (error) {
    throw databaseError("Could not save the CourseTrack field resolution", error);
  }
  return data === true;
}

function sampleTaxonomySummaries(kind: "topic" | "tag"): TaxonomySummary[] {
  const counts = new Map<string, number>();
  for (const course of sampleCourses) {
    const labels = kind === "topic"
      ? course.topicAssignments.map((assignment) => assignment.topic)
      : course.tagAssignments.map((assignment) => assignment.tag);
    for (const label of new Set(labels)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([label, courseCount]) => ({ id: `sample-${kind}:${label}`, label, courseCount }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function getAllTopics(): Promise<TaxonomySummary[]> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleTaxonomySummaries("topic");
  try {
    return await fetchAllTopics(client);
  } catch {
    return sampleTaxonomySummaries("topic");
  }
}

export async function getAllTags(): Promise<TaxonomySummary[]> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleTaxonomySummaries("tag");
  try {
    return await fetchAllTags(client);
  } catch {
    return sampleTaxonomySummaries("tag");
  }
}

function sampleCoursesForTaxonomy(kind: "topic" | "tag", id: string): TaxonomyCourseEntry[] {
  const label = id.slice(`sample-${kind}:`.length);
  return sampleCourses
    .filter((course) =>
      kind === "topic"
        ? course.topicAssignments.some((assignment) => assignment.topic === label)
        : course.tagAssignments.some((assignment) => assignment.tag === label),
    )
    .map((course) => ({
      assignmentId: `${course.id}-${kind}-${label}`,
      courseId: course.id,
      title: course.title,
      courseCode: course.courseCode,
    }));
}

export async function getCoursesForTopic(topicId: string): Promise<TaxonomyCourseEntry[]> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleCoursesForTaxonomy("topic", topicId);
  try {
    return await fetchCoursesForTopic(client, topicId);
  } catch {
    return sampleCoursesForTaxonomy("topic", topicId);
  }
}

export async function getCoursesForTag(tagId: string): Promise<TaxonomyCourseEntry[]> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleCoursesForTaxonomy("tag", tagId);
  try {
    return await fetchCoursesForTag(client, tagId);
  } catch {
    return sampleCoursesForTaxonomy("tag", tagId);
  }
}

export async function assignCourseTopic(input: {
  courseId: string;
  topicLabel: string;
  actorEmail: string;
}): Promise<boolean> {
  const client = getSupabaseAdminClient();
  if (!client) return false;
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
  const client = getSupabaseAdminClient();
  if (!client) return false;
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
  const client = getSupabaseAdminClient();
  if (!client) return 0;
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
  const client = getSupabaseAdminClient();
  if (!client) return false;
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
  const client = getSupabaseAdminClient();
  if (!client) return false;
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
  const client = getSupabaseAdminClient();
  if (!client) return 0;
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
  const client = getSupabaseAdminClient();
  if (!client) return null;

  const externalRunId = `RUN-${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("lms_retrieval_runs")
    .insert({
      external_run_id: externalRunId,
      provider: "Mock LMS",
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

const disconnectedWrikeSummary: WrikeConnectionSummary = {
  connected: false,
  apiHost: null,
  accountId: null,
  accountName: null,
  status: null,
  lastError: null,
  connectedByEmail: null,
  updatedAt: null,
};

function requireDatabaseClient() {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error(
      "The Wrike integration requires Supabase to be configured; it is not available in sample-data mode.",
    );
  }
  return client;
}

export async function getWrikeConnection(): Promise<WrikeConnectionSummary> {
  const client = getSupabaseAdminClient();
  if (!client) return disconnectedWrikeSummary;
  try {
    return await getWrikeConnectionSummary(client);
  } catch {
    return disconnectedWrikeSummary;
  }
}

export async function connectToWrike(input: {
  token: string;
  apiHost: string;
  actorEmail: string;
}): Promise<WrikeConnectionSummary> {
  return connectWrike(requireDatabaseClient(), input);
}

export async function disconnectFromWrike(): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client) return;
  await disconnectWrike(client);
}

export async function checkWrikeConnectionHealth(): Promise<WrikeConnectionSummary> {
  const client = getSupabaseAdminClient();
  if (!client) return disconnectedWrikeSummary;
  return checkWrikeHealth(client);
}

export async function triggerWrikeSync(triggeredBy: string) {
  return runWrikeSync(requireDatabaseClient(), triggeredBy);
}

export async function getWrikeSync(): Promise<WrikeSyncStatus> {
  const client = getSupabaseAdminClient();
  if (!client) return { lastRun: null, isRunning: false, folders: [] };
  try {
    return await getWrikeSyncStatus(client);
  } catch {
    return { lastRun: null, isRunning: false, folders: [] };
  }
}

export async function searchWrikeTasks(filters: WrikeTaskSearchFilters) {
  const client = getSupabaseAdminClient();
  if (!client) return { items: [], total: 0, hasMore: false };
  try {
    return await searchLocalWrikeTasks(client, filters);
  } catch {
    return { items: [], total: 0, hasMore: false };
  }
}

export async function searchWrikeTasksForCourseVersion(
  courseVersionId: string,
  searchText?: string,
): Promise<{ items: WrikeTaskCandidate[]; total: number; hasMore: boolean }> {
  const client = getSupabaseAdminClient();
  if (!client) return { items: [], total: 0, hasMore: false };
  try {
    const query = searchText?.trim() ||
      (await (async () => {
        const context = await getCourseVersionSearchContext(client, courseVersionId);
        return context ? buildWrikeTaskSearchQuery(context) : "";
      })());
    return await searchLocalWrikeTasks(client, { query: query || undefined, pageSize: 10 });
  } catch {
    return { items: [], total: 0, hasMore: false };
  }
}

export async function linkWrikeTaskToCourseVersion(input: {
  courseVersionId: string;
  permalink?: string;
  candidateTaskId?: string;
  actorEmail: string;
}): Promise<WrikeVersionLink> {
  return linkCourseVersionWrikeTask(requireDatabaseClient(), input);
}

export async function verifyWrikeTaskLink(referenceId: string) {
  return verifyCourseVersionWrikeTask(requireDatabaseClient(), { referenceId });
}

export async function unlinkWrikeTaskFromCourseVersion(referenceId: string): Promise<boolean> {
  return unlinkCourseVersionWrikeTask(requireDatabaseClient(), { referenceId });
}
