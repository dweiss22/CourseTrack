import { z } from "zod";
import type { Course } from "@/types/course";
import type { ReportColumn, ReportDefinition, ReportFilter, ReportResult, ReportTemplate } from "@/types/reports";

export const REPORT_DATASETS = {
  courses: columns(["courseCode", "Course code", "text"], ["title", "Course title", "text"], ["primaryVertical", "Primary vertical", "text"], ["managementClassification", "Management", "text"], ["publicationStatus", "Publication", "text"], ["healthStatus", "Health", "text"]),
  health: columns(["courseCode", "Course code", "text"], ["title", "Course title", "text"], ["healthStatus", "Health", "text"], ["healthScore", "Score", "number"], ["metadataCompletenessScore", "Metadata completeness", "number"], ["conflictCount", "Unresolved discrepancies", "number"], ["importValidationErrorCount", "Import validation errors", "number"]),
  accreditation: columns(["courseCode", "Course code", "text"], ["title", "Course title", "text"], ["organization", "Organization", "text"], ["jurisdiction", "Jurisdiction", "text"], ["status", "Status", "text"], ["expirationDate", "Expiration date", "date"], ["riskReasons", "Risk reasons", "text"]),
  reviews: columns(["courseCode", "Course code", "text"], ["title", "Course title", "text"], ["nextReviewDate", "Review date", "date"], ["reviewState", "Review state", "text"], ["owner", "Owner", "text"]),
  versions: columns(["courseCode", "Course code", "text"], ["title", "Course title", "text"], ["versionNumber", "Version", "text"], ["versionType", "Version type", "text"], ["publicationDate", "Publication date", "date"], ["versionStatus", "Status", "text"], ["isCurrent", "Current", "boolean"]),
  work: columns(["courseCode", "Course code", "text"], ["courseTitle", "Course title", "text"], ["recordKind", "Kind", "text"], ["title", "Work title", "text"], ["status", "Status", "text"], ["priority", "Priority", "text"], ["assignee", "Assignee", "text"], ["dueDate", "Due date", "date"]),
  revamp: columns(["courseCode", "Course code", "text"], ["courseTitle", "Course title", "text"], ["title", "Proposal", "text"], ["status", "Status", "text"], ["priority", "Priority", "text"], ["score", "Score", "number"], ["targetPublicationDate", "Target publication", "date"]),
  discrepancies: columns(["courseCode", "Course code", "text"], ["courseTitle", "Course title", "text"], ["fieldLabel", "Field", "text"], ["lmsValue", "LMS value", "text"], ["courseTrackValue", "CourseTrack value", "text"], ["comparisonStatus", "Comparison status", "text"], ["resolvedBy", "Resolved by", "text"]),
} as const;

function columns(...items: Array<[string, string, ReportColumn["dataType"]]>): ReportColumn[] {
  return items.map(([key, label, dataType]) => ({ key, label, dataType }));
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  template("course-inventory", "Course inventory", "Complete course portfolio and publication context.", "courses", ["courseCode", "title", "primaryVertical", "managementClassification", "publicationStatus", "healthStatus"], [], [{ field: "title", direction: "asc" }]),
  template("course-health", "Course health", "Canonical health score, factors, and status.", "health", ["courseCode", "title", "healthStatus", "healthScore", "metadataCompletenessScore", "conflictCount", "importValidationErrorCount"], [], [{ field: "healthScore", direction: "asc" }]),
  template("accreditation-risk-expiration", "Accreditation risk and expiration", "Accreditation status, risk, and expiration dates.", "accreditation", ["courseCode", "title", "organization", "jurisdiction", "status", "expirationDate", "riskReasons"], [], [{ field: "expirationDate", direction: "asc" }]),
  { ...template("courses-due-review", "Courses due for review", "Courses with review dates grouped by overdue, current, and future.", "reviews", ["courseCode", "title", "nextReviewDate", "reviewState", "owner"], [{ field: "nextReviewDate", operator: "not_empty" }], [{ field: "nextReviewDate", direction: "asc" }]), group: { field: "reviewState" } },
  template("versions-publication", "Versions and publication activity", "Version and publication history across courses.", "versions", ["courseCode", "title", "versionNumber", "versionType", "publicationDate", "versionStatus", "isCurrent"], [], [{ field: "publicationDate", direction: "desc" }]),
  template("open-tasks-callouts", "Open tasks and callouts", "Open operational work excluding completed and resolved records.", "work", ["courseCode", "courseTitle", "recordKind", "title", "status", "priority", "assignee", "dueDate"], [{ field: "status", operator: "in", value: ["Open", "In Progress", "Blocked"] }], [{ field: "dueDate", direction: "asc" }]),
  template("revamp-planning", "Revamp planning", "Revamp proposals, priorities, scores, and target dates.", "revamp", ["courseCode", "courseTitle", "title", "status", "priority", "score", "targetPublicationDate"], [], [{ field: "score", direction: "desc" }]),
  template("source-discrepancies", "Source discrepancies", "LMS-to-CourseTrack differences excluding exact matches.", "discrepancies", ["courseCode", "courseTitle", "fieldLabel", "lmsValue", "courseTrackValue", "comparisonStatus", "resolvedBy"], [{ field: "comparisonStatus", operator: "neq", value: "Match" }], [{ field: "courseTitle", direction: "asc" }]),
];

