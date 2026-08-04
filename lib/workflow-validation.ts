import { z } from "zod";

export const optionalDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]);

export const revampTaskSchema = z.object({
  title: z.string().trim().min(3).max(180),
  bucket: z.enum(["Submitted", "Under Review", "Approved", "In Progress"]),
  priority: z.enum(["Critical", "High", "Medium", "Low", "Monitor Only"]),
  score: z.number().int().min(0).max(100),
  targetPublicationDate: optionalDate,
  businessJustification: z.string().trim().min(10).max(2_000),
  expectedUpdatedAt: z.string().datetime().optional(),
}).strict();

export const revampMoveSchema = z.object({
  bucket: z.enum(["Submitted", "Under Review", "Approved", "In Progress"]),
  targetIndex: z.number().int().min(0),
  expectedUpdatedAt: z.string().datetime(),
}).strict();

export const accreditationSchema = z.object({
  organization: z.string().trim().min(2).max(180),
  jurisdiction: z.string().trim().min(1).max(120),
  status: z.enum(["Approved", "Approved with Conditions", "Renewal Due", "Renewal Submitted", "Expiring Soon", "Expired", "Not Required"]),
  approvalNumber: z.string().trim().max(120).nullable(),
  creditHours: z.number().min(0).max(10_000),
  effectiveDate: optionalDate,
  expirationDate: optionalDate,
  expectedUpdatedAt: z.string().datetime().optional(),
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
  expectedUpdatedAt: z.string().datetime().optional(),
}).strict();

export const flagSchema = z.object({
  type: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(240),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  status: z.enum(["Open", "Under Review", "In Progress", "Blocked", "Resolved"]),
  dueDate: optionalDate,
  expectedUpdatedAt: z.string().datetime().optional(),
}).strict();

export const noteSchema = z.object({
  type: z.string().trim().min(2).max(120),
  visibility: z.enum(["Private", "Team", "Role restricted", "Organization"]),
  body: z.string().trim().min(1).max(5_000),
  expectedUpdatedAt: z.string().datetime().optional(),
}).strict();

export const courseCreateSchema = z.object({
  courseCode: z.string().trim().min(2).max(64),
  title: z.string().trim().min(3).max(240),
  shortTitle: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(5_000),
  primaryVertical: z.string().trim().min(2).max(120),
  lifecycleStatus: z.enum(["Published", "Under Maintenance", "Internal Review", "In Development", "Scheduled for Revamp", "Retired", "Archived"]),
  publicationStatus: z.string().trim().min(2).max(80),
}).strict();

export const relationshipSchema = z.object({
  relationship: z.enum(["parent", "child"]),
  relatedCourseId: z.string().trim().min(1),
}).strict();
