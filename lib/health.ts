import type { HealthStatus } from "@/types/course";

export const HEALTH_LEVELS = [
  { status: "Healthy", min: 85, max: 100, summary: "Course metadata is complete with few or no unresolved source issues." },
  { status: "Monitor", min: 70, max: 84, summary: "The course is usable, but one or more source-quality factors should be monitored." },
  { status: "Needs Review", min: 55, max: 69, summary: "The course has enough missing or conflicting information to require review." },
  { status: "At Risk", min: 35, max: 54, summary: "Significant source or metadata problems require action." },
  { status: "Critical", min: 10, max: 34, summary: "The course has severe metadata or source-quality gaps." },
] as const satisfies ReadonlyArray<{ status: HealthStatus; min: number; max: number; summary: string }>;

export const HEALTH_SCORING = {
  minimumScore: 10,
  maximumScore: 100,
  unresolvedConflictPenalty: 7,
  importValidationErrorPenalty: 15,
  missingLmsSnapshotPenalty: 10,
  overdueNextReviewPenalty: 10,
} as const;

export interface HealthFactor { key: "metadata" | "conflicts" | "validation" | "lms" | "review"; label: string; detail: string; }

export const HEALTH_FACTORS: readonly HealthFactor[] = [
  { key: "metadata", label: "Metadata completeness", detail: "Starts with the percentage present across the eight required uploaded metadata fields." },
  { key: "conflicts", label: "Unresolved discrepancies", detail: `Subtracts ${HEALTH_SCORING.unresolvedConflictPenalty} points for each unresolved LMS-to-CourseTrack discrepancy.` },
  { key: "validation", label: "Import validation errors", detail: `Subtracts ${HEALTH_SCORING.importValidationErrorPenalty} points for each validation error on the uploaded record.` },
  { key: "lms", label: "Current LMS snapshot", detail: `Subtracts ${HEALTH_SCORING.missingLmsSnapshotPenalty} points when no current read-only LMS snapshot exists.` },
  { key: "review", label: "Next review overdue", detail: `Subtracts ${HEALTH_SCORING.overdueNextReviewPenalty} points when the next review date has passed.` },
] as const;

export const REQUIRED_HEALTH_METADATA_FIELDS = [
  "LMS course ID",
  "Course name",
  "Content type",
  "Duration",
  "Published state",
  "Description",
  "Verticals",
  "Frontend link",
] as const;

export const REQUIRED_HEALTH_METADATA_KEYS = [
  "lmsCourseId",
  "courseName",
  "contentType",
  "durationMinutes",
  "published",
  "description",
  "verticals",
  "frontendLink",
] as const;

export interface HealthAssessmentInput {
  metadataCompletenessScore: number;
  unresolvedConflictCount: number;
  importValidationErrorCount: number;
  hasCurrentLmsSnapshot: boolean;
  nextReviewOverdue: boolean;
}

export interface HealthAssessment {
  score: number;
  status: HealthStatus;
  deductions: {
    unresolvedConflicts: number;
    importValidationErrors: number;
    missingLmsSnapshot: number;
    overdueNextReview: number;
  };
}

export interface HealthMetadata {
  lmsCourseId?: string | null;
  courseName?: string | null;
  contentType?: string | null;
  durationMinutes?: number | null;
  published?: boolean | null;
  description?: string | null;
  verticals?: readonly unknown[] | null;
  frontendLink?: string | null;
}

export function calculateMetadataCompleteness(metadata: HealthMetadata | null | undefined): number {
  if (!metadata) return 0;
  const values = [
    metadata.lmsCourseId,
    metadata.courseName,
    metadata.contentType,
    metadata.durationMinutes,
    metadata.published,
    metadata.description,
    metadata.verticals,
    metadata.frontendLink,
  ];
  const present = values.filter((value) => Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined).length;
  return Math.round((present / REQUIRED_HEALTH_METADATA_FIELDS.length) * 100);
}

export function healthStatusForScore(score: number): HealthStatus {
  return HEALTH_LEVELS.find((level) => score >= level.min)?.status ?? "Critical";
}

export function calculateCourseHealth(input: HealthAssessmentInput): HealthAssessment {
  const metadata = Math.max(0, Math.min(HEALTH_SCORING.maximumScore, Math.round(input.metadataCompletenessScore)));
  const deductions = {
    unresolvedConflicts: Math.max(0, input.unresolvedConflictCount) * HEALTH_SCORING.unresolvedConflictPenalty,
    importValidationErrors: Math.max(0, input.importValidationErrorCount) * HEALTH_SCORING.importValidationErrorPenalty,
    missingLmsSnapshot: input.hasCurrentLmsSnapshot ? 0 : HEALTH_SCORING.missingLmsSnapshotPenalty,
    overdueNextReview: input.nextReviewOverdue ? HEALTH_SCORING.overdueNextReviewPenalty : 0,
  };
  const score = Math.max(
    HEALTH_SCORING.minimumScore,
    Math.min(
      HEALTH_SCORING.maximumScore,
      metadata - deductions.unresolvedConflicts - deductions.importValidationErrors - deductions.missingLmsSnapshot - deductions.overdueNextReview,
    ),
  );
  return { score, status: healthStatusForScore(score), deductions };
}
