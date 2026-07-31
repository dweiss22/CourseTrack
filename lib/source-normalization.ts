export const LMS_SOURCE_HEADERS = [
  "Course ID",
  "Course Type",
  "Course Name",
  "Duration",
  "Course Description",
  "Public Topics",
  "Private Topics",
  "Sites",
  "Published Date",
  "Author",
  "Owner",
  "Visibile in Organizations",
  "Hidden in Organizations",
  "Author Status",
  "Is published",
  "Has topics",
  "Is Lexipol",
  "Generate Certificate",
  "Available in States",
  "Hidden in States",
  "Surveys",
  "Created Date",
  "Last Revision Date",
  "Course Accreditation State",
  "Training Credits",
  "Issuing Body",
  "State",
  "Accreditation Number",
  "Topic Number",
  "Accreditation Start Date",
  "Accreditation End Date",
] as const;

export const CONTENT_METADATA_HEADERS = [
  "Course Id",
  "Course Name",
  "Content Type",
  "Duration (min)",
  "Training Credits",
  "Published",
  "Authoring Tool",
  "Description",
  "Backend Link",
  "Frontend Link",
  "Published Date",
  "Update Type",
  "Updated",
  "Verticals",
  "Parent",
  "Child",
  "Notes",
] as const;

export const DEFAULT_VERTICAL_CODES = [
  "P1A",
  "FR1A",
  "C1A",
  "EMS1",
  "D1A",
  "LGU",
  "Lexipol",
  "Wellness",
] as const;

export const DEFAULT_LMS_SITE_ALIASES: Record<string, string> = {
  ems1_academy: "EMS1",
  firerescue1_academy: "FR1A",
};

export const DEFAULT_REQUIRED_METADATA_FIELDS = [
  "lmsCourseId",
  "courseName",
  "contentType",
  "durationMinutes",
  "published",
  "description",
  "verticals",
  "frontendLink",
] as const;

const LMS_ALIASES = {
  courseId: ["Course ID", "Course Id", "LMS Course ID", "LMS ID"],
  courseType: ["Course Type"],
  courseName: ["Course Name"],
  duration: ["Duration"],
  courseDescription: ["Course Description"],
  publicTopics: ["Public Topics"],
  privateTopics: ["Private Topics"],
  sites: ["Sites"],
  publishedDate: ["Published Date"],
  author: ["Author"],
  owner: ["Owner"],
  visibleOrganizations: [
    "Visible in Organizations",
    "Visibile in Organizations",
  ],
  hiddenOrganizations: ["Hidden in Organizations"],
  authorStatus: ["Author Status"],
  isPublished: ["Is published", "Is Published"],
  hasTopics: ["Has topics", "Has Topics"],
  isLexipol: ["Is Lexipol"],
  generateCertificate: ["Generate Certificate"],
  availableStates: ["Available in States"],
  hiddenStates: ["Hidden in States"],
  surveys: ["Surveys"],
  createdDate: ["Created Date"],
  lastRevisionDate: ["Last Revision Date"],
  accreditationState: ["Course Accreditation State"],
  trainingCredits: ["Training Credits"],
  issuingBody: ["Issuing Body"],
  state: ["State"],
  accreditationNumber: ["Accreditation Number"],
  topicNumber: ["Topic Number"],
  accreditationStartDate: ["Accreditation Start Date"],
  accreditationEndDate: ["Accreditation End Date"],
} as const;

const CONTENT_ALIASES = {
  courseId: ["Course Id", "Course ID", "LMS Course ID", "LMS ID"],
  courseName: ["Course Name"],
  contentType: ["Content Type"],
  durationMinutes: ["Duration (min)", "Duration Minutes", "Duration"],
  trainingCredits: ["Training Credits"],
  published: ["Published", "Is Published"],
  authoringTool: ["Authoring Tool"],
  description: ["Description", "Course Description"],
  backendLink: ["Backend Link"],
  frontendLink: ["Frontend Link"],
  publishedDate: ["Published Date"],
  updateType: ["Update Type"],
  updated: ["Updated"],
  verticals: ["Verticals", "Vertical"],
  parent: ["Parent", "Parent Course ID"],
  child: ["Child", "Child Course ID", "Children"],
  notes: ["Notes"],
} as const;

type SourceRow = Record<string, unknown>;

type ResolutionSource = "lms" | "content_metadata" | null;

export interface ParsedFieldComparison {
  fieldKey: string;
  fieldLabel: string;
  lmsRawValue: unknown;
  lmsNormalizedValue: unknown;
  contentMetadataRawValue: unknown;
  contentMetadataNormalizedValue: unknown;
  resolvedValue: unknown;
  selectedSource: ResolutionSource;
  comparisonStatus:
    | "Match"
    | "Conflict"
    | "LMS only"
    | "Content Metadata only"
    | "Missing from both"
    | "Invalid"
    | "Unresolved";
  resolutionReason: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  lastComparedAt: string;
}

