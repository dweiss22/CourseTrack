import path from "node:path";
import { readdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import "./register-aliases.mjs";

const {
  assessAccreditationHistory,
} = await import("../lib/accreditation-grouping.ts");
const {
  parseContentMetadataRow,
  parseLmsRow,
  reconcileCourseSources,
} = await import("../lib/source-normalization.ts");

const STANDARD_SHEET = "All (comma separated)";
const MASTER_FILE = "LMS new list - master.xlsx";
const MASTER_SHEET = "Master";
const STANDARD_FIELDS = new Set([
  "courseId", "courseName", "contentType", "durationMinutes", "trainingCredits",
  "published", "description", "publishedDate",
]);
const COMPACT_FIELDS = new Set(["courseId", "courseName", "contentType", "durationMinutes", "trainingCredits", "published"]);

function cellValue(value) {
  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    if ("hyperlink" in value) return value.hyperlink || value.text || null;
    if ("result" in value) return value.result;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text;
  }
  return value ?? null;
}

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\.0+$/, "");
  return text || null;
}

async function rowsFromSheet(filePath, sheetName, maxColumns) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`${path.basename(filePath)} is missing sheet "${sheetName}".`);
  const headers = [];
  for (let column = 1; column <= maxColumns; column += 1) {
    const header = String(cellValue(sheet.getRow(1).getCell(column).value) ?? "").trim();
    if (header) headers.push({ header, column });
  }
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = Object.fromEntries(headers.map(({ header, column }) => [header, cellValue(row.getCell(column).value)]));
    if (Object.values(record).some((value) => value !== null && String(value).trim() !== "")) rows.push(record);
  });
  return { rows, headers: headers.map(({ header }) => header) };
}

function metadataProjectionFromLms(lms, importedAt) {
  const normalized = lms.normalized;
  return {
    id: `LMS-PROJECTION-${normalized.courseId}`,
    importRunId: "lms-export-projection",
    importedAt,
    rawCourseId: normalized.courseId,
    lmsCourseId: normalized.courseId,
    courseName: normalized.courseName,
    contentType: normalized.courseType,
    durationMinutes: normalized.durationMinutes,
    trainingCredits: normalized.trainingCredits,
    published: normalized.isPublished,
    authoringTool: null,
    description: normalized.courseDescription,
    backendLink: null,
    frontendLink: null,
    publishedDate: normalized.publishedDate,
    updateType: null,
    updatedRawValue: null,
    verticals: normalized.mappedVerticals,
    parentCourseIds: [],
    childCourseIds: [],
    notes: null,
    rawPayload: lms.rawPayload,
    mappingWarnings: lms.warnings,
    validationErrors: lms.errors,
  };
}

function creditHours(trainingCredits) {
  if (trainingCredits?.amount === null || trainingCredits?.amount === undefined) return 0;
  return trainingCredits.unit === "minutes" ? trainingCredits.amount / 60 : trainingCredits.amount;
}

function accreditationRecord(courseId, item, trainingCredits, importedAt) {
  return {
    id: `${courseId}:${item.index}`,
    organization: item.issuingBody,
    jurisdiction: item.state,
    status: "Approved",
    approvalNumber: item.accreditationNumber,
    topicNumber: item.topicNumber,
    creditHours: creditHours(trainingCredits),
    effectiveDate: item.startDate,
    expirationDate: item.endDate,
    source: "uploaded",
    riskReasons: [],
    createdAt: importedAt,
    updatedAt: importedAt,
    archivedAt: null,
  };
}