function template(id: string, name: string, description: string, dataset: ReportTemplate["dataset"], visibleColumns: string[], filters: ReportFilter[], sort: ReportTemplate["sort"]): ReportTemplate {
  return { id, name, description, dataset, columns: visibleColumns, filters, sort, group: null, immutable: true };
}

const filterSchema = z.object({ field: z.string().min(1).max(80), operator: z.enum(["eq", "neq", "contains", "in", "gte", "lte", "not_empty"]), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional() }).strict();
export const REPORT_OPERATORS_BY_TYPE: Record<ReportColumn["dataType"], readonly ReportFilter["operator"][]> = {
  text: ["eq", "neq", "contains", "in", "not_empty"],
  number: ["eq", "neq", "in", "gte", "lte", "not_empty"],
  date: ["eq", "neq", "in", "gte", "lte", "not_empty"],
  boolean: ["eq", "neq", "not_empty"],
};
export const reportInputSchema = z.object({
  name: z.string().trim().min(3).max(160),
  sourceTemplateId: z.string().max(100).nullable().optional(),
  dataset: z.enum(["courses", "health", "accreditation", "reviews", "versions", "work", "revamp", "discrepancies"]),
  columns: z.array(z.string().min(1).max(80)).min(1).max(30),
  filters: z.array(filterSchema).max(20),
  sort: z.array(z.object({ field: z.string().min(1).max(80), direction: z.enum(["asc", "desc"]) }).strict()).max(5),
  group: z.object({ field: z.string().min(1).max(80) }).strict().nullable(),
  expectedUpdatedAt: z.string().datetime().optional(),
}).strict();

export function validateReportDefinition(input: z.infer<typeof reportInputSchema>) {
  const registry = REPORT_DATASETS[input.dataset];
  const allowed = new Set(registry.map((column) => column.key));
  const referenced = [...input.columns, ...input.filters.map((filter) => filter.field), ...input.sort.map((sort) => sort.field), ...(input.group ? [input.group.field] : [])];
  if (referenced.some((field) => !allowed.has(field))) throw new Error("Report definition references a field that is not allowed for this dataset.");
  for (const filter of input.filters) {
    const column = registry.find((item) => item.key === filter.field)!;
    if (!REPORT_OPERATORS_BY_TYPE[column.dataType].includes(filter.operator)) throw new Error(`${filter.operator} is not allowed for ${column.label}.`);
    if (filter.operator === "not_empty") {
      if (filter.value !== undefined) throw new Error("not_empty filters cannot include a value.");
    } else if (filter.value === undefined) throw new Error(`${filter.operator} filters require a value.`);
    if (filter.operator === "in" && (!Array.isArray(filter.value) || filter.value.length === 0)) throw new Error("in filters require at least one value.");
  }
  return input;
}

export function prebuiltDefinition(template: ReportTemplate): ReportDefinition {
  return { id: template.id, name: template.name, ownerId: null, ownerName: null, sourceTemplateId: template.id, dataset: template.dataset, columns: template.columns, filters: template.filters, sort: template.sort, group: template.group, immutable: true, createdAt: null, updatedAt: null, archivedAt: null };
}

export function executeReport(definition: ReportDefinition, courses: Course[], page = 1, pageSize = 50): ReportResult {
  let rows = datasetRows(definition.dataset, courses);
  rows = rows.filter((row) => definition.filters.every((filter) => applies(row[filter.field], filter)));
  rows.sort((left, right) => {
    for (const sort of definition.sort) {
      const result = compare(left[sort.field], right[sort.field]);
      if (result) return sort.direction === "asc" ? result : -result;
    }
    return 0;
  });
  const total = rows.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const groups = definition.group ? Array.from(rows.reduce((map, row) => map.set(String(row[definition.group!.field] ?? "Unspecified"), (map.get(String(row[definition.group!.field] ?? "Unspecified")) ?? 0) + 1), new Map<string, number>())).map(([value, count]) => ({ value, count })) : [];
  const registry = REPORT_DATASETS[definition.dataset];
  return { definition, columns: definition.columns.map((key) => registry.find((column) => column.key === key)!), rows: rows.slice(start, start + pageSize), total, page, pageSize, groups };
}