function cleanHeader(value: string): string {
  return value.replaceAll("\u00a0", " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function findEntry(row: SourceRow, aliases: readonly string[]) {
  const aliasSet = new Set(aliases.map(cleanHeader));
  const matches = Object.entries(row).filter(([key]) => aliasSet.has(cleanHeader(key)));
  return matches.find(([, value]) => !isBlank(value)) ?? matches[0];
}

function sourceValue(row: SourceRow, aliases: readonly string[]): unknown {
  return findEntry(row, aliases)?.[1];
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function normalizeWhitespace(value: unknown): string | null {
  if (isBlank(value)) return null;
  return String(value).replaceAll("\u00a0", " ").replace(/\s+/g, " ").trim();
}

export function normalizeNullable(value: unknown): unknown {
  if (isBlank(value)) return null;
  if (typeof value === "string" && value.trim().toUpperCase() === "N/A") {
    return null;
  }
  return value;
}

export function normalizeCourseId(rawValue: unknown): {
  value: string | null;
  error: string | null;
} {
  if (isBlank(rawValue)) {
    return { value: null, error: "Course ID is required." };
  }
  if (typeof rawValue === "number") {
    if (!Number.isSafeInteger(rawValue)) {
      return {
        value: null,
        error: "Numeric Course ID is not a safe integer and cannot be normalized without precision loss.",
      };
    }
    return { value: String(rawValue), error: null };
  }
  const text = String(rawValue).trim();
  if (/^\d+\.0+$/.test(text)) {
    return { value: text.replace(/\.0+$/, ""), error: null };
  }
  return { value: text || null, error: text ? null : "Course ID is required." };
}

export function normalizeBoolean(rawValue: unknown): {
  value: boolean | null;
  error: string | null;
} {
  const normalized = normalizeNullable(rawValue);
  if (normalized === null) return { value: null, error: null };
  if (typeof normalized === "boolean") return { value: normalized, error: null };
  if (typeof normalized === "number" && (normalized === 1 || normalized === 0)) {
    return { value: normalized === 1, error: null };
  }
  const text = String(normalized).trim().toLowerCase();
  if (["1", "yes", "true", "y"].includes(text)) return { value: true, error: null };
  if (["0", "no", "false", "n"].includes(text)) return { value: false, error: null };
  return { value: null, error: `Could not normalize boolean value "${String(rawValue)}".` };
}

export function normalizeLmsDuration(rawValue: unknown): {
  value: number | null;
  error: string | null;
} {
  const normalized = normalizeNullable(rawValue);
  if (normalized === null) return { value: null, error: null };
  const numeric = typeof normalized === "number" ? normalized : Number(String(normalized).trim());
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { value: null, error: `Could not confidently interpret LMS duration "${String(rawValue)}".` };
  }
  return { value: Math.round(numeric * 60), error: null };
}

export function normalizeMinuteDuration(rawValue: unknown): {
  value: number | null;
  error: string | null;
} {
  const normalized = normalizeNullable(rawValue);
  if (normalized === null) return { value: null, error: null };
  const numeric = typeof normalized === "number" ? normalized : Number(String(normalized).trim());
  if (!Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(numeric)) {
    return { value: null, error: `Duration (min) must be a non-negative integer; received "${String(rawValue)}".` };
  }
  return { value: numeric, error: null };
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

export function normalizeDate(rawValue: unknown): {
  value: string | null;
  error: string | null;
} {
  const normalized = normalizeNullable(rawValue);
  if (normalized === null) return { value: null, error: null };
  if (typeof normalized === "number") {
    if (!Number.isFinite(normalized)) {
      return { value: null, error: `Invalid Excel date serial "${String(rawValue)}".` };
    }
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Math.round(normalized * 86_400_000));
    return { value: date.toISOString().slice(0, 10), error: null };
  }

  const text = String(normalized).trim();
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoDate) {
    const value = toIsoDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
    return value
      ? { value, error: null }
      : { value: null, error: `Invalid date "${text}".` };
  }

  const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i.exec(text);
  if (usDate) {
    const month = Number(usDate[1]);
    const day = Number(usDate[2]);
    const year = Number(usDate[3]);
    const dateOnly = toIsoDate(year, month, day);
    if (!dateOnly) return { value: null, error: `Invalid date "${text}".` };
    if (!usDate[4]) return { value: dateOnly, error: null };
    let hour = Number(usDate[4]) % 12;
    if (usDate[6].toUpperCase() === "PM") hour += 12;
    const minute = Number(usDate[5]);
    const value = new Date(Date.UTC(year, month - 1, day, hour, minute));
    return { value: value.toISOString(), error: null };
  }

  const timestamp = Date.parse(text);
  if (!Number.isNaN(timestamp)) {
    return { value: new Date(timestamp).toISOString(), error: null };
  }
  return { value: null, error: `Could not normalize date "${text}".` };
}

export function splitSemicolonValues(rawValue: unknown): string[] {
  const normalized = normalizeNullable(rawValue);
  if (normalized === null) return [];
  return String(normalized)
    .split(";")
    .map((value) => normalizeWhitespace(value))
    .filter((value): value is string => Boolean(value));
}

function splitCommaValues(rawValue: unknown): string[] {
  const normalized = normalizeNullable(rawValue);
  if (normalized === null) return [];
  return String(normalized)
    .split(",")
    .map((value) => value.trim());
}

export function parseAuthor(rawValue: unknown): {
  raw: string | null;
  displayName: string | null;
  email: string | null;
} {
  const raw = normalizeWhitespace(rawValue);
  if (!raw) return { raw: null, displayName: null, email: null };
  const match = /^(.*?)\s*\(([^()\s]+@[^()\s]+)\)\s*$/.exec(raw);
  return match
    ? { raw, displayName: match[1].trim() || null, email: match[2].trim() }
    : { raw, displayName: raw, email: null };
}

