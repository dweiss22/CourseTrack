import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import "./register-aliases.mjs";
import { assertCourseWorkbookBaseline, loadCourseWorkbookDataset } from "./course-workbook-loader.mjs";

const { calculateMetadataCompleteness } = await import("../lib/source-normalization.ts");

const args = new Set(process.argv.slice(2));
const valueFor = (name, fallback) => {
  const item = process.argv.slice(2).find((value) => value.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : fallback;
};
const apply = args.has("--apply");
const sourceDirectory = path.resolve(valueFor("--source-dir", "Files"));
const asOfDate = valueFor("--as-of", new Date().toISOString().slice(0, 10));
const importedAt = `${asOfDate}T12:00:00.000Z`;

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(jsonSafe(value))).digest("hex");
}

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match?.[1] ?? null;
}

function creditHours(trainingCredits) {
  if (trainingCredits?.amount === null || trainingCredits?.amount === undefined) return 0;
  return trainingCredits.unit === "minutes" ? trainingCredits.amount / 60 : trainingCredits.amount;
}

function addDays(isoDateValue, days) {
  const date = new Date(`${isoDateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function projectionFor(course) {
  const lms = course.lms?.normalized ?? null;
  const metadata = course.projection;
  const verticals = metadata?.verticals?.length ? metadata.verticals : lms?.mappedVerticals ?? [];
  const primaryVertical = verticals[0] ?? "Unclassified";
  const published = metadata?.published ?? lms?.isPublished ?? null;
  return {
    appId: `LMS-${course.courseId}`,
    courseCode: course.courseId,
    title: metadata?.courseName ?? lms?.courseName,
    shortTitle: null,
    description: metadata?.description ?? lms?.courseDescription ?? null,
    learningAudience: null,
    primaryVertical,
    secondaryVerticals: verticals.filter((value) => value !== primaryVertical),
    primaryTopic: lms?.publicTopics?.[0] ?? lms?.privateTopics?.[0] ?? null,
    managementClassification: metadata ? "Lexipol managed" : lms?.isLexipol === true ? "Lexipol managed" : "Unclassified",
    monitoringEnabled: true,
    lifecycleStatus: published ? "Published" : "In Development",
    publicationStatus: published ? "Published" : course.lms ? "Inactive" : "Not in LMS",
    contentType: metadata?.contentType ?? lms?.courseType ?? "",
    durationMinutes: metadata?.durationMinutes ?? lms?.durationMinutes ?? null,
    trainingCredits: metadata?.trainingCredits ?? lms?.trainingCredits ?? { rawDisplay: null, amount: null, unit: null },
    published,
    authoringTool: metadata?.authoringTool ?? null,
    stateCode: null,
    owner: null,
    instructionalDesigner: null,
    publishedDate: metadata?.publishedDate ?? lms?.publishedDate ?? null,
    lastMajorRevisionDate: lms?.lastRevisionDate ?? null,
    nextReviewDate: null,
    backendLink: metadata?.backendLink ?? null,
    frontendLink: metadata?.frontendLink ?? null,
    updateType: metadata?.updateType ?? null,
    contentUpdatedAt: isoDate(metadata?.updatedRawValue),
    contentNotes: metadata?.notes ?? null,
    internalSummary: metadata?.notes ?? "",
    projectionOrigin: course.metadata ? "master_import" : "lms_export",
    reconciliationStatus: course.metadata && course.lms
      ? "Matched between LMS and Content Metadata"
      : course.metadata
        ? "Content Metadata only / missing from LMS"
        : "LMS only / missing Content Metadata",
    retrievalStatus: course.lms ? "Retrieved" : "Not connected",
    sourceDifferenceCount: course.comparisons.filter((item) => item.comparisonStatus === "Conflict").length,
  };
}

async function loadEnvFile(fileName) {
  try {
    const content = await readFile(fileName, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = /^([^#=]+)=(.*)$/.exec(line);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function batches(items, size, operation) {
  for (let index = 0; index < items.length; index += size) {
    await operation(items.slice(index, index + size), index / size + 1);
  }
}

async function allRows(client, table, columns) {
  const result = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    result.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return result;
}

async function applyDataset(dataset) {
  await loadEnvFile(path.resolve(".env.local"));
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Apply mode requires SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const verticalRows = await allRows(client, "verticals", "id,slug");
  const verticalBySlug = new Map(verticalRows.map((row) => [String(row.slug).toUpperCase(), row.id]));
  const fallbackVerticalId = verticalBySlug.get("UNCLASSIFIED") ?? verticalBySlug.get("LEXIPOL") ?? verticalRows[0]?.id;
  if (!fallbackVerticalId) throw new Error("No CourseTrack verticals are configured.");

  const existingCourses = await allRows(client, "courses", "id,app_id,lms_course_id,course_code,title,short_title,description,learning_audience,primary_vertical_id,primary_topic,management_classification,monitoring_enabled,lifecycle_status,publication_status,delivery_format,duration_minutes,training_credits,is_published,authoring_tool,original_publish_date,last_major_revision_date,backend_link,frontend_link,content_update_type,content_updated_at,content_notes,internal_summary,has_manual_overrides,field_provenance,updated_at");
  const existingByLmsId = new Map(existingCourses.filter((row) => row.lms_course_id).map((row) => [String(row.lms_course_id), row]));
  const keepOverride = (existing, key, sourceValue, column) =>
    existing?.field_provenance?.[key] === "coursetrack" ? existing[column] : sourceValue;
  const courseRows = [];
  for (const course of dataset.courses) {
    const existing = existingByLmsId.get(course.courseId);
    const value = projectionFor(course);
    courseRows.push({
      app_id: existing?.app_id ?? value.appId,
      course_code: keepOverride(existing, "courseId", value.courseCode, "course_code"),
      lms_course_id: course.courseId,
      title: keepOverride(existing, "courseName", value.title, "title"),
      short_title: keepOverride(existing, "shortTitle", value.shortTitle, "short_title"),
      description: keepOverride(existing, "description", value.description, "description"),
      learning_audience: keepOverride(existing, "learningAudience", value.learningAudience, "learning_audience"),
      primary_vertical_id: keepOverride(existing, "primaryVertical", verticalBySlug.get(value.primaryVertical.toUpperCase()) ?? fallbackVerticalId, "primary_vertical_id"),
      primary_topic: keepOverride(existing, "primaryTopic", value.primaryTopic, "primary_topic"),
      lifecycle_status: keepOverride(existing, "lifecycleStatus", value.lifecycleStatus, "lifecycle_status"),
      publication_status: keepOverride(existing, "publicationStatus", value.publicationStatus, "publication_status"),
      delivery_format: keepOverride(existing, "contentType", value.contentType, "delivery_format"),
      duration_minutes: keepOverride(existing, "durationMinutes", value.durationMinutes, "duration_minutes"),
      training_credits: jsonSafe(keepOverride(existing, "trainingCredits", value.trainingCredits, "training_credits")),
      is_published: keepOverride(existing, "published", value.published, "is_published"),
      authoring_tool: keepOverride(existing, "authoringTool", value.authoringTool, "authoring_tool"),
      original_publish_date: keepOverride(existing, "publishedDate", value.publishedDate, "original_publish_date"),
      last_major_revision_date: keepOverride(existing, "lastMajorRevisionDate", value.lastMajorRevisionDate, "last_major_revision_date"),
      backend_link: keepOverride(existing, "backendLink", value.backendLink, "backend_link"),
      frontend_link: keepOverride(existing, "frontendLink", value.frontendLink, "frontend_link"),
      content_update_type: keepOverride(existing, "updateType", value.updateType, "content_update_type"),
      content_updated_at: keepOverride(existing, "contentUpdatedAt", value.contentUpdatedAt, "content_updated_at"),
      content_notes: keepOverride(existing, "notes", value.contentNotes, "content_notes"),
      management_classification: keepOverride(existing, "managementClassification", value.managementClassification, "management_classification"),
      monitoring_enabled: keepOverride(existing, "monitoringEnabled", value.monitoringEnabled, "monitoring_enabled"),
      reconciliation_status: value.reconciliationStatus,
      retrieval_status: value.retrievalStatus,
      last_retrieved_at: course.lms ? dataset.importedAt : null,
      source_system: value.projectionOrigin === "master_import" ? "LMS new list - master.xlsx" : "LMS workbook exports",
      data_source: "uploaded",
      provenance: "uploaded",
      origin_provenance: "uploaded",
      projection_origin: value.projectionOrigin,
      has_manual_overrides: existing?.has_manual_overrides ?? false,
      source_difference_count: value.sourceDifferenceCount,
      field_provenance: existing?.field_provenance ?? {},
      health_status: "Needs Review",
      health_score: 0,
      metadata_completeness_score: calculateMetadataCompleteness(course.metadata),
      internal_summary: keepOverride(existing, "internalSummary", value.internalSummary, "internal_summary"),
      mapping_warnings: jsonSafe([...(course.lms?.warnings ?? []), ...(course.metadata?.mappingWarnings ?? [])]),
      import_validation_errors: jsonSafe(course.metadata?.validationErrors ?? []),
      source_payload: jsonSafe(course.metadata?.rawPayload ?? course.lms?.rawPayload ?? {}),
      is_sample: false,
    });
  }
  await batches(courseRows, 250, async (rows) => {
    const { error } = await client.from("courses").upsert(rows, { onConflict: "lms_course_id" });
    if (error) throw new Error(`Could not upsert course projections: ${error.message}`);
  });

  const persistedCourses = await allRows(client, "courses", "id,app_id,lms_course_id,course_code,title,description,delivery_format,duration_minutes,training_credits,is_published,authoring_tool,original_publish_date,backend_link,frontend_link,content_update_type,content_updated_at,content_notes,has_manual_overrides,field_provenance");
  const persistedByLmsId = new Map(persistedCourses.filter((row) => row.lms_course_id).map((row) => [String(row.lms_course_id), row]));

  const importedCourseIds = dataset.courses
    .map((course) => persistedByLmsId.get(course.courseId))
    .filter((course) => course && course.field_provenance?.secondaryVerticals !== "coursetrack")
    .map((course) => course.id);
  await batches(importedCourseIds, 500, async (courseIds) => {
    const { error } = await client.from("course_verticals").delete().in("course_id", courseIds).eq("relationship_type", "secondary");
    if (error) throw new Error(`Could not replace imported secondary verticals: ${error.message}`);
  });
  const secondaryVerticalRows = dataset.courses.flatMap((course) => {
    const persisted = persistedByLmsId.get(course.courseId);
    if (!persisted || persisted.field_provenance?.secondaryVerticals === "coursetrack") return [];
    const projection = projectionFor(course);
    return projection.secondaryVerticals.flatMap((vertical) => {
      const verticalId = verticalBySlug.get(vertical.toUpperCase());
      return verticalId ? [{ course_id: persisted.id, vertical_id: verticalId, relationship_type: "secondary" }] : [];
    });
  });
  await batches(secondaryVerticalRows, 250, async (rows) => {
    const { error } = await client.from("course_verticals").upsert(rows, { onConflict: "course_id,vertical_id" });
    if (error) throw new Error(`Could not import secondary verticals: ${error.message}`);
  });

  const retrievalRunId = `workbook-${dataset.importedAt.replace(/\D/g, "").slice(0, 14)}`;
  const { data: retrievalRun, error: retrievalError } = await client.from("lms_retrieval_runs").upsert({
    external_run_id: retrievalRunId,
    provider: "Workbook LMS export",
    started_at: dataset.importedAt,
    completed_at: null,
    status: "Running",
    records_requested: dataset.summary.lmsCourses,
    records_received: 0,
    records_failed: 0,
    message: "Importing supplied all_* LMS workbooks.",
  }, { onConflict: "external_run_id" }).select("id").single();
  if (retrievalError) throw new Error(`Could not create the LMS retrieval run: ${retrievalError.message}`);

  const { error: currentError } = await client.from("lms_snapshots").update({ is_current: false }).eq("provider", "Workbook LMS export").eq("is_current", true);
  if (currentError) throw new Error(`Could not retire prior workbook snapshots: ${currentError.message}`);
  const snapshots = dataset.courses.filter((course) => course.lms).map((course) => ({
    course_id: persistedByLmsId.get(course.courseId)?.id ?? null,
    provider: "Workbook LMS export",
    external_id: course.courseId,
    retrieval_run_id: retrievalRun.id,
    retrieved_at: dataset.importedAt,
    normalized_payload: jsonSafe(course.lms.normalized),
    raw_payload: jsonSafe(course.lms.rawPayload),
    payload_hash: hash(course.lms.rawPayload),
    mapping_warnings: jsonSafe(course.lms.warnings),
    is_current: true,
    source_transport: "uploaded",
  }));
  await batches(snapshots, 200, async (rows) => {
    const { error } = await client.from("lms_snapshots").insert(rows);
    if (error) throw new Error(`Could not insert LMS snapshots: ${error.message}`);
  });

  const { data: importRun, error: importError } = await client.from("content_metadata_import_runs").insert({
    source_filename: "LMS new list - master.xlsx",
    status: "Confirmed",
    column_mapping: { source: "Master", verticalAlias: { EMS1A: "EMS1" } },
    preview_summary: dataset.summary,
    row_count: dataset.summary.courseTrackCourses,
    confirmed_at: dataset.importedAt,
  }).select("id").single();
  if (importError) throw new Error(`Could not create the CourseTrack import run: ${importError.message}`);
  const { error: retireMetadataError } = await client.from("content_metadata_records").update({ is_current: false }).eq("is_current", true);
  if (retireMetadataError) throw new Error(`Could not retire prior metadata records: ${retireMetadataError.message}`);
  const metadataRows = dataset.courses.filter((course) => course.metadata).map((course, index) => ({
    import_run_id: importRun.id,
    row_number: index + 2,
    course_id: persistedByLmsId.get(course.courseId)?.id ?? null,
    raw_course_id: jsonSafe(course.metadata.rawCourseId),
    lms_course_id: course.courseId,
    normalized_payload: jsonSafe(course.metadata),
    raw_payload: jsonSafe(course.metadata.rawPayload),
    mapping_warnings: jsonSafe(course.metadata.mappingWarnings),
    validation_errors: jsonSafe(course.metadata.validationErrors),
    is_importable: course.metadata.validationErrors.length === 0,
    is_current: true,
  }));
  await batches(metadataRows, 250, async (rows) => {
    const { error } = await client.from("content_metadata_records").insert(rows);
    if (error) throw new Error(`Could not insert CourseTrack metadata records: ${error.message}`);
  });

  const comparisonRows = dataset.courses.flatMap((course) => {
    const persisted = persistedByLmsId.get(course.courseId);
    if (!persisted) return [];
    const metadataOnly = course.metadata ? [
      ["authoringTool", "Authoring Tool", course.metadata.authoringTool],
      ["backendLink", "LMS Backend Link", course.metadata.backendLink],
      ["frontendLink", "LMS Frontend Link", course.metadata.frontendLink],
      ["updateType", "Update Type", course.metadata.updateType],
      ["contentUpdatedAt", "Updated", isoDate(course.metadata.updatedRawValue)],
      ["notes", "Notes", course.metadata.notes],
    ].map(([fieldKey, fieldLabel, value]) => ({ fieldKey, fieldLabel, lmsRawValue: null, lmsNormalizedValue: null, contentMetadataRawValue: value, contentMetadataNormalizedValue: value, resolvedValue: value, selectedSource: "content_metadata", comparisonStatus: "Content Metadata only", resolutionReason: "This field is supplied by uploaded metadata.", fieldScope: "metadata_only" })) : [];
    return [...course.comparisons.map((item) => ({ ...item, fieldScope: "shared" })), ...metadataOnly].map((comparison) => ({
      course_id: persisted.id,
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
      last_compared_at: dataset.importedAt,
      is_comparable: true,
      field_scope: comparison.fieldScope,
    }));
  });
  await batches(comparisonRows, 250, async (rows) => {
    const { error } = await client.from("field_comparisons").upsert(rows, { onConflict: "course_id,field_key" });
    if (error) throw new Error(`Could not upsert source comparisons: ${error.message}`);
  });

  const existingAccreditations = await allRows(client, "accreditation_records", "id,course_id,organization,jurisdiction,approval_number,topic_number,source_topic_number,effective_date,expiration_date,source_fingerprint");
  const existingFingerprints = new Set(existingAccreditations.filter((row) => row.source_fingerprint).map((row) => `${row.course_id}:${row.source_fingerprint}`));
  const accreditationSignature = (courseId, organization, jurisdiction, approvalNumber, topicNumber, effectiveDate, expirationDate) => JSON.stringify([courseId, organization ?? null, jurisdiction ?? null, approvalNumber ?? null, topicNumber ?? null, effectiveDate ?? null, expirationDate ?? null]);
  const existingBySignature = new Map();
  for (const row of existingAccreditations) {
    const signature = accreditationSignature(row.course_id, row.organization, row.jurisdiction, row.approval_number, row.topic_number ?? row.source_topic_number, row.effective_date, row.expiration_date);
    existingBySignature.set(signature, [...(existingBySignature.get(signature) ?? []), row]);
  }
  const accreditationRows = [];
  const accreditationBackfills = [];
  const riskWindowEnd = addDays(dataset.asOfDate, 90);
  for (const course of dataset.courses) {
    const persisted = persistedByLmsId.get(course.courseId);
    if (!persisted || !course.lms) continue;
    for (const item of course.lms.normalized.accreditations) {
      const fingerprint = hash([course.courseId, item.issuingBody, item.state, item.accreditationNumber, item.topicNumber, item.startDate, item.endDate]);
      if (existingFingerprints.has(`${persisted.id}:${fingerprint}`)) continue;
      const exactMatches = existingBySignature.get(accreditationSignature(persisted.id, item.issuingBody, item.state, item.accreditationNumber, item.topicNumber, item.startDate, item.endDate)) ?? [];
      const legacyMatches = item.state === null
        ? existingBySignature.get(accreditationSignature(persisted.id, item.issuingBody, "National", item.accreditationNumber, item.topicNumber, item.startDate, item.endDate)) ?? []
        : [];
      const matches = [...new Map([...exactMatches, ...legacyMatches].map((row) => [row.id, row])).values()];
      if (matches.length === 1 && !matches[0].source_fingerprint) {
        accreditationBackfills.push({
          id: matches[0].id, organization: item.issuingBody, jurisdiction: item.state,
          source_fingerprint: fingerprint, source_topic_number: item.topicNumber, topic_number: item.topicNumber,
          source_record_index: item.index, source_retrieval_run_id: retrievalRun.id, source_domain: "lms", source_transport: "uploaded",
          source_system: "Workbook LMS export", data_source: "uploaded", provenance: "uploaded", origin_provenance: "uploaded",
          source_payload: jsonSafe({ ...item.rawValues, topicNumber: item.topicNumber }),
          source_normalized_payload: jsonSafe({ organization: item.issuingBody, jurisdiction: item.state, approvalNumber: item.accreditationNumber, topicNumber: item.topicNumber, effectiveDate: item.startDate, expirationDate: item.endDate }),
          alignment_status: "In sync", retrieved_at: dataset.importedAt,
        });
        existingFingerprints.add(`${persisted.id}:${fingerprint}`);
        continue;
      }
      const expired = item.endDate && item.endDate < dataset.asOfDate;
      const soon = item.endDate && item.endDate >= dataset.asOfDate && item.endDate <= riskWindowEnd;
      accreditationRows.push({
        course_id: persisted.id,
        external_accreditation_id: `${course.courseId}:${item.index}`,
        organization: item.issuingBody,
        jurisdiction: item.state,
        status: expired ? "Expired" : soon ? "Expiring Soon" : "Approved",
        approval_number: item.accreditationNumber,
        credit_hours: creditHours(course.lms.normalized.trainingCredits),
        effective_date: item.startDate,
        expiration_date: item.endDate,
        risk_reasons: [],
        topic_number: item.topicNumber,
        data_source: "uploaded",
        source_system: "Workbook LMS export",
        source_payload: jsonSafe({ ...item.rawValues, topicNumber: item.topicNumber }),
        provenance: "uploaded",
        origin_provenance: "uploaded",
        source_domain: "lms",
        source_transport: "uploaded",
        source_normalized_payload: jsonSafe({ organization: item.issuingBody, jurisdiction: item.state, approvalNumber: item.accreditationNumber, topicNumber: item.topicNumber, effectiveDate: item.startDate, expirationDate: item.endDate }),
        alignment_status: "In sync",
        retrieved_at: dataset.importedAt,
        source_fingerprint: fingerprint,
        source_topic_number: item.topicNumber,
        source_record_index: item.index,
        source_retrieval_run_id: retrievalRun.id,
      });
    }
  }
  await batches(accreditationBackfills, 200, async (rows) => {
    const { error } = await client.from("accreditation_records").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`Could not backfill imported accreditation evidence: ${error.message}`);
  });
  await batches(accreditationRows, 200, async (rows) => {
    const { error } = await client.from("accreditation_records").insert(rows);
    if (error) throw new Error(`Could not insert LMS accreditation records: ${error.message}`);
  });

  const { error: refreshError } = await client.rpc("refresh_all_course_comparisons");
  if (refreshError) throw new Error(`Could not refresh CourseTrack source comparisons: ${refreshError.message}`);
  const { error: runCompleteError } = await client.from("lms_retrieval_runs").update({
    completed_at: new Date().toISOString(),
    status: "Retrieved",
    records_received: dataset.summary.lmsCourses,
    message: "Supplied LMS workbooks imported successfully.",
  }).eq("id", retrievalRun.id);
  if (runCompleteError) throw new Error(`Could not complete the LMS run: ${runCompleteError.message}`);
  const { error: importCompleteError } = await client.from("content_metadata_import_runs").update({
    status: "Completed",
    completed_at: new Date().toISOString(),
  }).eq("id", importRun.id);
  if (importCompleteError) throw new Error(`Could not complete the CourseTrack import run: ${importCompleteError.message}`);
  const acceptance = {
    courses: (await allRows(client, "courses", "id")).length,
    currentLmsSnapshots: (await allRows(client, "lms_snapshots", "id,is_current")).filter((row) => row.is_current).length,
    currentMetadataRecords: (await allRows(client, "content_metadata_records", "id,is_current")).filter((row) => row.is_current).length,
    accreditationSources: (await allRows(client, "accreditation_records", "id,source_domain,source_transport,topic_number")).filter((row) => row.source_domain === "lms" && row.source_transport === "uploaded"),
  };
  if (acceptance.currentLmsSnapshots !== 18_406 || acceptance.currentMetadataRecords !== 1_952 || acceptance.accreditationSources.length < 19_571 || acceptance.accreditationSources.filter((row) => row.topic_number).length < 513 || acceptance.courses < 18_530) {
    throw new Error(`Post-import acceptance failed: ${JSON.stringify({ ...acceptance, accreditationSources: acceptance.accreditationSources.length })}`);
  }
  return { insertedCourseProjections: courseRows.length, secondaryVerticals: secondaryVerticalRows.length, snapshots: snapshots.length, metadataRecords: metadataRows.length, comparisons: comparisonRows.length, accreditationsBackfilled: accreditationBackfills.length, accreditationsAdded: accreditationRows.length };
}

const dataset = await loadCourseWorkbookDataset(sourceDirectory, { importedAt, asOfDate });
assertCourseWorkbookBaseline(dataset);
const output = { mode: apply ? "apply" : "dry-run", files: dataset.files, summary: dataset.summary };
if (apply) output.applied = await applyDataset(dataset);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
