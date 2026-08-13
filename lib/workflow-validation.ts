import { z } from "zod";
import { managementClassifications, verticals } from "@/types/course";

export const optionalDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]);

export const revampTaskSchema = z.object({
  title: z.string().trim().min(3).max(180),
  bucket: z.enum(["Submitted", "Under Review", "Approved", "In Progress"]),
  priority: z.enum(["Critical", "High", "Medium", "Low", "Monitor Only"]),
  score: z.number().int().min(0).max(100),
  targetPublicationDate: optionalDate,
  businessJustification: z.string().trim().min(10).max(2_000),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export const revampMoveSchema = z.object({
  bucket: z.enum(["Submitted", "Under Review", "Approved", "In Progress"]),
  targetIndex: z.number().int().min(0),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();

export const accreditationSchema = z.object({
  organization: z.string().trim().min(2).max(180),
  // Imported LMS evidence may legitimately omit jurisdiction. The database
  // still requires it for application-created records.
  jurisdiction: z.string().trim().max(120),
  status: z.enum(["Approved", "Approved with Conditions", "Renewal Due", "Renewal Submitted", "Expiring Soon", "Expired", "Not Required"]),
  approvalNumber: z.string().trim().max(120).nullable(),
  topicNumber: z.string().trim().max(120).nullable().default(null),
  creditHours: z.number().min(0).max(10_000),
  effectiveDate: optionalDate,
  expirationDate: optionalDate,
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict().refine(
  (value) => !value.effectiveDate || !value.expirationDate || value.expirationDate >= value.effectiveDate,
  { message: "Expiration date must be on or after the effective date.", path: ["expirationDate"] },
);

export const versionSchema = z.object({
  versionNumber: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  versionType: z.enum(["Initial Release", "Minor Revision", "Major Revision", "Technical Update", "Accessibility Update", "Legal Update", "Accreditation Update"]),
  publicationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  versionStatus: z.enum(["Draft", "In Review", "Scheduled", "Published", "Superseded"]),
  isCurrent: z.boolean(),
  releaseNotes: z.string().trim().max(2_000),
  authoringTool: z.string().trim().max(120),
  packageStandard: z.string().trim().max(120),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export const flagSchema = z.object({
  recordKind: z.enum(["Task", "Callout"]),
  category: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().max(5_000),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  status: z.enum(["Open", "In Progress", "Blocked", "Completed", "Resolved"]),
  assigneeId: z.string().uuid().nullable(),
  dueDate: optionalDate,
  completionNotes: z.string().trim().max(5_000).nullable(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, context) => {
  if (value.recordKind === "Task" && value.status === "Resolved") {
    context.addIssue({ code: "custom", path: ["status"], message: "Tasks are completed, not resolved." });
  }
  if (value.recordKind === "Callout" && value.status === "Completed") {
    context.addIssue({ code: "custom", path: ["status"], message: "Callouts are resolved, not completed." });
  }
});

export const noteSchema = z.object({
  type: z.string().trim().min(2).max(120),
  visibility: z.enum(["Private", "Team", "Role restricted", "Organization"]),
  body: z.string().trim().min(1).max(5_000),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export const courseCreateSchema = z.object({
  courseCode: z.string().trim().min(2).max(64),
  title: z.string().trim().min(3).max(240),
  shortTitle: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(5_000),
  verticals: z.array(z.enum(verticals)).max(verticals.length),
  lifecycleStatus: z.enum(["Published", "Under Maintenance", "Internal Review", "In Development", "Scheduled for Revamp", "Retired", "Archived"]),
  publicationStatus: z.string().trim().min(2).max(80),
}).strict();

const optionalFormDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const optionalHttpUrl = z.union([
  z.literal(""),
  z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), "Use an HTTP or HTTPS URL."),
]);

export const courseProjectionUpdateSchema = z.object({
  courseCode: z.string().trim().min(2).max(64),
  title: z.string().trim().min(1).max(240),
  shortTitle: z.string().trim().max(120),
  description: z.string().trim().max(5_000),
  learningAudience: z.string().trim().max(500),
  verticals: z.array(z.enum(verticals)).max(verticals.length),
  primaryTopic: z.string().trim().max(180),
  managementClassification: z.enum(managementClassifications),
  monitoringEnabled: z.boolean(),
  lifecycleStatus: z.enum(["Published", "Under Maintenance", "Internal Review", "In Development", "Scheduled for Revamp", "Retired", "Archived"]),
  publicationStatus: z.enum(["Unknown", "Not in LMS", "Draft", "Testing", "Published", "Hidden", "Inactive", "Retired", "Retrieval Error"]),
  contentType: z.string().trim().max(120),
  durationMinutes: z.number().int().min(0).max(100_000).nullable(),
  trainingCredits: z.object({
    rawDisplay: z.string().trim().max(120).nullable(),
    amount: z.number().min(0).max(100_000).nullable(),
    unit: z.string().trim().max(40).nullable(),
  }).strict(),
  published: z.boolean().nullable(),
  authoringTool: z.string().trim().max(120),
  stateCode: z.string().trim().max(40),
  owner: z.string().trim().max(120),
  instructionalDesigner: z.string().trim().max(120),
  publishedDate: optionalFormDate,
  lastMajorRevisionDate: optionalFormDate,
  nextReviewDate: optionalFormDate,
  backendLink: optionalHttpUrl,
  frontendLink: optionalHttpUrl,
  updateType: z.string().trim().max(120),
  contentUpdatedAt: optionalFormDate,
  contentNotes: z.string().trim().max(2_000),
  internalSummary: z.string().trim().max(1_200),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();

export const editableCourseFields = [
  "courseCode", "title", "shortTitle", "description", "learningAudience", "verticals", "primaryTopic",
  "managementClassification", "monitoringEnabled", "lifecycleStatus", "publicationStatus", "contentType",
  "durationMinutes", "trainingCredits", "published", "authoringTool", "stateCode", "owner",
  "instructionalDesigner", "publishedDate", "lastMajorRevisionDate", "nextReviewDate", "backendLink",
  "frontendLink", "updateType", "contentUpdatedAt", "contentNotes", "internalSummary",
] as const;

export type EditableCourseField = (typeof editableCourseFields)[number];

const courseFieldValidators: Record<EditableCourseField, z.ZodType> = {
  courseCode: z.string().trim().min(2).max(64), title: z.string().trim().min(1).max(240),
  shortTitle: z.string().trim().max(120), description: z.string().trim().max(5_000),
  learningAudience: z.string().trim().max(500), verticals: z.array(z.enum(verticals)).max(verticals.length),
  primaryTopic: z.string().trim().max(180), managementClassification: z.enum(managementClassifications),
  monitoringEnabled: z.boolean(), lifecycleStatus: z.enum(["Published", "Under Maintenance", "Internal Review", "In Development", "Scheduled for Revamp", "Retired", "Archived"]),
  publicationStatus: z.enum(["Unknown", "Not in LMS", "Draft", "Testing", "Published", "Hidden", "Inactive", "Retired", "Retrieval Error"]),
  contentType: z.string().trim().max(120), durationMinutes: z.number().int().min(0).max(100_000).nullable(),
  trainingCredits: z.object({ rawDisplay: z.string().trim().max(120).nullable(), amount: z.number().min(0).max(100_000).nullable(), unit: z.string().trim().max(40).nullable() }).strict(),
  published: z.boolean().nullable(), authoringTool: z.string().trim().max(120), stateCode: z.string().trim().max(40),
  owner: z.string().trim().max(120), instructionalDesigner: z.string().trim().max(120),
  publishedDate: optionalFormDate, lastMajorRevisionDate: optionalFormDate, nextReviewDate: optionalFormDate,
  backendLink: optionalHttpUrl, frontendLink: optionalHttpUrl, updateType: z.string().trim().max(120),
  contentUpdatedAt: optionalFormDate, contentNotes: z.string().trim().max(2_000), internalSummary: z.string().trim().max(1_200),
};

export const courseFieldMutationSchema = z.object({
  field: z.enum(editableCourseFields), value: z.unknown(), expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict().transform((input, context) => {
  const parsed = courseFieldValidators[input.field].safeParse(input.value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) context.addIssue({ ...issue, path: ["value", ...issue.path] });
    return z.NEVER;
  }
  return { ...input, value: parsed.data };
});

export const relationshipSchema = z.object({
  relationship: z.enum(["parent", "child"]),
  relatedCourseId: z.string().trim().min(1),
}).strict();