export function parseTrainingCredits(rawValue: unknown): {
  rawDisplay: string | null;
  amount: number | null;
  unit: string | null;
} {
  const rawDisplay = normalizeWhitespace(rawValue);
  if (!rawDisplay) return { rawDisplay: null, amount: null, unit: null };
  const hoursAndMinutes = /^(?:(\d+(?:\.\d+)?)\s*hours?)?(?:\s*(\d+(?:\.\d+)?)\s*minutes?)?$/i.exec(rawDisplay);
  if (hoursAndMinutes && (hoursAndMinutes[1] || hoursAndMinutes[2])) {
    const minutes = Number(hoursAndMinutes[1] ?? 0) * 60 + Number(hoursAndMinutes[2] ?? 0);
    return { rawDisplay, amount: minutes, unit: "minutes" };
  }
  const amountAndUnit = /^(-?\d+(?:\.\d+)?)\s*(.*)$/.exec(rawDisplay);
  if (!amountAndUnit) return { rawDisplay, amount: null, unit: null };
  return {
    rawDisplay,
    amount: Number(amountAndUnit[1]),
    unit: normalizeWhitespace(amountAndUnit[2])?.toLowerCase() ?? null,
  };
}

export function validateUrl(rawValue: unknown): {
  value: string | null;
  error: string | null;
} {
  const value = normalizeWhitespace(rawValue);
  if (!value) return { value: null, error: null };
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Unsupported protocol");
    return { value: url.toString(), error: null };
  } catch {
    return { value, error: `Invalid URL "${value}".` };
  }
}

export function splitVerticalValues(rawValue: unknown): string[] {
  const normalized = normalizeNullable(rawValue);
  if (normalized === null) return [];
  return String(normalized)
    .split(/[,;\r\n]+/)
    .map((value) => normalizeWhitespace(value))
    .filter((value): value is string => Boolean(value));
}

export function mapLmsSites(
  sites: string[],
  aliases: Record<string, string> = DEFAULT_LMS_SITE_ALIASES,
): { verticals: string[]; warnings: string[] } {
  const verticals: string[] = [];
  const warnings: string[] = [];
  for (const site of sites) {
    const mapped = aliases[site.trim().toLowerCase()];
    if (mapped) {
      if (!verticals.includes(mapped)) verticals.push(mapped);
    } else {
      warnings.push(`Unknown LMS Site "${site}" requires vertical mapping.`);
    }
  }
  return { verticals, warnings };
}

function parseParallelAccreditations(row: SourceRow) {
  const fields = [
    ["issuingBody", LMS_ALIASES.issuingBody],
    ["state", LMS_ALIASES.state],
    ["accreditationNumber", LMS_ALIASES.accreditationNumber],
    ["topicNumber", LMS_ALIASES.topicNumber],
    ["startDate", LMS_ALIASES.accreditationStartDate],
    ["endDate", LMS_ALIASES.accreditationEndDate],
  ] as const;
  const lists = Object.fromEntries(
    fields.map(([key, aliases]) => [key, splitCommaValues(sourceValue(row, aliases))]),
  ) as Record<(typeof fields)[number][0], string[]>;
  const lengths = fields.map(([key]) => lists[key].length);
  const nonZeroLengths = lengths.filter((length) => length > 0);
  const maximum = Math.max(0, ...lengths);
  const mismatch = nonZeroLengths.length > 0 && new Set(nonZeroLengths).size > 1;
  const warnings = mismatch
    ? [`Accreditation parallel-list lengths do not agree (${lengths.join(", ")}). Extra values were retained.`]
    : [];
  const records = Array.from({ length: maximum }, (_, index) => {
    const rawValues = Object.fromEntries(
      fields.map(([key]) => [key, lists[key][index] ?? null]),
    );
    const start = normalizeDate(lists.startDate[index]);
    const end = normalizeDate(lists.endDate[index]);
    const recordWarnings = [start.error, end.error].filter((value): value is string => Boolean(value));
    return {
      index,
      issuingBody: normalizeWhitespace(lists.issuingBody[index]),
      state: normalizeWhitespace(normalizeNullable(lists.state[index])),
      accreditationNumber: normalizeWhitespace(normalizeNullable(lists.accreditationNumber[index])),
      topicNumber: normalizeWhitespace(normalizeNullable(lists.topicNumber[index])),
      startDate: start.value,
      endDate: end.value,
      rawValues,
      mappingWarnings: recordWarnings,
    };
  });
  return { records, warnings: [...warnings, ...records.flatMap((record) => record.mappingWarnings)] };
}