export async function loadCourseWorkbookDataset(sourceDirectory, options = {}) {
  const importedAt = options.importedAt ?? new Date().toISOString();
  const asOfDate = options.asOfDate ?? importedAt.slice(0, 10);
  const fileNames = (await readdir(sourceDirectory))
    .filter((name) => name.toLowerCase().startsWith("all_") && name.toLowerCase().endsWith(".xlsx"))
    .sort();
  if (fileNames.length !== 4) throw new Error(`Expected four all_*.xlsx files; found ${fileNames.length}.`);

  const lmsById = new Map();
  const lmsSourceById = new Map();
  const duplicateLmsIds = new Set();
  for (const fileName of fileNames) {
    const standard = fileName.toLowerCase().includes("standard");
    const { rows } = await rowsFromSheet(path.join(sourceDirectory, fileName), standard ? STANDARD_SHEET : "Sheet1", standard ? 31 : 11);
    for (const row of rows) {
      const parsed = parseLmsRow(row);
      const courseId = parsed.normalized.courseId;
      if (!courseId) continue;
      if (lmsById.has(courseId)) duplicateLmsIds.add(courseId);
      lmsById.set(courseId, parsed);
      lmsSourceById.set(courseId, {
        fileName,
        schema: standard ? "standard" : "compact",
        comparableFields: standard ? STANDARD_FIELDS : COMPACT_FIELDS,
      });
    }
  }

  const master = await rowsFromSheet(path.join(sourceDirectory, MASTER_FILE), MASTER_SHEET, 17);
  const metadataById = new Map();
  const duplicateMasterIds = new Set();
  for (const row of master.rows) {
    const parsed = parseContentMetadataRow(row, { importedAt });
    const courseId = parsed.lmsCourseId;
    if (!courseId) continue;
    if (metadataById.has(courseId)) duplicateMasterIds.add(courseId);
    metadataById.set(courseId, parsed);
  }

  const allIds = new Set([...lmsById.keys(), ...metadataById.keys()]);
  const courses = [];
  let initialDifferenceCount = 0;
  let accreditationRecordCount = 0;
  let accreditationTopicNumberCount = 0;
  let standardCourseCount = 0;
  let accreditationGroupCount = 0;
  const atRiskCourseIds = new Set();

  for (const courseId of allIds) {
    const lms = lmsById.get(courseId) ?? null;
    const metadata = metadataById.get(courseId) ?? null;
    const projection = metadata ?? (lms ? metadataProjectionFromLms(lms, importedAt) : null);
    const comparableFields = lmsSourceById.get(courseId)?.comparableFields ?? new Set();
    const comparisons = lms && projection
      ? reconcileCourseSources(lms, projection, [], importedAt).filter((item) => comparableFields.has(item.fieldKey))
      : [];
    initialDifferenceCount += comparisons.filter((item) => item.comparisonStatus === "Conflict").length;

    const accreditations = (lms?.normalized.accreditations ?? []).map((item) => accreditationRecord(courseId, item, lms?.normalized.trainingCredits, importedAt));
    accreditationRecordCount += accreditations.length;
    accreditationTopicNumberCount += (lms?.normalized.accreditations ?? []).filter((item) => item.topicNumber).length;
    if (lms?.normalized.courseType === "Standard Course") standardCourseCount += 1;
    const groups = assessAccreditationHistory(accreditations, { courseKey: courseId, asOfDate, expirationWindowDays: 90 });
    accreditationGroupCount += groups.length;
    if (groups.some((group) => group.riskState === "expired" || group.riskState === "expiring_soon")) atRiskCourseIds.add(courseId);

    courses.push({
      courseId,
      lms,
      metadata,
      projection,
      source: lmsSourceById.get(courseId) ?? null,
      comparisons,
      accreditations,
      accreditationGroups: groups,
    });
  }

  const overlap = [...metadataById.keys()].filter((id) => lmsById.has(id)).length;
  return {
    importedAt,
    asOfDate,
    sourceDirectory,
    files: [...fileNames, MASTER_FILE],
    courses,
    lmsById,
    metadataById,
    duplicateLmsIds: [...duplicateLmsIds],
    duplicateMasterIds: [...duplicateMasterIds],
    summary: {
      lmsCourses: lmsById.size,
      courseTrackCourses: metadataById.size,
      unionCourses: allIds.size,
      overlap,
      lmsOnly: lmsById.size - overlap,
      courseTrackOnly: metadataById.size - overlap,
      initialDifferenceCount,
      accreditationRecordCount,
      accreditationTopicNumberCount,
      accreditationGroupCount,
      standardCourseCount,
      atRiskCourses: atRiskCourseIds.size,
    },
  };
}

export function assertCourseWorkbookBaseline(dataset) {
  const expected = {
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
  };
  if (dataset.asOfDate === "2026-08-04") expected.atRiskCourses = 697;
  const mismatches = Object.entries(expected)
    .filter(([key, value]) => dataset.summary[key] !== value)
    .map(([key, value]) => `${key}: expected ${value}, received ${dataset.summary[key]}`);
  if (dataset.duplicateLmsIds.length) mismatches.push(`Duplicate LMS IDs: ${dataset.duplicateLmsIds.join(", ")}`);
  if (dataset.duplicateMasterIds.length) mismatches.push(`Duplicate master IDs: ${dataset.duplicateMasterIds.join(", ")}`);
  if (mismatches.length) throw new Error(`Workbook baseline validation failed:\n${mismatches.join("\n")}`);
  return expected;
}

export { normalizeId };
