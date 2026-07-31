import { drizzle } from "drizzle-orm/d1";
import { sampleCourses, sampleRetrievalRuns } from "@/lib/sample-data";
import * as schema from "./schema";

type CourseTrackBindings = {
  DB?: D1Database;
};

async function getD1Binding(): Promise<D1Database | null> {
  try {
    // Keep the runtime-only Cloudflare module out of portable SSR and Node
    // tests. Cloudflare resolves it when a D1-backed route is actually called.
    const moduleName = "cloudflare:workers";
    const workers = (await import(/* @vite-ignore */ moduleName)) as {
      env?: CourseTrackBindings;
    };
    return workers.env?.DB ?? null;
  } catch {
    return null;
  }
}

export async function getDb() {
  const database = await getD1Binding();
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(database, { schema });
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    primary_role TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    course_code TEXT NOT NULL UNIQUE,
    lms_course_id TEXT UNIQUE,
    title TEXT NOT NULL,
    primary_vertical TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL,
    publication_status TEXT NOT NULL,
    owner TEXT,
    next_review_date TEXT,
    health_status TEXT NOT NULL,
    health_score INTEGER NOT NULL,
    metadata_completeness_score INTEGER NOT NULL,
    data_source TEXT NOT NULL,
    source_system TEXT NOT NULL,
    retrieval_status TEXT NOT NULL,
    last_retrieved_at TEXT,
    internal_summary TEXT NOT NULL DEFAULT '',
    is_sample INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS courses_vertical_idx ON courses (primary_vertical)",
  "CREATE INDEX IF NOT EXISTS courses_lifecycle_idx ON courses (lifecycle_status)",
  "CREATE INDEX IF NOT EXISTS courses_review_date_idx ON courses (next_review_date)",
  "CREATE INDEX IF NOT EXISTS courses_health_idx ON courses (health_status)",
  `CREATE TABLE IF NOT EXISTS lms_retrieval_runs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    records_requested INTEGER NOT NULL DEFAULT 0,
    records_received INTEGER NOT NULL DEFAULT 0,
    records_failed INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT '',
    initiated_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    record_type TEXT NOT NULL,
    record_id TEXT NOT NULL,
    previous_values_json TEXT,
    new_values_json TEXT,
    source TEXT NOT NULL,
    reason TEXT,
    correlation_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
] as const;

export async function ensureDatabase(): Promise<{
  available: boolean;
  seeded: boolean;
  courseCount: number;
}> {
  const database = await getD1Binding();
  if (!database) {
    return { available: false, seeded: false, courseCount: sampleCourses.length };
  }

  await database.batch(
    schemaStatements.map((statement) => database.prepare(statement)),
  );

  const countRow = await database.prepare(
    "SELECT COUNT(*) AS count FROM courses",
  ).first<{ count: number }>();
  const courseCount = Number(countRow?.count ?? 0);
  if (courseCount > 0) {
    return { available: true, seeded: false, courseCount };
  }

  const inserts = sampleCourses.map((course) =>
    database.prepare(
      `INSERT INTO courses (
        id, course_code, lms_course_id, title, primary_vertical,
        lifecycle_status, publication_status, owner, next_review_date,
        health_status, health_score, metadata_completeness_score, data_source,
        source_system, retrieval_status, last_retrieved_at, internal_summary,
        is_sample, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      course.id,
      course.courseCode,
      course.lmsCourseId,
      course.title,
      course.primaryVertical,
      course.lifecycleStatus,
      course.publicationStatus,
      course.owner,
      course.nextReviewDate,
      course.healthStatus,
      course.healthScore,
      course.metadataCompletenessScore,
      course.dataSource,
      course.sourceSystem,
      course.retrievalStatus,
      course.lastRetrievedAt,
      course.internalSummary,
      course.isSample ? 1 : 0,
      JSON.stringify(course),
    ),
  );

  await database.batch(inserts);
  await database.batch(
    sampleRetrievalRuns.map((run) =>
      database.prepare(
        `INSERT INTO lms_retrieval_runs (
          id, provider, started_at, completed_at, status, records_requested,
          records_received, records_failed, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        run.id,
        run.provider,
        run.startedAt,
        run.completedAt,
        run.status,
        run.recordsRequested,
        run.recordsReceived,
        run.recordsFailed,
        run.message,
      ),
    ),
  );

  return {
    available: true,
    seeded: true,
    courseCount: sampleCourses.length,
  };
}

export async function updateInternalCourseMetadata(input: {
  courseId: string;
  actorEmail: string;
  internalSummary: string;
  owner: string | null;
  nextReviewDate: string | null;
}): Promise<boolean> {
  const database = await getD1Binding();
  if (!database) return false;
  await ensureDatabase();

  const previous = await database.prepare(
    "SELECT internal_summary, owner, next_review_date FROM courses WHERE id = ?",
  )
    .bind(input.courseId)
    .first<Record<string, unknown>>();
  if (!previous) return false;

  await database.batch([
    database.prepare(
      `UPDATE courses
       SET internal_summary = ?, owner = ?, next_review_date = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(
      input.internalSummary,
      input.owner,
      input.nextReviewDate,
      input.courseId,
    ),
    database.prepare(
      `INSERT INTO audit_logs (
        id, actor_email, action, record_type, record_id,
        previous_values_json, new_values_json, source, reason, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      input.actorEmail,
      "course.internal_metadata_updated",
      "course",
      input.courseId,
      JSON.stringify(previous),
      JSON.stringify({
        internalSummary: input.internalSummary,
        owner: input.owner,
        nextReviewDate: input.nextReviewDate,
      }),
      "CourseTrack",
      "Phase 1 internal metadata edit",
      crypto.randomUUID(),
    ),
  ]);
  return true;
}

export async function recordRetrievalRun(input: {
  actorEmail: string;
  status: "Retrieved" | "Retrieved with Warnings" | "Retrieval Failed";
  message: string;
  received: number;
  failed: number;
}): Promise<string | null> {
  const database = await getD1Binding();
  if (!database) return null;
  await ensureDatabase();
  const id = `RUN-${Date.now()}`;
  const now = new Date().toISOString();
  await database.prepare(
    `INSERT INTO lms_retrieval_runs (
      id, provider, started_at, completed_at, status, records_requested,
      records_received, records_failed, message, initiated_by
    ) VALUES (?, 'Mock LMS', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      now,
      now,
      input.status,
      sampleCourses.length,
      input.received,
      input.failed,
      input.message,
      input.actorEmail,
    )
    .run();
  return id;
}