export function parseLmsRow(
  row: SourceRow,
  options: { siteAliases?: Record<string, string> } = {},
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const courseId = normalizeCourseId(sourceValue(row, LMS_ALIASES.courseId));
  if (courseId.error) errors.push(courseId.error);
  const duration = normalizeLmsDuration(sourceValue(row, LMS_ALIASES.duration));
  if (duration.error) warnings.push(duration.error);
  const publishedDate = normalizeDate(sourceValue(row, LMS_ALIASES.publishedDate));
  const createdDate = normalizeDate(sourceValue(row, LMS_ALIASES.createdDate));
  const lastRevisionDate = normalizeDate(sourceValue(row, LMS_ALIASES.lastRevisionDate));
  for (const result of [publishedDate, createdDate, lastRevisionDate]) {
    if (result.error) warnings.push(result.error);
  }
  const isPublished = normalizeBoolean(sourceValue(row, LMS_ALIASES.isPublished));
  const hasTopics = normalizeBoolean(sourceValue(row, LMS_ALIASES.hasTopics));
  const isLexipol = normalizeBoolean(sourceValue(row, LMS_ALIASES.isLexipol));
  for (const result of [isPublished, hasTopics, isLexipol]) {
    if (result.error) warnings.push(result.error);
  }
  const sites = splitSemicolonValues(sourceValue(row, LMS_ALIASES.sites));
  const siteMapping = mapLmsSites(sites, options.siteAliases ?? DEFAULT_LMS_SITE_ALIASES);
  warnings.push(...siteMapping.warnings);
  const accreditations = parseParallelAccreditations(row);
  warnings.push(...accreditations.warnings);

  return {
    rawCourseId: sourceValue(row, LMS_ALIASES.courseId),
    rawPayload: { ...row },
    normalized: {
      courseId: courseId.value,
      courseType: normalizeWhitespace(sourceValue(row, LMS_ALIASES.courseType)),
      courseName: normalizeWhitespace(sourceValue(row, LMS_ALIASES.courseName)),
      durationMinutes: duration.value,
      courseDescription: normalizeWhitespace(sourceValue(row, LMS_ALIASES.courseDescription)),
      publicTopics: splitSemicolonValues(sourceValue(row, LMS_ALIASES.publicTopics)),
      privateTopics: splitSemicolonValues(sourceValue(row, LMS_ALIASES.privateTopics)),
      sites,
      mappedVerticals: siteMapping.verticals,
      publishedDate: publishedDate.value,
      author: parseAuthor(sourceValue(row, LMS_ALIASES.author)),
      owner: normalizeWhitespace(sourceValue(row, LMS_ALIASES.owner)),
      visibleInOrganizations: splitSemicolonValues(sourceValue(row, LMS_ALIASES.visibleOrganizations)),
      hiddenInOrganizations: splitSemicolonValues(sourceValue(row, LMS_ALIASES.hiddenOrganizations)),
      authorStatus: normalizeWhitespace(sourceValue(row, LMS_ALIASES.authorStatus)),
      isPublished: isPublished.value,
      hasTopics: hasTopics.value,
      isLexipol: isLexipol.value,
      generateCertificate: normalizeWhitespace(sourceValue(row, LMS_ALIASES.generateCertificate)),
      availableInStates: splitSemicolonValues(sourceValue(row, LMS_ALIASES.availableStates)),
      hiddenInStates: splitSemicolonValues(sourceValue(row, LMS_ALIASES.hiddenStates)),
      surveys: splitSemicolonValues(sourceValue(row, LMS_ALIASES.surveys)),
      createdDate: createdDate.value,
      lastRevisionDate: lastRevisionDate.value,
      courseAccreditationState: splitSemicolonValues(sourceValue(row, LMS_ALIASES.accreditationState)),
      trainingCredits: parseTrainingCredits(sourceValue(row, LMS_ALIASES.trainingCredits)),
      accreditations: accreditations.records,
    },
    errors,
    warnings: [...new Set(warnings)],
  };
}

function parseRelationshipIds(rawValue: unknown): string[] {
  return splitVerticalValues(rawValue)
    .map((value) => normalizeCourseId(value).value)
    .filter((value): value is string => Boolean(value));
}

export function parseContentMetadataRow(
  row: SourceRow,
  options: { verticalCodes?: readonly string[]; importRunId?: string; importedAt?: string } = {},
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const courseId = normalizeCourseId(sourceValue(row, CONTENT_ALIASES.courseId));
  if (courseId.error) errors.push(courseId.error);
  const duration = normalizeMinuteDuration(sourceValue(row, CONTENT_ALIASES.durationMinutes));
  if (duration.error) errors.push(duration.error);
  const published = normalizeBoolean(sourceValue(row, CONTENT_ALIASES.published));
  if (published.error) errors.push(published.error);
  const publishedDate = normalizeDate(sourceValue(row, CONTENT_ALIASES.publishedDate));
  if (publishedDate.error) errors.push(publishedDate.error);
  const backendLink = validateUrl(sourceValue(row, CONTENT_ALIASES.backendLink));
  const frontendLink = validateUrl(sourceValue(row, CONTENT_ALIASES.frontendLink));
  for (const result of [backendLink, frontendLink]) {
    if (result.error) errors.push(result.error);
  }
  const verticalCodes = options.verticalCodes ?? DEFAULT_VERTICAL_CODES;
  const sourceVerticals = splitVerticalValues(sourceValue(row, CONTENT_ALIASES.verticals));
  const validVerticals = sourceVerticals.filter((vertical) => verticalCodes.includes(vertical));
  for (const vertical of sourceVerticals.filter((value) => !verticalCodes.includes(value))) {
    warnings.push(`Unknown Content Metadata vertical "${vertical}" requires mapping.`);
  }

  return {
    id: `CM-${courseId.value ?? "INVALID"}`,
    importRunId: options.importRunId ?? "CM-PREVIEW",
    importedAt: options.importedAt ?? "2026-07-30T12:00:00.000Z",
    rawCourseId: sourceValue(row, CONTENT_ALIASES.courseId),
    lmsCourseId: courseId.value,
    courseName: normalizeWhitespace(sourceValue(row, CONTENT_ALIASES.courseName)),
    contentType: normalizeWhitespace(sourceValue(row, CONTENT_ALIASES.contentType)),
    durationMinutes: duration.value,
    trainingCredits: parseTrainingCredits(sourceValue(row, CONTENT_ALIASES.trainingCredits)),
    published: published.value,
    authoringTool: normalizeWhitespace(sourceValue(row, CONTENT_ALIASES.authoringTool)),
    description: normalizeWhitespace(sourceValue(row, CONTENT_ALIASES.description)),
    backendLink: backendLink.value,
    frontendLink: frontendLink.value,
    publishedDate: publishedDate.value,
    updateType: normalizeWhitespace(sourceValue(row, CONTENT_ALIASES.updateType)),
    updatedRawValue: sourceValue(row, CONTENT_ALIASES.updated),
    verticals: validVerticals,
    parentCourseIds: parseRelationshipIds(sourceValue(row, CONTENT_ALIASES.parent)),
    childCourseIds: parseRelationshipIds(sourceValue(row, CONTENT_ALIASES.child)),
    notes: isBlank(sourceValue(row, CONTENT_ALIASES.notes))
      ? null
      : String(sourceValue(row, CONTENT_ALIASES.notes)).trim(),
    rawPayload: { ...row },
    mappingWarnings: [...new Set(warnings)],
    validationErrors: [...new Set(errors)],
  };
}

