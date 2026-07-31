import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import {
  sampleCourses,
  sampleRetrievalRuns,
} from "@/lib/sample-data";
import type { Course, RetrievalRun } from "@/types/course";

const SAMPLE_COURSE_COUNT = sampleCourses.length;
const SAMPLE_IDS = sampleCourses.map((course) => course.id);

type DatabaseStatus = {
  available: boolean;
  configured: boolean;
  seeded: boolean;
  courseCount: number;
  databaseProvider: "Supabase/Postgres" | "Sample fallback";
};

type PersistedCourseFields = {
  app_id: string | null;
  internal_summary: string;
  owner_name: string | null;
  next_review_date: string | null;
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

function databaseError(context: string, error: { message: string; code?: string }) {
  const migrationHint =
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /app_id|relation .* does not exist|schema cache/i.test(error.message)
      ? " Apply the checked-in Supabase migrations before enabling the database."
      : "";
  return new Error(`${context}: ${error.message}.${migrationHint}`);
}

async function seedSamplePortfolio(client: SupabaseClient): Promise<void> {
  const { data: verticalRows, error: verticalError } = await client
    .from("verticals")
    .select("id,slug");
  if (verticalError) {
    throw databaseError("Could not read Supabase verticals", verticalError);
  }

  const verticalIds = new Map(
    (verticalRows ?? []).map((vertical) => [
      (vertical.slug as string).toLowerCase(),
      vertical.id as string,
    ]),
  );

  const rows = sampleCourses.map((course) => {
    const primaryVerticalId = verticalIds.get(course.primaryVertical.toLowerCase());
    if (!primaryVerticalId) {
      throw new Error(
        `Supabase vertical seed is missing "${course.primaryVertical}". Apply the checked-in migrations and retry.`,
      );
    }

    return {
      app_id: course.id,
      course_code: course.courseCode,
      lms_course_id: course.lmsCourseId,
      title: course.title,
      short_title: course.shortTitle,
      description: course.description,
      learning_audience: course.learningAudience,
      primary_vertical_id: primaryVerticalId,
      primary_topic: course.primaryTopic,
      tags: course.tags,
      lifecycle_status: course.lifecycleStatus,
      publication_status: course.publicationStatus,
      delivery_format: course.deliveryFormat,
      duration_minutes: course.durationMinutes,
      authoring_tool: course.authoringTool,
      state_code: course.stateCode,
      owner_name: course.owner,
      instructional_designer_name: course.instructionalDesigner,
      current_version: course.currentVersion,
      original_publish_date: course.originalPublishDate,
      last_major_revision_date: course.lastMajorRevisionDate,
      next_review_date: course.nextReviewDate,
      health_status: course.healthStatus,
      health_score: course.healthScore,
      metadata_completeness_score: course.metadataCompletenessScore,
      internal_summary: course.internalSummary,
      source_system: course.sourceSystem,
      data_source: course.dataSource,
      retrieval_status: course.retrievalStatus,
      last_retrieved_at: course.lastRetrievedAt,
      is_sample: true,
      source_payload: course,
    };
  });

  for (let start = 0; start < rows.length; start += 25) {
    const { error } = await client
      .from("courses")
      .upsert(rows.slice(start, start + 25), {
        onConflict: "app_id",
        ignoreDuplicates: true,
      });
    if (error) {
      throw databaseError("Could not seed Supabase sample courses", error);
    }
  }

  const retrievalRows = sampleRetrievalRuns.map((run) => ({
    external_run_id: run.id,
    provider: run.provider,
    started_at: run.startedAt,
    completed_at: run.completedAt,
    status: run.status,
    records_requested: run.recordsRequested,
    records_received: run.recordsReceived,
    records_failed: run.recordsFailed,
    message: run.message,
    initiated_by_email: "sample@coursetrack.local",
  }));
  const { error: retrievalError } = await client
    .from("lms_retrieval_runs")
    .upsert(retrievalRows, {
      onConflict: "external_run_id",
      ignoreDuplicates: true,
    });
  if (retrievalError) {
    throw databaseError(
      "Could not seed Supabase retrieval history",
      retrievalError,
    );
  }
}

export async function ensureDatabase(): Promise<DatabaseStatus> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      available: false,
      configured: false,
      seeded: false,
      courseCount: SAMPLE_COURSE_COUNT,
      databaseProvider: "Sample fallback",
    };
  }

  const { count: initialCount, error: countError } = await client
    .from("courses")
    .select("id", { count: "exact", head: true });
  if (countError) {
    throw databaseError("Could not reach the Supabase course schema", countError);
  }

  const before = initialCount ?? 0;
  if (before < SAMPLE_COURSE_COUNT) {
    await seedSamplePortfolio(client);
  }

  const { count: finalCount, error: finalCountError } = await client
    .from("courses")
    .select("id", { count: "exact", head: true });
  if (finalCountError) {
    throw databaseError(
      "Could not verify the Supabase course seed",
      finalCountError,
    );
  }

  const courseCount = finalCount ?? before;
  return {
    available: true,
    configured: true,
    seeded: courseCount > before,
    courseCount,
    databaseProvider: "Supabase/Postgres",
  };
}

export async function getPortfolioCourses(): Promise<Course[]> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleCourses;

  try {
    await ensureDatabase();
    const { data, error } = await client
      .from("courses")
      .select("app_id,internal_summary,owner_name,next_review_date")
      .in("app_id", SAMPLE_IDS);
    if (error) {
      throw databaseError("Could not read Supabase course metadata", error);
    }

    const persistedById = new Map(
      ((data ?? []) as PersistedCourseFields[])
        .filter((row) => row.app_id)
        .map((row) => [row.app_id as string, row]),
    );

    return sampleCourses.map((course) => {
      const persisted = persistedById.get(course.id);
      return persisted
        ? {
            ...course,
            internalSummary: persisted.internal_summary,
            owner: persisted.owner_name,
            nextReviewDate: persisted.next_review_date,
          }
        : course;
    });
  } catch {
    return sampleCourses;
  }
}

export async function getCourseRecord(
  courseId: string,
): Promise<Course | undefined> {
  const courses = await getPortfolioCourses();
  return courses.find((course) => course.id === courseId);
}

export async function getRecentRetrievalRuns(): Promise<RetrievalRun[]> {
  const client = getSupabaseAdminClient();
  if (!client) return sampleRetrievalRuns;

  try {
    await ensureDatabase();
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

export async function updateInternalCourseMetadata(input: {
  courseId: string;
  actorEmail: string;
  internalSummary: string;
  owner: string | null;
  nextReviewDate: string | null;
}): Promise<boolean> {
  const client = getSupabaseAdminClient();
  if (!client) return false;
  await ensureDatabase();

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

export async function recordRetrievalRun(input: {
  actorEmail: string;
  status: "Retrieved" | "Retrieved with Warnings" | "Retrieval Failed";
  message: string;
  received: number;
  failed: number;
}): Promise<string | null> {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  await ensureDatabase();

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
      records_requested: SAMPLE_COURSE_COUNT,
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
