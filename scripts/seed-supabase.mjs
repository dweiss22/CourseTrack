// Populates Supabase with the full relational graph behind every sample
// course (versions, accreditations, flags, notes, revamp proposals, LMS
// snapshots, content metadata, field comparisons, topics, relationships).
//
// Every row id is a deterministic UUID derived from a stable natural key
// (see uuidFor below), so this script is safe to re-run: it always upserts
// the same primary keys instead of accumulating duplicates.
//
// Run with:
//   node --import ./scripts/register-aliases.mjs --env-file=.env.local scripts/seed-supabase.mjs
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  sampleCourses,
  sampleRetrievalRuns,
  sampleImportPreviews,
} from "@/lib/sample-data";
import { mockSourceStats } from "@/lib/imported-sample-data";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see .env.local).");
  process.exit(1);
}
const client = createClient(url, key);

const SYSTEM_PROFILE_EMAIL = "coursetrack-import@system.local";
const CHUNK_SIZE = 200;

function uuidFor(key) {
  const hash = createHash("sha256").update(key).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

function jsonSafe(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function chunk(items, size) {
  const chunks = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

async function upsertAll(table, rows, label = table) {
  if (rows.length === 0) return;
  let done = 0;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const { error } = await client.from(table).upsert(batch, { onConflict: "id" });
    if (error) {
      throw new Error(`Upsert into ${table} failed: ${error.message}`);
    }
    done += batch.length;
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}`);
  }
  console.log();
}

async function ensureSystemProfile() {
  const { data: existing, error: lookupError } = await client
    .from("profiles")
    .select("id")
    .eq("email", SYSTEM_PROFILE_EMAIL)
    .maybeSingle();
  if (lookupError) throw new Error(`Could not look up system profile: ${lookupError.message}`);
  if (existing) return existing.id;

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: SYSTEM_PROFILE_EMAIL,
    email_confirm: true,
    user_metadata: { display_name: "CourseTrack Import" },
  });
  if (createError) throw new Error(`Could not create system auth user: ${createError.message}`);

  const { error: profileError } = await client.from("profiles").insert({
    id: created.user.id,
    email: SYSTEM_PROFILE_EMAIL,
    display_name: "CourseTrack Import",
    role: "content",
    account_status: "disabled",
  });
  if (profileError) throw new Error(`Could not create system profile: ${profileError.message}`);
  return created.user.id;
}

async function loadVerticalIds() {
  const { data, error } = await client.from("verticals").select("id,slug");
  if (error) throw new Error(`Could not load verticals: ${error.message}`);
  return new Map(data.map((row) => [row.slug, row.id]));
}

async function main() {
  const limit = process.env.SEED_LIMIT ? Number(process.env.SEED_LIMIT) : sampleCourses.length;
  const coursesToSeed = sampleCourses.slice(0, limit);
  console.log(`Seeding ${coursesToSeed.length} of ${sampleCourses.length} sample courses into Supabase...`);

  const systemProfileId = await ensureSystemProfile();
  const verticalIdBySlug = await loadVerticalIds();
  const verticalSlug = (vertical) => vertical.toLowerCase();

  const retrievalRunSample = sampleRetrievalRuns[0];
  const retrievalRunId = uuidFor(`retrieval-run:${retrievalRunSample.id}`);
  const contentMetadataImportRunId = uuidFor("import-run:content-metadata");
  const topicsImportRunId = uuidFor("import-run:topics");

  // --- Import runs & retrieval run (parents referenced by every course) ---
  await upsertAll("lms_retrieval_runs", [
    {
      id: retrievalRunId,
      external_run_id: retrievalRunSample.id,
      provider: retrievalRunSample.provider,
      started_at: retrievalRunSample.startedAt,
      completed_at: retrievalRunSample.completedAt,
      status: retrievalRunSample.status,
      records_requested: retrievalRunSample.recordsRequested,
      records_received: retrievalRunSample.recordsReceived,
      records_failed: retrievalRunSample.recordsFailed,
      message: retrievalRunSample.message,
      initiated_by_email: SYSTEM_PROFILE_EMAIL,
    },
  ], "lms_retrieval_runs");

  await upsertAll("content_metadata_import_runs", [
    {
      id: contentMetadataImportRunId,
      source_filename: "LMS new list - master.xlsx",
      status: "Completed",
      column_mapping: {},
      preview_summary: jsonSafe(sampleImportPreviews.contentMetadata),
      row_count: mockSourceStats.metadataRows,
      imported_by_email: SYSTEM_PROFILE_EMAIL,
      confirmed_at: sampleCourses[0]?.sourceTimestamps.contentMetadataImportedAt ?? null,
      completed_at: sampleCourses[0]?.sourceTimestamps.contentMetadataImportedAt ?? null,
    },
    {
      id: topicsImportRunId,
      source_filename: "LMS new list - Topics.xlsx",
      status: "Completed",
      column_mapping: {},
      preview_summary: jsonSafe(sampleImportPreviews.topics),
      row_count: mockSourceStats.matchedTopicAssignments,
      imported_by_email: SYSTEM_PROFILE_EMAIL,
      confirmed_at: sampleCourses[0]?.sourceTimestamps.topicsImportedAt ?? null,
      completed_at: sampleCourses[0]?.sourceTimestamps.topicsImportedAt ?? null,
    },
  ], "content_metadata_import_runs");

  // --- Per-course rows, accumulated across all 1,952 courses ---
  const courseRows = [];
  const courseVerticalRows = [];
  const versionRows = [];
  const wrikeRefRows = [];
  const accreditationRows = [];
  const flagRows = [];
  const noteRows = [];
  const revampRows = [];
  const snapshotRows = [];
  const metadataRecordRows = [];
  const fieldComparisonRows = [];
  const topicByNormalizedLabel = new Map();
  const courseTopicRows = [];
  const tagByNormalizedLabel = new Map();
  const courseTagRows = [];
  const relationshipRows = [];

  coursesToSeed.forEach((course, courseIndex) => {
    const courseDbId = uuidFor(`course:${course.id}`);
    const verticalId = verticalIdBySlug.get(verticalSlug(course.primaryVertical));
    if (!verticalId) {
      throw new Error(`Unknown vertical "${course.primaryVertical}" for course ${course.id}`);
    }

    courseRows.push({
      id: courseDbId,
      app_id: course.id,
      course_code: course.courseCode,
      lms_course_id: course.lmsCourseId,
      management_classification: course.managementClassification,
      monitoring_enabled: course.monitoringEnabled,
      reconciliation_status: course.reconciliationStatus,
      resolved_fields: jsonSafe(course.resolvedFields),
      source_timestamps: jsonSafe(course.sourceTimestamps),
      mapping_warnings: jsonSafe(course.mappingWarnings),
      import_validation_errors: jsonSafe(course.importValidationErrors),
      title: course.title,
      short_title: course.shortTitle,
      description: course.description,
      learning_audience: course.learningAudience,
      primary_vertical_id: verticalId,
      primary_topic: course.primaryTopic,
      tags: course.tags,
      lifecycle_status: course.lifecycleStatus,
      publication_status: course.publicationStatus,
      delivery_format: course.deliveryFormat,
      duration_minutes: Math.max(0, course.durationMinutes),
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
      source_payload: jsonSafe(course.contentMetadata.rawPayload),
    });

    for (const vertical of course.secondaryVerticals) {
      const secondaryId = verticalIdBySlug.get(verticalSlug(vertical));
      if (!secondaryId) continue;
      courseVerticalRows.push({
        course_id: courseDbId,
        vertical_id: secondaryId,
        relationship_type: "secondary",
      });
    }

    for (const version of course.versions) {
      const versionDbId = uuidFor(`version:${version.id}`);
      versionRows.push({
        id: versionDbId,
        course_id: courseDbId,
        app_version_id: version.id,
        version_number: version.versionNumber,
        version_type: version.versionType,
        publication_date: version.publicationDate,
        is_current: version.isCurrent,
        authoring_tool: version.authoringTool,
        package_standard: version.packageStandard,
        release_notes: version.releaseNotes,
        data_source: "manual",
        source_system: "CourseTrack",
        version_status: version.versionStatus,
        managed_by: "CourseTrack",
        created_by_email: version.createdBy,
      });

      for (const ref of version.wrikeTaskReferences) {
        wrikeRefRows.push({
          id: uuidFor(`wrike-ref:${ref.id}`),
          course_version_id: versionDbId,
          external_task_id: ref.wrikeTaskId,
          task_title: ref.taskTitle,
          external_project_id: ref.projectId,
          project_title: ref.projectTitle,
          task_status: ref.taskStatus,
          assignee_names: jsonSafe(ref.assigneeNames),
          due_date: ref.dueDate,
          permalink: ref.permalink,
          provider_name: ref.provider,
          retrieved_at: ref.retrievedAt,
          raw_payload: {},
          linked_by_email: ref.linkedBy,
          linked_at: ref.linkedAt,
        });
      }
    }

    for (const record of course.accreditations) {
      accreditationRows.push({
        id: uuidFor(`accreditation:${record.id}`),
        course_id: courseDbId,
        external_accreditation_id: record.id,
        organization: record.organization,
        jurisdiction: record.jurisdiction,
        status: record.status,
        approval_number: record.approvalNumber,
        credit_hours: record.creditHours,
        effective_date: record.effectiveDate,
        expiration_date: record.expirationDate,
        risk_reasons: record.riskReasons,
        data_source: record.source,
        source_system: course.lmsSnapshot?.provider ?? course.sourceSystem,
        retrieved_at: course.lmsSnapshot?.retrievedAt ?? null,
        source_payload: {},
      });
    }

    for (const flag of course.flags) {
      flagRows.push({
        id: uuidFor(`flag:${flag.id}`),
        course_id: courseDbId,
        type: flag.type,
        title: flag.title,
        priority: flag.priority,
        status: flag.status,
        owner_id: null,
        due_date: flag.dueDate,
        created_by: systemProfileId,
      });
    }

    for (const note of course.notes) {
      noteRows.push({
        id: uuidFor(`note:${note.id}`),
        course_id: courseDbId,
        note_type: note.type,
        author_id: systemProfileId,
        visibility: note.visibility,
        body: note.body,
        created_at: note.createdAt,
      });
    }

    if (course.revampProposal) {
      const proposal = course.revampProposal;
      revampRows.push({
        id: uuidFor(`revamp:${proposal.id}`),
        course_id: courseDbId,
        title: proposal.title,
        status: proposal.status,
        priority: proposal.priority,
        score: proposal.score,
        business_justification: proposal.businessJustification,
        target_publication_date: proposal.targetPublicationDate,
        proposed_by: systemProfileId,
      });
    }

    if (course.lmsSnapshot) {
      const snapshot = course.lmsSnapshot;
      const normalizedPayload = jsonSafe(snapshot.normalized);
      const payloadHash = createHash("sha256")
        .update(JSON.stringify(normalizedPayload))
        .digest("hex");
      snapshotRows.push({
        id: uuidFor(`snapshot:${snapshot.id}`),
        course_id: courseDbId,
        provider: snapshot.provider,
        external_id: snapshot.lmsCourseId,
        retrieval_run_id: retrievalRunId,
        retrieved_at: snapshot.retrievedAt,
        normalized_payload: normalizedPayload,
        payload_hash: payloadHash,
        mapping_warnings: jsonSafe(snapshot.mappingWarnings),
        raw_payload: jsonSafe(snapshot.rawPayload),
        is_current: snapshot.isCurrent,
      });
    }

    const metadata = course.contentMetadata;
    metadataRecordRows.push({
      id: uuidFor(`metadata-record:${course.id}`),
      import_run_id: contentMetadataImportRunId,
      row_number: courseIndex + 1,
      course_id: courseDbId,
      raw_course_id: jsonSafe(metadata.rawCourseId),
      lms_course_id: metadata.lmsCourseId,
      normalized_payload: jsonSafe(metadata),
      raw_payload: jsonSafe(metadata.rawPayload),
      mapping_warnings: jsonSafe(metadata.mappingWarnings),
      validation_errors: jsonSafe(metadata.validationErrors),
      is_importable: metadata.validationErrors.length === 0,
    });

    for (const comparison of course.fieldComparisons) {
      fieldComparisonRows.push({
        id: uuidFor(`field-comparison:${course.id}:${comparison.fieldKey}`),
        course_id: courseDbId,
        field_key: comparison.fieldKey,
        field_label: comparison.fieldLabel,
        lms_raw_value: jsonSafe(comparison.lmsRawValue),
        lms_normalized_value: jsonSafe(comparison.lmsNormalizedValue),
        content_metadata_raw_value: jsonSafe(comparison.contentMetadataRawValue),
        content_metadata_normalized_value: jsonSafe(comparison.contentMetadataNormalizedValue),
        resolved_value: jsonSafe(comparison.resolvedValue),
        selected_source: comparison.selectedSource,
        comparison_status: comparison.comparisonStatus,
        resolution_reason: comparison.resolutionReason,
        resolved_by_email: comparison.resolvedBy,
        resolved_at: comparison.resolvedAt,
        last_compared_at: comparison.lastComparedAt,
      });
    }

    for (const assignment of course.topicAssignments) {
      const normalizedLabel = assignment.topic.trim().toLowerCase();
      if (!topicByNormalizedLabel.has(normalizedLabel)) {
        topicByNormalizedLabel.set(normalizedLabel, {
          id: uuidFor(`topic:${normalizedLabel}`),
          normalized_label: normalizedLabel,
          display_label: assignment.topic,
          original_label: assignment.originalTopicLabel,
        });
      }
      courseTopicRows.push({
        id: uuidFor(`course-topic:${assignment.id}`),
        topic_id: uuidFor(`topic:${normalizedLabel}`),
        course_id: courseDbId,
        external_course_id: course.lmsCourseId,
        assignment_source: assignment.source,
        import_run_id: assignment.importRunId ? topicsImportRunId : null,
        imported_at: assignment.assignedAt,
        raw_value: assignment.topic,
      });
    }

    for (const assignment of course.tagAssignments) {
      const normalizedLabel = assignment.tag.trim().toLowerCase();
      if (!normalizedLabel) continue;
      if (!tagByNormalizedLabel.has(normalizedLabel)) {
        tagByNormalizedLabel.set(normalizedLabel, {
          id: uuidFor(`tag:${normalizedLabel}`),
          normalized_label: normalizedLabel,
          display_label: assignment.tag,
        });
      }
      courseTagRows.push({
        id: uuidFor(`course-tag:${assignment.id}`),
        tag_id: uuidFor(`tag:${normalizedLabel}`),
        course_id: courseDbId,
        assignment_source: assignment.source,
        created_at: assignment.assignedAt,
      });
    }

    for (const relationship of course.relationships) {
      relationshipRows.push({
        id: uuidFor(`relationship:${relationship.id}`),
        course_id: courseDbId,
        relationship_type: relationship.relationship,
        related_course_id:
          relationship.validationStatus === "Resolved"
            ? uuidFor(`course:CT-${relationship.relatedCourseId}`)
            : null,
        related_lms_course_id: relationship.relatedCourseId,
        source: relationship.source,
        validation_status: relationship.validationStatus,
        raw_value: null,
      });
    }
  });

  // --- Write everything out, parents before children ---
  await upsertAll("courses", courseRows, "courses");
  if (courseVerticalRows.length > 0) {
    const { error } = await client
      .from("course_verticals")
      .upsert(courseVerticalRows, { onConflict: "course_id,vertical_id" });
    if (error) throw new Error(`Upsert into course_verticals failed: ${error.message}`);
    console.log(`  course_verticals: ${courseVerticalRows.length}/${courseVerticalRows.length}`);
  }
  await upsertAll("course_versions", versionRows, "course_versions");
  await upsertAll("version_wrike_task_references", wrikeRefRows, "version_wrike_task_references");
  await upsertAll("accreditation_records", accreditationRows, "accreditation_records");
  await upsertAll("course_flags", flagRows, "course_flags");
  await upsertAll("notes", noteRows, "notes");
  await upsertAll("revamp_proposals", revampRows, "revamp_proposals");
  await upsertAll("lms_snapshots", snapshotRows, "lms_snapshots");
  await upsertAll("content_metadata_records", metadataRecordRows, "content_metadata_records");
  await upsertAll("field_comparisons", fieldComparisonRows, "field_comparisons");
  await upsertAll("topics", [...topicByNormalizedLabel.values()], "topics");
  await upsertAll("course_topics", courseTopicRows, "course_topics");
  await upsertAll("tags", [...tagByNormalizedLabel.values()], "tags");
  await upsertAll("course_tags", courseTagRows, "course_tags");
  await upsertAll("course_relationships", relationshipRows, "course_relationships");

  console.log("\nSeed complete.");
  console.log({
    courses: courseRows.length,
    courseVerticals: courseVerticalRows.length,
    versions: versionRows.length,
    wrikeRefs: wrikeRefRows.length,
    accreditations: accreditationRows.length,
    flags: flagRows.length,
    notes: noteRows.length,
    revampProposals: revampRows.length,
    lmsSnapshots: snapshotRows.length,
    contentMetadataRecords: metadataRecordRows.length,
    fieldComparisons: fieldComparisonRows.length,
    topics: topicByNormalizedLabel.size,
    courseTopics: courseTopicRows.length,
    relationships: relationshipRows.length,
  });
}

main().catch((error) => {
  console.error("\nSeed failed:", error.message);
  process.exit(1);
});
