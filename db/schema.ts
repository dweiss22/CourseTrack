import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const profiles = sqliteTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    primaryRole: text("primary_role").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("profiles_email_idx").on(table.email)],
);

export const courses = sqliteTable(
  "courses",
  {
    id: text("id").primaryKey(),
    courseCode: text("course_code").notNull(),
    lmsCourseId: text("lms_course_id"),
    title: text("title").notNull(),
    primaryVertical: text("primary_vertical").notNull(),
    lifecycleStatus: text("lifecycle_status").notNull(),
    publicationStatus: text("publication_status").notNull(),
    owner: text("owner"),
    nextReviewDate: text("next_review_date"),
    healthStatus: text("health_status").notNull(),
    healthScore: integer("health_score").notNull(),
    metadataCompletenessScore: integer("metadata_completeness_score").notNull(),
    dataSource: text("data_source").notNull(),
    sourceSystem: text("source_system").notNull(),
    retrievalStatus: text("retrieval_status").notNull(),
    lastRetrievedAt: text("last_retrieved_at"),
    internalSummary: text("internal_summary").notNull().default(""),
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(true),
    payloadJson: text("payload_json").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("courses_code_idx").on(table.courseCode),
    uniqueIndex("courses_lms_id_idx").on(table.lmsCourseId),
    index("courses_vertical_idx").on(table.primaryVertical),
    index("courses_lifecycle_idx").on(table.lifecycleStatus),
    index("courses_review_date_idx").on(table.nextReviewDate),
    index("courses_health_idx").on(table.healthStatus),
  ],
);

export const courseVersions = sqliteTable(
  "course_versions",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    versionNumber: text("version_number").notNull(),
    versionType: text("version_type").notNull(),
    publicationDate: text("publication_date"),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
    dataSource: text("data_source").notNull(),
    payloadJson: text("payload_json").notNull(),
    ...timestamps,
  },
  (table) => [index("versions_course_idx").on(table.courseId)],
);

export const accreditationRecords = sqliteTable(
  "accreditation_records",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    organization: text("organization").notNull(),
    status: text("status").notNull(),
    expirationDate: text("expiration_date"),
    approvalNumber: text("approval_number"),
    creditHours: real("credit_hours").notNull().default(0),
    dataSource: text("data_source").notNull(),
    payloadJson: text("payload_json").notNull(),
    ...timestamps,
  },
  (table) => [
    index("accreditation_course_idx").on(table.courseId),
    index("accreditation_expiration_idx").on(table.expirationDate),
  ],
);

export const courseFlags = sqliteTable(
  "course_flags",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
    owner: text("owner"),
    dueDate: text("due_date"),
    ...timestamps,
  },
  (table) => [
    index("flags_course_idx").on(table.courseId),
    index("flags_status_priority_idx").on(table.status, table.priority),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    noteType: text("note_type").notNull(),
    author: text("author").notNull(),
    visibility: text("visibility").notNull(),
    body: text("body").notNull(),
    deletedAt: text("deleted_at"),
    ...timestamps,
  },
  (table) => [index("notes_course_idx").on(table.courseId)],
);

export const revampProposals = sqliteTable(
  "revamp_proposals",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    title: text("title").notNull(),
    status: text("status").notNull(),
    priority: text("priority").notNull(),
    score: integer("score").notNull(),
    businessJustification: text("business_justification").notNull(),
    targetPublicationDate: text("target_publication_date"),
    ...timestamps,
  },
  (table) => [index("revamp_course_idx").on(table.courseId)],
);

export const lmsRetrievalRuns = sqliteTable(
  "lms_retrieval_runs",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    status: text("status").notNull(),
    recordsRequested: integer("records_requested").notNull().default(0),
    recordsReceived: integer("records_received").notNull().default(0),
    recordsFailed: integer("records_failed").notNull().default(0),
    message: text("message").notNull().default(""),
    initiatedBy: text("initiated_by"),
    ...timestamps,
  },
  (table) => [index("retrieval_runs_started_idx").on(table.startedAt)],
);

export const lmsSnapshots = sqliteTable(
  "lms_snapshots",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").references(() => courses.id),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    retrievalRunId: text("retrieval_run_id").references(() => lmsRetrievalRuns.id),
    retrievedAt: text("retrieved_at").notNull(),
    normalizedJson: text("normalized_json").notNull(),
    payloadHash: text("payload_hash").notNull(),
    mappingWarningsJson: text("mapping_warnings_json").notNull().default("[]"),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("snapshots_external_idx").on(table.provider, table.externalId),
    index("snapshots_course_idx").on(table.courseId),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    recordType: text("record_type").notNull(),
    recordId: text("record_id").notNull(),
    previousValuesJson: text("previous_values_json"),
    newValuesJson: text("new_values_json"),
    source: text("source").notNull(),
    reason: text("reason"),
    correlationId: text("correlation_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_record_idx").on(table.recordType, table.recordId),
    index("audit_created_idx").on(table.createdAt),
  ],
);
