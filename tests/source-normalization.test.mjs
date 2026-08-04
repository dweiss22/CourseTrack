import assert from "node:assert/strict";
import test from "node:test";
import "../scripts/register-aliases.mjs";

const normalization = await import("../lib/source-normalization.ts");

const {
  CONTENT_METADATA_HEADERS,
  LMS_SOURCE_HEADERS,
  applyFieldResolution,
  calculateMetadataCompleteness,
  calculateSourceAwareMetrics,
  determineManagementClassification,
  normalizeBoolean,
  normalizeCourseId,
  normalizeDate,
  normalizeLmsDuration,
  normalizeNullable,
  parseAuthor,
  parseContentMetadataRow,
  parseContentMetadataRows,
  parseLmsRow,
  parseMonitoringRows,
  parseTopicsMatrix,
  previewContentMetadataImport,
  reconcileCourseSources,
  selectCurrentSnapshotAfterRetrieval,
  splitSemicolonValues,
} = normalization;

function lmsRow(overrides = {}) {
  return {
    "Course ID": 102319414,
    "Course Type": "Online Course",
    "Course Name": "Acute Spinal Injuries (BLS)",
    Duration: "1.50",
    "Course Description": "  A complete  spinal injury course.  ",
    "Public Topics": "Trauma; Airway Management and Ventilation",
    "Private Topics": "BLS; Patient Assessment;",
    Sites: "ems1_academy; firerescue1_academy;",
    "Published Date": "7/31/2025 4:10 PM",
    Author: "Jordan Lee (jordan.lee@example.com)",
    Owner: "Content Team",
    "Visibile in Organizations": "EMS Agencies; Fire Departments",
    "Hidden in Organizations": "N/A",
    "Author Status": "Active",
    "Is published": "1",
    "Has topics": "Yes",
    "Is Lexipol": true,
    "Generate Certificate": "Yes",
    "Available in States": "Virginia; Texas",
    "Hidden in States": "N/A",
    Surveys: "Pre-course; Post-course",
    "Created Date": "2025-07-01",
    "Last Revision Date": "2025-07-18T14:30:00Z",
    "Course Accreditation State": "Approved; Submitted",
    "Training Credits": "90 minutes",
    "Issuing Body": "VA EMS, CAPCE, Internal ID",
    State: "Virginia, N/A, N/A",
    "Accreditation Number": "97046, 25-LEXI-F3-9967, ASPIB102",
    "Topic Number": "41029, N/A, N/A",
    "Accreditation Start Date": "2025-07-31, 2025-07-18, 2025-07-01",
    "Accreditation End Date": "2027-09-30, 2028-07-18, N/A",
    ...overrides,
  };
}

function metadataRow(overrides = {}) {
  return {
    "Course Id": 102319414,
    "Course Name": "Acute Spinal Injuries (BLS)",
    "Content Type": "Single Video Course",
    "Duration (min)": 90,
    "Training Credits": "90 minutes",
    Published: "Yes",
    "Authoring Tool": "LMS",
    Description: "A complete spinal injury course.",
    "Backend Link": "https://admin.example.com/course/102319414",
    "Frontend Link": "https://academy.example.com/course/102319414",
    "Published Date": "2025-07-31",
    "Update Type": null,
    Updated: null,
    Verticals: "EMS1; FR1A",
    Parent: null,
    Child: null,
    Notes: null,
    ...overrides,
  };
}

