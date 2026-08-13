import type { HealthStatus } from "@/types/course";

export const HEALTH_LEVELS = [
  { status: "Healthy", min: 85, max: 100, summary: "Course metadata is complete with few or no unresolved source issues." },
  { status: "Monitor", min: 70, max: 84, summary: "The course is usable, but one or more source-quality factors should be monitored." },
  { status: "Needs Review", min: 55, max: 69, summary: "The course has enough missing or conflicting information to require review." },
  { status: "At Risk", min: 35, max: 54, summary: "Significant source or metadata problems require action." },
  { status: "Critical", min: 0, max: 34, summary: "The course has severe metadata or source-quality gaps." },
] as const satisfies ReadonlyArray<{ status: HealthStatus; min: number; max: number; summary: string }>;

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365;

export const HEALTH_SCORING = {
  minimumScore: 0,
  maximumScore: 100,
  dataCompletenessWeight: 0.15,
  unresolvedConflictPenalty: 10,
  reviewCycleLeadDays: YEAR_DAYS,
  reviewCycleOverdueCapDays: 3 * YEAR_DAYS,
  reviewCyclePreDueExponent: 3,
  reviewCyclePostDueExponent: 1.6,
  reviewCycleDueDatePenalty: 8,
} as const;

export interface HealthFactor { key: "metadata" | "conflicts" | "review"; label: string; detail: string; }

export const HEALTH_FACTORS: readonly HealthFactor[] = [
  {
    key: "metadata",
    label: "CourseTrack Data Completeness",
    detail: `Reflects how many of the eight required CourseTrack fields are filled in. Missing fields cost a few points, not a large penalty — this factor nudges the score, it doesn't drive it.`,
  },
  {
    key: "conflicts",
    label: "Unresolved discrepancies",
    detail: `Subtracts ${HEALTH_SCORING.unresolvedConflictPenalty} points for each field where the CourseTrack record and the LMS disagree and the discrepancy hasn't been resolved. CourseTrack and the LMS should mirror each other, so this is treated as a serious, flat penalty per item.`,
  },
  {
    key: "review",
    label: "Next review overdue",
    detail: `Grows gradually starting about a year before the next review date, accelerates once the course passes that date, and continues accelerating the longer it stays overdue. A course 3 or more years past its next review date scores 0 on this factor alone, regardless of the other factors.`,
  },
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
  nextReviewDate?: string | null;
  /** Days until the next review date (negative if already overdue). Takes precedence over nextReviewDate/asOfDate if provided. */
  daysUntilNextReview?: number | null;
  asOfDate?: string;
}

export interface HealthAssessment {
  score: number;
  status: HealthStatus;
  deductions: {
    dataCompleteness: number;
    unresolvedConflicts: number;
    reviewCycle: number;
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / DAY_MS);
}

/**
 * Continuous penalty (0-100) for the next-review-cycle factor. `daysUntil` is the number of
 * days between "as of" and the course's next review date (negative once the date has passed).
 * The curve is 0 at one year (or more) out, a modest single-digit deduction right at the due
 * date, then accelerates post-due until it saturates at 100 three years past due.
 */
export function reviewCyclePenalty(daysUntil: number | null | undefined): number {
  if (daysUntil === null || daysUntil === undefined) return 0;
  const { reviewCycleLeadDays, reviewCycleOverdueCapDays, reviewCyclePreDueExponent, reviewCyclePostDueExponent, reviewCycleDueDatePenalty } = HEALTH_SCORING;

  if (daysUntil >= reviewCycleLeadDays) return 0;
  if (daysUntil <= -reviewCycleOverdueCapDays) return 100;

  if (daysUntil >= 0) {
    // Pre-due window: eases in from 0 (a year out) to `reviewCycleDueDatePenalty` (at the due date).
    const t = 1 - daysUntil / reviewCycleLeadDays; // 0 at a year out, 1 at the due date
    return Math.round(reviewCycleDueDatePenalty * Math.pow(t, reviewCyclePreDueExponent));
  }

  // Post-due window: accelerates from `reviewCycleDueDatePenalty` (at the due date) to 100 (3 years overdue).
  const overdueDays = -daysUntil;
  const t = overdueDays / reviewCycleOverdueCapDays; // 0 at the due date, 1 at 3 years overdue
  const penalty = reviewCycleDueDatePenalty + (100 - reviewCycleDueDatePenalty) * Math.pow(t, reviewCyclePostDueExponent);
  return Math.round(Math.min(100, penalty));
}

export function calculateCourseHealth(input: HealthAssessmentInput): HealthAssessment {
  const completeness = Math.max(0, Math.min(100, Math.round(input.metadataCompletenessScore)));
  const asOfDate = input.asOfDate ?? todayIso();
  const daysUntilNextReview = input.daysUntilNextReview ?? (input.nextReviewDate ? daysBetween(asOfDate, input.nextReviewDate) : null);

  const deductions = {
    dataCompleteness: Math.round((100 - completeness) * HEALTH_SCORING.dataCompletenessWeight),
    unresolvedConflicts: Math.max(0, input.unresolvedConflictCount) * HEALTH_SCORING.unresolvedConflictPenalty,
    reviewCycle: reviewCyclePenalty(daysUntilNextReview),
  };

  const score = Math.max(
    HEALTH_SCORING.minimumScore,
    Math.min(
      HEALTH_SCORING.maximumScore,
      HEALTH_SCORING.maximumScore - deductions.dataCompleteness - deductions.unresolvedConflicts - deductions.reviewCycle,
    ),
  );
  return { score, status: healthStatusForScore(score), deductions };
}