export function validateCourseRelationships(
  records: ReturnType<typeof parseContentMetadataRow>[],
  knownCourseIds: Iterable<string> = [],
) {
  const available = new Set([...knownCourseIds, ...records.map((record) => record.lmsCourseId).filter((value): value is string => Boolean(value))]);
  const errors: Array<{ courseId: string | null; targetId: string; type: string; message: string }> = [];
  const adjacency = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string) => {
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from)?.add(to);
  };
  for (const record of records) {
    if (!record.lmsCourseId) continue;
    for (const childId of record.childCourseIds) addEdge(record.lmsCourseId, childId);
    for (const parentId of record.parentCourseIds) addEdge(parentId, record.lmsCourseId);
    for (const [type, targets] of [["parent", record.parentCourseIds], ["child", record.childCourseIds]] as const) {
      for (const targetId of targets) {
        if (targetId === record.lmsCourseId) {
          errors.push({ courseId: record.lmsCourseId, targetId, type, message: `Course ${record.lmsCourseId} cannot reference itself as ${type}.` });
        } else if (!available.has(targetId)) {
          errors.push({ courseId: record.lmsCourseId, targetId, type, message: `${type === "parent" ? "Parent" : "Child"} Course ID ${targetId} was not found.` });
        }
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleNodes = new Set<string>();
  const visit = (node: string) => {
    if (visiting.has(node)) {
      cycleNodes.add(node);
      return true;
    }
    if (visited.has(node)) return false;
    visiting.add(node);
    let foundCycle = false;
    for (const target of adjacency.get(node) ?? []) {
      if (visit(target)) {
        cycleNodes.add(node);
        cycleNodes.add(target);
        foundCycle = true;
      }
    }
    visiting.delete(node);
    visited.add(node);
    return foundCycle;
  };
  for (const node of adjacency.keys()) visit(node);
  for (const node of cycleNodes) {
    errors.push({ courseId: node, targetId: node, type: "circular", message: `Circular course relationship involves Course ID ${node}.` });
  }
  return errors;
}

export function parseContentMetadataRows(
  rows: SourceRow[],
  options: { verticalCodes?: readonly string[]; knownCourseIds?: Iterable<string>; importRunId?: string; importedAt?: string } = {},
) {
  const records = rows.map((row) => parseContentMetadataRow(row, options));
  const byId = new Map<string, number>();
  for (const record of records) {
    if (record.lmsCourseId) byId.set(record.lmsCourseId, (byId.get(record.lmsCourseId) ?? 0) + 1);
  }
  const duplicateIds = [...byId.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  for (const record of records.filter((item) => item.lmsCourseId && duplicateIds.includes(item.lmsCourseId))) {
    record.validationErrors.push(`Duplicate Course ID ${record.lmsCourseId} cannot be imported automatically.`);
  }
  const relationshipErrors = validateCourseRelationships(records, options.knownCourseIds);
  for (const error of relationshipErrors) {
    const record = records.find((candidate) => candidate.lmsCourseId === error.courseId);
    if (record) record.validationErrors.push(error.message);
  }
  return {
    records,
    duplicateIds,
    missingCourseIdCount: records.filter((record) => !record.lmsCourseId).length,
    relationshipErrors,
  };
}

function topicSlug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseTopicsMatrix(
  matrix: unknown[][],
  options: { knownCourseIds?: Iterable<string>; importRunId?: string; importedAt?: string } = {},
) {
  const headerRow = matrix[0] ?? [];
  const knownCourseIds = new Set(options.knownCourseIds ?? []);
  const topics: Array<{ id: string; name: string; originalLabel: string }> = [];
  const assignments: Array<{ id: string; topicId: string; topic: string; lmsCourseId: string; source: "Topics import"; importRunId: string; importedAt: string }> = [];
  const seen = new Set<string>();
  let duplicateAssignments = 0;
  let emptyTopics = 0;
  const unknownCourseIds = new Set<string>();
  for (let column = 0; column < headerRow.length; column += 1) {
    const originalLabel = String(headerRow[column] ?? "");
    const name = normalizeWhitespace(originalLabel);
    if (!name) continue;
    const topicId = `TOPIC-${topicSlug(name) || column + 1}`;
    topics.push({ id: topicId, name, originalLabel });
    let topicAssignments = 0;
    for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
      const rawCourseId = matrix[rowIndex]?.[column];
      if (isBlank(rawCourseId)) continue;
      const courseId = normalizeCourseId(rawCourseId);
      if (!courseId.value) continue;
      const pairKey = `${topicId}:${courseId.value}`;
      if (seen.has(pairKey)) {
        duplicateAssignments += 1;
        continue;
      }
      seen.add(pairKey);
      topicAssignments += 1;
      if (knownCourseIds.size > 0 && !knownCourseIds.has(courseId.value)) unknownCourseIds.add(courseId.value);
      assignments.push({
        id: `CTA-${assignments.length + 1}`,
        topicId,
        topic: name,
        lmsCourseId: courseId.value,
        source: "Topics import",
        importRunId: options.importRunId ?? "TOPICS-PREVIEW",
        importedAt: options.importedAt ?? "2026-07-30T12:00:00.000Z",
      });
    }
    if (topicAssignments === 0) emptyTopics += 1;
  }
  return {
    topics,
    assignments,
    preview: {
      topicCount: topics.length,
      assignmentCount: assignments.length,
      uniqueCourseIdCount: new Set(assignments.map((assignment) => assignment.lmsCourseId)).size,
      duplicateAssignments,
      unknownCourseIds: [...unknownCourseIds],
      emptyTopics,
      normalizedTopicNames: topics.filter((topic) => topic.name !== topic.originalLabel).map((topic) => ({ original: topic.originalLabel, normalized: topic.name })),
    },
  };
}

const COMPARISON_FIELDS = [
  { key: "courseName", label: "Course Name", lms: "courseName", metadata: "courseName" },
  { key: "durationMinutes", label: "Duration", lms: "durationMinutes", metadata: "durationMinutes" },
  { key: "trainingCredits", label: "Training Credits", lms: "trainingCredits", metadata: "trainingCredits" },
  { key: "published", label: "Published", lms: "isPublished", metadata: "published" },
  { key: "description", label: "Description", lms: "courseDescription", metadata: "description" },
  { key: "publishedDate", label: "Published Date", lms: "publishedDate", metadata: "publishedDate" },
] as const;

function comparable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value)?.toLowerCase() ?? "";
    if (/^\d{4}-\d{2}-\d{2}(?:t.*)?$/.test(normalized)) {
      return normalized.slice(0, 10);
    }
    return normalized;
  }
  if (
    typeof value === "object" &&
    "amount" in value &&
    "unit" in value
  ) {
    const credit = value as { amount?: unknown; unit?: unknown };
    return JSON.stringify({ amount: credit.amount ?? null, unit: credit.unit ?? null });
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function rawForComparison(source: SourceRow | null | undefined, aliases: readonly string[]): unknown {
  return source ? sourceValue(source, aliases) : null;
}

export function reconcileCourseSources(
  lmsRecord: ReturnType<typeof parseLmsRow> | null,
  metadataRecord: ReturnType<typeof parseContentMetadataRow> | null,
  previousComparisons: ParsedFieldComparison[] = [],
  comparedAt = "2026-07-30T12:00:00.000Z",
) {
  return COMPARISON_FIELDS.map((field): ParsedFieldComparison => {
    const lmsValue = lmsRecord?.normalized[field.lms] ?? null;
    const metadataValue = metadataRecord?.[field.metadata] ?? null;
    const lmsRaw = lmsRecord
      ? rawForComparison(lmsRecord.rawPayload, field.key === "published" ? LMS_ALIASES.isPublished : field.key === "description" ? LMS_ALIASES.courseDescription : field.key === "durationMinutes" ? LMS_ALIASES.duration : field.key === "courseName" ? LMS_ALIASES.courseName : field.key === "publishedDate" ? LMS_ALIASES.publishedDate : LMS_ALIASES.trainingCredits)
      : null;
    const metadataRaw = metadataRecord
      ? rawForComparison(metadataRecord.rawPayload, field.key === "published" ? CONTENT_ALIASES.published : field.key === "description" ? CONTENT_ALIASES.description : field.key === "durationMinutes" ? CONTENT_ALIASES.durationMinutes : field.key === "courseName" ? CONTENT_ALIASES.courseName : field.key === "publishedDate" ? CONTENT_ALIASES.publishedDate : CONTENT_ALIASES.trainingCredits)
      : null;
    const lmsMissing = isBlank(lmsValue) || (typeof lmsValue === "object" && comparable(lmsValue) === comparable({ rawDisplay: null, amount: null, unit: null }));
    const metadataMissing = isBlank(metadataValue) || (typeof metadataValue === "object" && comparable(metadataValue) === comparable({ rawDisplay: null, amount: null, unit: null }));
    const previous = previousComparisons.find((comparison) => comparison.fieldKey === field.key);
    if (lmsMissing && metadataMissing) {
      return { fieldKey: field.key, fieldLabel: field.label, lmsRawValue: lmsRaw, lmsNormalizedValue: lmsValue, contentMetadataRawValue: metadataRaw, contentMetadataNormalizedValue: metadataValue, resolvedValue: null, selectedSource: null, comparisonStatus: "Missing from both", resolutionReason: null, resolvedBy: null, resolvedAt: null, lastComparedAt: comparedAt };
    }
    if (metadataMissing) {
      return { fieldKey: field.key, fieldLabel: field.label, lmsRawValue: lmsRaw, lmsNormalizedValue: lmsValue, contentMetadataRawValue: metadataRaw, contentMetadataNormalizedValue: metadataValue, resolvedValue: lmsValue, selectedSource: "lms", comparisonStatus: "LMS only", resolutionReason: "Only LMS supplied a value.", resolvedBy: null, resolvedAt: null, lastComparedAt: comparedAt };
    }
    if (lmsMissing) {
      return { fieldKey: field.key, fieldLabel: field.label, lmsRawValue: lmsRaw, lmsNormalizedValue: lmsValue, contentMetadataRawValue: metadataRaw, contentMetadataNormalizedValue: metadataValue, resolvedValue: metadataValue, selectedSource: "content_metadata", comparisonStatus: "Content Metadata only", resolutionReason: "Only Content Metadata supplied a value.", resolvedBy: null, resolvedAt: null, lastComparedAt: comparedAt };
    }
    if (comparable(lmsValue) === comparable(metadataValue)) {
      return { fieldKey: field.key, fieldLabel: field.label, lmsRawValue: lmsRaw, lmsNormalizedValue: lmsValue, contentMetadataRawValue: metadataRaw, contentMetadataNormalizedValue: metadataValue, resolvedValue: lmsValue, selectedSource: "lms", comparisonStatus: "Match", resolutionReason: "Normalized source values agree.", resolvedBy: null, resolvedAt: null, lastComparedAt: comparedAt };
    }
    const preserve = previous?.comparisonStatus === "Conflict" && previous.selectedSource;
    return {
      fieldKey: field.key,
      fieldLabel: field.label,
      lmsRawValue: lmsRaw,
      lmsNormalizedValue: lmsValue,
      contentMetadataRawValue: metadataRaw,
      contentMetadataNormalizedValue: metadataValue,
      resolvedValue: preserve ? previous.resolvedValue : null,
      selectedSource: preserve ? previous.selectedSource : null,
      comparisonStatus: "Conflict",
      resolutionReason: preserve ? previous.resolutionReason : null,
      resolvedBy: preserve ? previous.resolvedBy : null,
      resolvedAt: preserve ? previous.resolvedAt : null,
      lastComparedAt: comparedAt,
    };
  });
}

export function applyFieldResolution(
  comparison: ParsedFieldComparison,
  action: "Use LMS value" | "Keep Content Team value" | "Clear resolution and review again",
  actor: string,
  resolvedAt: string,
  reason: string | null = null,
) {
  const previousValues = { selectedSource: comparison.selectedSource, resolvedValue: comparison.resolvedValue };
  const next = { ...comparison };
  if (action === "Use LMS value") {
    next.selectedSource = "lms";
    next.resolvedValue = comparison.lmsNormalizedValue;
  } else if (action === "Keep Content Team value") {
    next.selectedSource = "content_metadata";
    next.resolvedValue = comparison.contentMetadataNormalizedValue;
  } else {
    next.selectedSource = null;
    next.resolvedValue = null;
  }
  next.resolutionReason = action === "Clear resolution and review again" ? null : reason ?? action;
  next.resolvedBy = action === "Clear resolution and review again" ? null : actor;
  next.resolvedAt = action === "Clear resolution and review again" ? null : resolvedAt;
  return {
    comparison: next,
    audit: {
      action: action === "Clear resolution and review again" ? "field_resolution.cleared" : "field_resolution.selected",
      actor,
      occurredAt: resolvedAt,
      previousValues,
      newValues: { selectedSource: next.selectedSource, resolvedValue: next.resolvedValue },
      reason: next.resolutionReason,
    },
  };
}

export function calculateMetadataCompleteness(
  record: ReturnType<typeof parseContentMetadataRow> | null,
  requiredFields: readonly string[] = DEFAULT_REQUIRED_METADATA_FIELDS,
): number {
  if (!record || requiredFields.length === 0) return 0;
  const present = requiredFields.filter((field) => {
    const value = record[field as keyof typeof record];
    return Array.isArray(value) ? value.length > 0 : !isBlank(value);
  }).length;
  return Math.round((present / requiredFields.length) * 100);
}

export function previewContentMetadataImport(
  lmsRecords: ReturnType<typeof parseLmsRow>[],
  metadataRows: SourceRow[],
  options: { verticalCodes?: readonly string[] } = {},
) {
  const lmsById = new Map(lmsRecords.filter((record) => record.normalized.courseId).map((record) => [record.normalized.courseId as string, record]));
  const parsed = parseContentMetadataRows(metadataRows, { verticalCodes: options.verticalCodes, knownCourseIds: lmsById.keys() });
  const uniqueMetadata = parsed.records.filter((record) => record.lmsCourseId && !parsed.duplicateIds.includes(record.lmsCourseId));
  const metadataIds = new Set(uniqueMetadata.map((record) => record.lmsCourseId as string));
  const comparisons = uniqueMetadata.flatMap((record) => reconcileCourseSources(lmsById.get(record.lmsCourseId as string) ?? null, record));
  return {
    matchedLmsCourses: uniqueMetadata.filter((record) => lmsById.has(record.lmsCourseId as string)).length,
    contentMetadataOnlyRecords: uniqueMetadata.filter((record) => !lmsById.has(record.lmsCourseId as string)).length,
    lmsCoursesMissingMetadata: [...lmsById.keys()].filter((id) => !metadataIds.has(id)).length,
    duplicateCourseIds: parsed.duplicateIds,
    missingCourseIds: parsed.missingCourseIdCount,
    invalidVerticals: parsed.records.flatMap((record) => record.mappingWarnings.filter((warning) => warning.includes("vertical"))).length,
    invalidUrls: parsed.records.flatMap((record) => record.validationErrors.filter((error) => error.startsWith("Invalid URL"))).length,
    missingRelationshipTargets: parsed.relationshipErrors.filter((error) => error.message.includes("was not found")).length,
    circularRelationships: parsed.relationshipErrors.filter((error) => error.type === "circular").length,
    overlappingFieldConflicts: comparisons.filter((comparison) => comparison.comparisonStatus === "Conflict").length,
    fieldsWouldBeAdded: comparisons.filter((comparison) => comparison.comparisonStatus === "Content Metadata only").length,
    fieldsUnchanged: comparisons.filter((comparison) => comparison.comparisonStatus === "Match").length,
    rowsBlocked: parsed.records.filter((record) => record.validationErrors.length > 0).length,
    records: parsed.records,
  };
}

export interface MonitoringColumnMapping {
  courseId: string;
  classification: string;
  monitoringEnabled: string;
  reason?: string;
  owner?: string;
  effectiveDate?: string;
}

export function parseMonitoringRows(rows: SourceRow[], mapping: MonitoringColumnMapping) {
  const validClassifications = new Set(["Lexipol managed", "Non-Lexipol tracked", "Non-Lexipol excluded", "Unclassified"]);
  return rows.map((row) => {
    const courseId = normalizeCourseId(row[mapping.courseId]);
    const classification = normalizeWhitespace(row[mapping.classification]);
    const monitoring = normalizeBoolean(row[mapping.monitoringEnabled]);
    const errors = [courseId.error, monitoring.error].filter((value): value is string => Boolean(value));
    if (!classification || !validClassifications.has(classification)) errors.push(`Unknown management classification "${classification ?? ""}".`);
    const effectiveDate = mapping.effectiveDate ? normalizeDate(row[mapping.effectiveDate]) : { value: null, error: null };
    if (effectiveDate.error) errors.push(effectiveDate.error);
    return {
      lmsCourseId: courseId.value,
      classification,
      monitoringEnabled: monitoring.value,
      reason: mapping.reason ? normalizeWhitespace(row[mapping.reason]) : null,
      owner: mapping.owner ? normalizeWhitespace(row[mapping.owner]) : null,
      effectiveDate: effectiveDate.value,
      rawPayload: { ...row },
      validationErrors: errors,
    };
  });
}

export function determineManagementClassification(input: {
  hasLmsRecord: boolean;
  hasContentMetadataMatch: boolean;
  monitoringRule?: { classification: string; monitoringEnabled: boolean } | null;
}) {
  if (input.monitoringRule) {
    return {
      classification: input.monitoringRule.classification,
      monitoringEnabled: input.monitoringRule.monitoringEnabled,
      source: "Monitoring list",
    };
  }
  if (input.hasContentMetadataMatch) {
    return {
      classification: "Lexipol managed",
      monitoringEnabled: true,
      source: "Content Metadata match",
    };
  }
  return {
    classification: "Unclassified",
    monitoringEnabled: input.hasLmsRecord,
    source: "Default",
  };
}

export function calculateSourceAwareMetrics(
  courses: Array<{
    managementClassification: string;
    lmsSnapshot: unknown;
    contentMetadata: unknown;
    conflictCount: number;
    reconciliationStatus: string;
    retrievalStatus: string;
    importValidationErrors: unknown[];
  }>,
  options: { includeExcluded?: boolean } = {},
) {
  const normalPortfolio = options.includeExcluded
    ? courses
    : courses.filter((course) => course.managementClassification !== "Non-Lexipol excluded");
  return {
    totalLmsRetrieved: courses.filter((course) => course.lmsSnapshot).length,
    lexipolManaged: normalPortfolio.filter((course) => course.managementClassification === "Lexipol managed").length,
    nonLexipolTracked: normalPortfolio.filter((course) => course.managementClassification === "Non-Lexipol tracked").length,
    unclassified: normalPortfolio.filter((course) => course.managementClassification === "Unclassified").length,
    missingContentMetadata: normalPortfolio.filter((course) => course.lmsSnapshot && !course.contentMetadata).length,
    missingFromLms: normalPortfolio.filter((course) => !course.lmsSnapshot && course.contentMetadata).length,
    unresolvedConflicts: normalPortfolio.filter((course) => course.conflictCount > 0).length,
    mappingRequired: normalPortfolio.filter((course) => course.reconciliationStatus === "Mapping required").length,
    staleLms: normalPortfolio.filter((course) => ["Stale Data", "Retrieval Failed"].includes(course.retrievalStatus)).length,
    importValidationErrors: normalPortfolio.reduce((total, course) => total + course.importValidationErrors.length, 0),
    portfolioCourseCount: normalPortfolio.length,
  };
}

export function selectCurrentSnapshotAfterRetrieval<T>(input: {
  previousSuccessfulSnapshot: T | null;
  nextSuccessfulSnapshot: T | null;
  retrievalStatus: "Retrieved" | "Retrieved with Warnings" | "Retrieval Failed";
}): T | null {
  if (input.retrievalStatus === "Retrieval Failed") {
    return input.previousSuccessfulSnapshot;
  }
  return input.nextSuccessfulSnapshot ?? input.previousSuccessfulSnapshot;
}