test("LMS parsing recognizes all 31 headers and preserves source values", () => {
  assert.equal(LMS_SOURCE_HEADERS.length, 31);
  assert.deepEqual(Object.keys(lmsRow()), [...LMS_SOURCE_HEADERS]);

  const parsed = parseLmsRow(lmsRow());
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.normalized.courseId, "102319414");
  assert.equal(parsed.normalized.durationMinutes, 90);
  assert.equal(parsed.normalized.visibleInOrganizations.length, 2);
  assert.equal(parsed.normalized.isPublished, true);
  assert.equal(parsed.normalized.hasTopics, true);
  assert.equal(parsed.normalized.isLexipol, true);
  assert.deepEqual(parsed.normalized.privateTopics, ["BLS", "Patient Assessment"]);
  assert.deepEqual(parsed.normalized.mappedVerticals, ["EMS1", "FR1A"]);
  assert.equal(parsed.normalized.author.displayName, "Jordan Lee");
  assert.equal(parsed.normalized.author.email, "jordan.lee@example.com");
  assert.equal(parsed.normalized.publishedDate, "2025-07-31T16:10:00.000Z");
  assert.equal(parsed.normalized.accreditations.length, 3);
  assert.equal(parsed.normalized.accreditations[1].state, null);
  assert.equal(parsed.normalized.accreditations[2].topicNumber, null);
  assert.equal(parsed.normalized.accreditations[2].endDate, null);
  assert.equal(parsed.rawPayload.Duration, "1.50");
  assert.equal(parsed.rawPayload.State, "Virginia, N/A, N/A");
  assert.equal(parsed.warnings.some((warning) => warning.includes("parallel-list")), false);
});

test("LMS scalar normalizers handle IDs, booleans, dates, authors, lists, N/A, and uncertainty", () => {
  assert.deepEqual(normalizeCourseId(123456789), { value: "123456789", error: null });
  assert.deepEqual(normalizeCourseId("123.0"), { value: "123", error: null });
  assert.equal(normalizeCourseId(Number.MAX_SAFE_INTEGER + 1).value, null);
  for (const raw of [1, "Yes", "TRUE", true]) assert.equal(normalizeBoolean(raw).value, true);
  for (const raw of [0, "No", "false", false]) assert.equal(normalizeBoolean(raw).value, false);
  assert.equal(normalizeLmsDuration("1.50").value, 90);
  assert.match(normalizeLmsDuration("about an hour").error, /confidently interpret/);
  assert.equal(normalizeDate("2025-07-31").value, "2025-07-31");
  assert.equal(normalizeDate("2025-07-31T14:00:00Z").value, "2025-07-31T14:00:00.000Z");
  assert.equal(normalizeNullable("N/A"), null);
  assert.deepEqual(splitSemicolonValues("one; two;;"), ["one", "two"]);
  assert.equal(parseAuthor("Casey (casey@example.com)").email, "casey@example.com");

  const mismatch = parseLmsRow(lmsRow({
    "Issuing Body": "A, B, C",
    State: "Texas, Virginia",
    "Accreditation End Date": "2027-01-01, not-a-date, 2029-01-01",
  }));
  assert.equal(mismatch.normalized.accreditations.length, 3);
  assert.equal(mismatch.normalized.accreditations[2].issuingBody, "C");
  assert.match(mismatch.warnings.join(" "), /parallel-list lengths do not agree/);
  assert.match(mismatch.warnings.join(" "), /Could not normalize date/);
});

test("Content Metadata parser enforces the 17-column contract without penalizing blank optional fields", () => {
  assert.equal(CONTENT_METADATA_HEADERS.length, 17);
  assert.deepEqual(Object.keys(metadataRow()), [...CONTENT_METADATA_HEADERS]);

  const parsed = parseContentMetadataRow(metadataRow({
    "Course Id": 102046126,
    "Duration (min)": 15,
    "Training Credits": "15 minutes",
    "Published Date": 42871,
    Verticals: "FR1A, EMS1\nWellness",
  }));
  assert.deepEqual(parsed.validationErrors, []);
  assert.equal(parsed.lmsCourseId, "102046126");
  assert.equal(parsed.durationMinutes, 15);
  assert.deepEqual(parsed.trainingCredits, {
    rawDisplay: "15 minutes",
    amount: 15,
    unit: "minutes",
  });
  assert.equal(parsed.published, true);
  assert.equal(parsed.publishedDate, "2017-05-16");
  assert.deepEqual(parsed.verticals, ["FR1A", "EMS1", "Wellness"]);
  assert.equal(parsed.updateType, null);
  assert.equal(parsed.updatedRawValue, null);
  assert.equal(parsed.notes, null);
  assert.equal(parsed.rawCourseId, 102046126);
  assert.equal(parsed.rawPayload["Published Date"], 42871);
  assert.equal(calculateMetadataCompleteness(parsed), 100);

  assert.equal(parseContentMetadataRow(metadataRow({ "LMS ID": "444", "Course Id": undefined })).lmsCourseId, "444");
  const invalid = parseContentMetadataRow(metadataRow({
    "Duration (min)": 10.5,
    "Backend Link": "not-a-url",
    Verticals: "EMS1; FUTURE",
  }));
  assert.match(invalid.validationErrors.join(" "), /non-negative integer/);
  assert.match(invalid.validationErrors.join(" "), /Invalid URL/);
  assert.match(invalid.mappingWarnings.join(" "), /FUTURE/);
});