function datasetRows(dataset: ReportDefinition["dataset"], courses: Course[]): Array<Record<string, unknown>> {
  const today = new Date().toISOString().slice(0, 10);
  if (dataset === "courses") return courses.map((course) => pickCourse(course));
  if (dataset === "health") return courses.map((course) => ({ ...pickCourse(course), healthScore: course.healthScore, metadataCompletenessScore: course.metadataCompletenessScore, conflictCount: course.conflictCount, importValidationErrorCount: course.importValidationErrors.length }));
  if (dataset === "accreditation") return courses.flatMap((course) => course.accreditations.map((record) => ({ ...pickCourse(course), organization: record.organization, jurisdiction: record.jurisdiction, status: record.status, expirationDate: record.expirationDate, riskReasons: record.riskReasons.join("; ") })));
  if (dataset === "reviews") return courses.map((course) => ({ ...pickCourse(course), nextReviewDate: course.nextReviewDate, reviewState: !course.nextReviewDate ? "Unscheduled" : course.nextReviewDate < today ? "Overdue" : course.nextReviewDate === today ? "Current" : "Future", owner: course.owner }));
  if (dataset === "versions") return courses.flatMap((course) => course.versions.map((version) => ({ ...pickCourse(course), versionNumber: version.versionNumber, versionType: version.versionType, publicationDate: version.publicationDate, versionStatus: version.versionStatus, isCurrent: version.isCurrent })));
  if (dataset === "work") return courses.flatMap((course) => course.flags.filter((item) => !item.archivedAt).map((item) => ({ courseCode: course.courseCode, courseTitle: course.title, recordKind: item.recordKind, title: item.title, status: item.status, priority: item.priority, assignee: item.assignee?.displayName ?? "Unassigned", dueDate: item.dueDate })));
  if (dataset === "revamp") return courses.flatMap((course) => (course.revampTasks ?? []).filter((item) => !item.archivedAt).map((item) => ({ courseCode: course.courseCode, courseTitle: course.title, title: item.title, status: item.status, priority: item.priority, score: item.score, targetPublicationDate: item.targetPublicationDate })));
  return courses.flatMap((course) => course.fieldComparisons.map((item) => ({ courseCode: course.courseCode, courseTitle: course.title, fieldLabel: item.fieldLabel, lmsValue: printable(item.lmsNormalizedValue), courseTrackValue: printable(item.selectedSource ? item.resolvedValue : item.contentMetadataNormalizedValue), comparisonStatus: item.selectedSource && item.comparisonStatus === "Conflict" ? "Resolved discrepancy" : item.comparisonStatus === "Conflict" ? "Discrepancy" : item.comparisonStatus, resolvedBy: item.resolvedBy })));
}

function pickCourse(course: Course) { return { courseCode: course.courseCode, title: course.title, primaryVertical: course.primaryVertical, managementClassification: course.managementClassification === "Lexipol managed" ? "Lexipol Managed" : course.managementClassification, publicationStatus: course.publicationStatus, healthStatus: course.healthStatus }; }
function printable(value: unknown) { return value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); }
function compare(left: unknown, right: unknown) { return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true }); }
function applies(value: unknown, filter: ReportFilter): boolean {
  const source = String(value ?? "").toLowerCase();
  if (filter.operator === "not_empty") return value !== null && value !== undefined && value !== "";
  if (filter.operator === "in") return Array.isArray(filter.value) && filter.value.map((item) => item.toLowerCase()).includes(source);
  const target = String(filter.value ?? "").toLowerCase();
  if (filter.operator === "eq") return source === target;
  if (filter.operator === "neq") return source !== target;
  if (filter.operator === "contains") return source.includes(target);
  const sourceNumber = typeof value === "number" ? value : Number.NaN;
  const targetNumber = typeof filter.value === "number" ? filter.value : Number.NaN;
  if (filter.operator === "gte") return Number.isFinite(sourceNumber) && Number.isFinite(targetNumber) ? sourceNumber >= targetNumber : source >= target;
  if (filter.operator === "lte") return Number.isFinite(sourceNumber) && Number.isFinite(targetNumber) ? sourceNumber <= targetNumber : source <= target;
  return false;
}

export function reportCsv(result: ReportResult): string {
  const safe = (value: unknown) => { const source = String(value ?? ""); const protectedValue = /^[=+\-@]/.test(source) ? `'${source}` : source; return `"${protectedValue.replaceAll('"', '""')}"`; };
  return "\ufeff" + [result.columns.map((column) => column.label), ...result.rows.map((row) => result.columns.map((column) => row[column.key]))].map((row) => row.map(safe).join(",")).join("\r\n") + "\r\n";
}
