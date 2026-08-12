import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { assertCourseWorkbookBaseline, loadCourseWorkbookDataset } from "../scripts/course-workbook-loader.mjs";
import { projectionFor } from "../scripts/import-course-workbooks.mjs";

const workbookDirectory = path.resolve("Files");
const workbookTestOptions = existsSync(workbookDirectory)
  ? {}
  : { skip: "Source workbooks are not committed; run this acceptance test in an environment with Files/." };

test("LMS and CourseTrack workbooks reproduce the accepted import baseline", workbookTestOptions, async () => {
  const dataset = await loadCourseWorkbookDataset(workbookDirectory, { asOfDate: "2026-08-04", importedAt: "2026-08-04T12:00:00.000Z" });
  assert.doesNotThrow(() => assertCourseWorkbookBaseline(dataset));
  assert.deepEqual(dataset.summary, {
    lmsCourses: 18_406,
    courseTrackCourses: 1_952,
    unionCourses: 18_530,
    overlap: 1_828,
    lmsOnly: 16_578,
    courseTrackOnly: 124,
    initialDifferenceCount: 8,
    accreditationRecordCount: 19_571,
    accreditationTopicNumberCount: 513,
    accreditationGroupCount: 7_299,
    standardCourseCount: 16_544,
    atRiskCourses: 697,
  });
  const ids = dataset.courses.map((course) => course.courseId);
  assert.equal(new Set(ids).size, ids.length, "stable union contains no duplicate course IDs");
  assert.ok(dataset.courses.some((course) => course.metadata && !course.lms), "master-only courses remain discoverable");
  assert.ok(dataset.courses.some((course) => course.lms && !course.metadata), "LMS-only courses receive display projections");
  const projections = dataset.courses.map((course) => ({ course, projection: projectionFor(course) }));
  assert.equal(projections.filter(({ projection }) => projection.managementClassification === "Lexipol managed").length, 1_952);
  assert.equal(projections.filter(({ projection }) => projection.managementClassification === "Unclassified").length, 16_578);
  const multiSiteLmsOnly = projections.find(({ course }) =>
    !course.metadata
    && ["ems1_academy", "firerescue1_academy", "policeone_academy"].every((site) => course.lms?.normalized.sites.includes(site)),
  );
  assert.ok(multiSiteLmsOnly, "the three-site LMS example exists in the source baseline");
  assert.equal(multiSiteLmsOnly.projection.managementClassification, "Unclassified");
  assert.deepEqual(multiSiteLmsOnly.projection.verticals, [], "an unmanaged course has zero vertical memberships");
  assert.ok(multiSiteLmsOnly.course.lms.normalized.mappedVerticals.length >= 3, "site availability remains on the LMS snapshot");
  assert.equal(projectionFor(multiSiteLmsOnly.course, {
    management_classification: "Lexipol managed",
    field_provenance: { managementClassification: "coursetrack" },
  }).managementClassification, "Lexipol managed", "an explicit CourseTrack assignment is authoritative");
  assert.equal(projectionFor(multiSiteLmsOnly.course, {
    management_classification: "Lexipol managed",
    field_provenance: {},
  }).managementClassification, "Unclassified", "an unprovenanced managed flag is not authoritative");
  const metadataWithoutLms = projections.find(({ course }) => course.metadata && !course.lms);
  assert.equal(metadataWithoutLms?.projection.managementClassification, "Lexipol managed");
  assert.equal(dataset.courses.filter((course) => course.lms?.normalized.courseType === "Standard Course").length, 16_544);
  const accreditations = dataset.courses.flatMap((course) => course.accreditations);
  assert.equal(accreditations.filter((record) => record.jurisdiction === null).length, 2_043, "blank LMS jurisdictions remain null rather than being relabeled National");
  for (const id of ["102160981", "102161025"]) {
    assert.equal(dataset.courses.find((course) => course.courseId === id)?.comparisons.find((item) => item.fieldKey === "durationMinutes")?.comparisonStatus, "Conflict");
  }
});

test("apply importer performs field-level merges and uses immutable source fingerprints", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile("scripts/import-course-workbooks.mjs", "utf8"));
  assert.match(source, /field_provenance/);
  assert.match(source, /relationship_type: "applicable"/);
  assert.match(source, /verticalMemberships/);
  assert.doesNotMatch(source, /relationship_type: "secondary"/);
  assert.match(source, /keepOverride/);
  assert.doesNotMatch(source, /if \(existing\?\.has_manual_overrides\) continue/);
  assert.match(source, /onConflict: "lms_course_id"/);
  assert.match(source, /source_fingerprint/);
  assert.match(source, /is_current: false/);
  assert.match(source, /\.eq\("source_transport", "uploaded"\)[\s\S]*\.eq\("is_current", true\)/);
  assert.match(source, /raw_payload/);
  assert.match(source, /is_current: true/);
  assert.match(source, /source_transport: "uploaded"/);
  assert.match(source, /if \(value === undefined\) return null/);
  assert.match(source, /\.select\(columns\)[\s\S]*\.order\("id"\)[\s\S]*\.range\(from, from \+ pageSize - 1\)/);
  assert.match(source, /existingRetrievalRun[\s\S]*\.update\(retrievalRunPayload\)[\s\S]*\.insert\(retrievalRunPayload\)/);
  assert.doesNotMatch(source, /onConflict: "external_run_id"/);
  assert.match(source, /existingAccreditations = await allRows\(client, "accreditation_records", "\*"\)/);
  assert.match(source, /accreditationBackfills\.push\(\{\s*\.\.\.matches\[0\]/);
  assert.match(source, /hash\(\[course\.courseId, item\.index,/);
  assert.match(source, /consumedAccreditationIds/);
  assert.doesNotMatch(source, /process\.env\.STAGING_DATABASE_URL/);
  assert.match(source, /assertTargetConfiguration/);
  assert.match(source, /target === "staging"/);
  assert.match(source, /approvedProductionRollout/);
  assert.match(source, /verifySourceManifest/);
  assert.match(source, /assertTargetConfiguration/);
  assert.match(source, /raw_payload: redactRawPayloads \? \{\}/);
  assert.match(source, /\.rpc\("refresh_all_course_comparisons"\)/);
  assert.doesNotMatch(source, /`LMS Course \$\{course\.courseId\}`|Imported CourseTrack projection\.|durationMinutes:.*\?\? 0/);
  assert.doesNotMatch(source, /jurisdiction:\s*item\.state\s*\|\|\s*"National"/);
});