test("Content Metadata row validation reports duplicates, missing IDs, and invalid relationships", () => {
  const rows = [
    metadataRow({ "Course Id": "100", Child: "200; 300" }),
    metadataRow({ "Course Id": "200", Parent: "100", Child: "100" }),
    metadataRow({ "Course Id": "200" }),
    metadataRow({ "Course Id": "400", Parent: "400" }),
    metadataRow({ "Course Id": null }),
  ];
  const parsed = parseContentMetadataRows(rows);
  assert.deepEqual(parsed.duplicateIds, ["200"]);
  assert.equal(parsed.missingCourseIdCount, 1);
  assert.ok(parsed.relationshipErrors.some((error) => error.message.includes("300 was not found")));
  assert.ok(parsed.relationshipErrors.some((error) => error.message.includes("cannot reference itself")));
  assert.ok(parsed.relationshipErrors.some((error) => error.type === "circular"));
  assert.ok(parsed.records.find((record) => record.lmsCourseId === "200").validationErrors.some((error) => error.includes("Duplicate")));
});

test("Topics matrix normalization preserves labels, deduplicates pairs, and reports unknown IDs", () => {
  const parsed = parseTopicsMatrix(
    [
      ["Trauma\u00a0 ", "Cardiology", "Empty Topic"],
      [102319414, 102319414, null],
      [102319414, 999999999, null],
    ],
    { knownCourseIds: ["102319414"], importRunId: "TOPICS-1", importedAt: "2026-07-31T12:00:00.000Z" },
  );
  assert.equal(parsed.preview.topicCount, 3);
  assert.equal(parsed.preview.assignmentCount, 3);
  assert.equal(parsed.preview.duplicateAssignments, 1);
  assert.equal(parsed.preview.emptyTopics, 1);
  assert.deepEqual(parsed.preview.unknownCourseIds, ["999999999"]);
  assert.equal(parsed.topics[0].name, "Trauma");
  assert.equal(parsed.topics[0].originalLabel, "Trauma\u00a0 ");
  assert.equal(parsed.assignments.filter((assignment) => assignment.lmsCourseId === "102319414").length, 2);
  assert.equal(parsed.assignments[0].source, "Topics import");
  assert.equal(parsed.assignments[0].importRunId, "TOPICS-1");
});

test("ID-based source reconciliation distinguishes matches, one-sided records, and every conflict field", () => {
  const matchedLms = parseLmsRow(lmsRow());
  const matchedMetadata = parseContentMetadataRow(metadataRow());
  const matched = reconcileCourseSources(matchedLms, matchedMetadata);
  assert.equal(matched.length, 6);
  assert.ok(matched.every((comparison) => comparison.comparisonStatus === "Match"));

  assert.ok(reconcileCourseSources(matchedLms, null).every((comparison) => comparison.comparisonStatus === "LMS only"));
  assert.ok(reconcileCourseSources(null, matchedMetadata).every((comparison) => comparison.comparisonStatus === "Content Metadata only"));

  const conflicts = reconcileCourseSources(
    matchedLms,
    parseContentMetadataRow(metadataRow({
      "Course Name": "Different name",
      "Duration (min)": 45,
      "Training Credits": "1 credit",
      Published: "No",
      Description: "Different description",
      "Published Date": "2025-08-01",
    })),
  );
  assert.deepEqual(
    conflicts.filter((comparison) => comparison.comparisonStatus === "Conflict").map((comparison) => comparison.fieldKey),
    ["courseName", "durationMinutes", "trainingCredits", "published", "description", "publishedDate"],
  );
  assert.ok(conflicts.every((comparison) => comparison.resolvedValue === null));

  const preview = previewContentMetadataImport(
    [matchedLms],
    [metadataRow({ "Course Id": "999999", "Course Name": matchedLms.normalized.courseName })],
  );
  assert.equal(preview.matchedLmsCourses, 0);
  assert.equal(preview.contentMetadataOnlyRecords, 1);
  assert.equal(preview.lmsCoursesMissingMetadata, 1);
});

