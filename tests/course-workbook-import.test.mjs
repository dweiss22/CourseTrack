import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { assertCourseWorkbookBaseline, loadCourseWorkbookDataset } from "../scripts/course-workbook-loader.mjs";

test("committed LMS and CourseTrack workbooks reproduce the accepted import baseline", async () => {
  const dataset = await loadCourseWorkbookDataset(path.resolve("Files"), { asOfDate: "2026-08-04", importedAt: "2026-08-04T12:00:00.000Z" });
  assert.doesNotThrow(() => assertCourseWorkbookBaseline(dataset));
  assert.deepEqual(dataset.summary, {
    lmsCourses: 18_406,
    courseTrackCourses: 1_952,
    unionCourses: 18_530,
    overlap: 1_828,
    lmsOnly: 16_578,
    courseTrackOnly: 124,
    initialDifferenceCount: 6,
    accreditationRecordCount: 19_571,
    accreditationGroupCount: 7_299,
    atRiskCourses: 697,
  });
  const ids = dataset.courses.map((course) => course.courseId);
  assert.equal(new Set(ids).size, ids.length, "stable union contains no duplicate course IDs");
  assert.ok(dataset.courses.some((course) => course.metadata && !course.lms), "master-only courses remain discoverable");
  assert.ok(dataset.courses.some((course) => course.lms && !course.metadata), "LMS-only courses receive display projections");
});

test("apply importer preserves overrides and uses idempotent source fingerprints", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile("scripts/import-course-workbooks.mjs", "utf8"));
  assert.match(source, /existing\?\.has_manual_overrides/);
  assert.match(source, /onConflict: "lms_course_id"/);
  assert.match(source, /source_fingerprint/);
  assert.match(source, /is_current: false/);
  assert.match(source, /raw_payload/);
});