test("field resolutions persist across comparison, clear cleanly, and create audits", () => {
  const lms = parseLmsRow(lmsRow());
  const metadata = parseContentMetadataRow(metadataRow({ "Course Name": "Content Team name" }));
  const conflict = reconcileCourseSources(lms, metadata).find((item) => item.fieldKey === "courseName");
  assert.ok(conflict);

  const selected = applyFieldResolution(
    conflict,
    "Keep Content Team value",
    "reviewer@example.com",
    "2026-07-31T12:00:00.000Z",
    "Confirmed by Content Team",
  );
  assert.equal(selected.comparison.selectedSource, "content_metadata");
  assert.equal(selected.comparison.resolvedValue, "Content Team name");
  assert.equal(selected.audit.action, "field_resolution.selected");

  const comparedAgain = reconcileCourseSources(lms, metadata, [selected.comparison]);
  const preserved = comparedAgain.find((item) => item.fieldKey === "courseName");
  assert.equal(preserved.selectedSource, "content_metadata");
  assert.equal(preserved.resolvedValue, "Content Team name");

  const cleared = applyFieldResolution(
    preserved,
    "Clear resolution and review again",
    "reviewer@example.com",
    "2026-07-31T13:00:00.000Z",
  );
  assert.equal(cleared.comparison.selectedSource, null);
  assert.equal(cleared.comparison.resolvedValue, null);
  assert.equal(cleared.audit.action, "field_resolution.cleared");
});

test("classification, monitoring records, excluded metrics, and failed snapshot preservation are deterministic", () => {
  assert.deepEqual(determineManagementClassification({ hasLmsRecord: true, hasContentMetadataMatch: true }), {
    classification: "Lexipol managed",
    monitoringEnabled: true,
    source: "Content Metadata match",
  });
  assert.deepEqual(determineManagementClassification({ hasLmsRecord: true, hasContentMetadataMatch: false }), {
    classification: "Unclassified",
    monitoringEnabled: true,
    source: "Default",
  });

  const monitoring = parseMonitoringRows(
    [{ id: 123, class: "Non-Lexipol tracked", enabled: "Yes", why: "Partner course" }],
    { courseId: "id", classification: "class", monitoringEnabled: "enabled", reason: "why" },
  )[0];
  assert.equal(monitoring.lmsCourseId, "123");
  assert.equal(monitoring.monitoringEnabled, true);
  assert.deepEqual(monitoring.validationErrors, []);

  const course = (classification) => ({
    managementClassification: classification,
    lmsSnapshot: {},
    contentMetadata: {},
    conflictCount: 0,
    reconciliationStatus: "Matched between LMS and Content Metadata",
    retrievalStatus: "Retrieved",
    importValidationErrors: [],
  });
  const courses = [course("Lexipol managed"), course("Non-Lexipol tracked"), course("Non-Lexipol excluded")];
  assert.equal(calculateSourceAwareMetrics(courses).portfolioCourseCount, 2);
  assert.equal(calculateSourceAwareMetrics(courses).totalLmsRetrieved, 3);
  assert.equal(calculateSourceAwareMetrics(courses, { includeExcluded: true }).portfolioCourseCount, 3);

  const lastGood = { id: "snapshot-1" };
  assert.equal(selectCurrentSnapshotAfterRetrieval({
    previousSuccessfulSnapshot: lastGood,
    nextSuccessfulSnapshot: null,
    retrievalStatus: "Retrieval Failed",
  }), lastGood);
});
