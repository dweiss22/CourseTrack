import { describe, expect, it } from "vitest";
import { calculateCourseHealth, calculateMetadataCompleteness, HEALTH_FACTORS, HEALTH_LEVELS, healthStatusForScore, reviewCyclePenalty } from "@/lib/health";

describe("canonical CourseTrack health", () => {
  it.each([
    [100, "Healthy"], [85, "Healthy"], [84, "Monitor"], [70, "Monitor"],
    [69, "Needs Review"], [55, "Needs Review"], [54, "At Risk"], [35, "At Risk"],
    [34, "Critical"], [0, "Critical"],
  ] as const)("maps %i to %s", (score, status) => expect(healthStatusForScore(score)).toBe(status));

  it("scores a perfect course at 100 with no deductions", () => {
    expect(calculateCourseHealth({ metadataCompletenessScore: 120, unresolvedConflictCount: 0, daysUntilNextReview: 400 })).toMatchObject({
      score: 100,
      deductions: { dataCompleteness: 0, unresolvedConflicts: 0, reviewCycle: 0 },
    });
  });

  it("applies only a light penalty for incomplete CourseTrack data", () => {
    const result = calculateCourseHealth({ metadataCompletenessScore: 0, unresolvedConflictCount: 0, daysUntilNextReview: 400 });
    expect(result.deductions.dataCompleteness).toBe(15);
    expect(result.score).toBe(85);
  });

  it("applies a flat per-item penalty for unresolved discrepancies", () => {
    const result = calculateCourseHealth({ metadataCompletenessScore: 100, unresolvedConflictCount: 2, daysUntilNextReview: 400 });
    expect(result.deductions.unresolvedConflicts).toBe(20);
    expect(result.score).toBe(80);
  });

  it("clamps the score at 0 when deductions exceed 100", () => {
    const result = calculateCourseHealth({ metadataCompletenessScore: 0, unresolvedConflictCount: 99, daysUntilNextReview: -5000 });
    expect(result.score).toBe(0);
    expect(result.status).toBe("Critical");
  });

  describe("reviewCyclePenalty (graduated next-review-overdue curve)", () => {
    it("is 0 a year or more before the next review date", () => {
      expect(reviewCyclePenalty(365)).toBe(0);
      expect(reviewCyclePenalty(1000)).toBe(0);
      expect(reviewCyclePenalty(null)).toBe(0);
    });

    it("is a modest single-digit deduction exactly at the due date", () => {
      const atDueDate = reviewCyclePenalty(0);
      expect(atDueDate).toBeGreaterThan(0);
      expect(atDueDate).toBeLessThanOrEqual(10);
    });

    it("grows gradually through the pre-due window", () => {
      const eightMonthsOut = reviewCyclePenalty(240);
      const oneMonthOut = reviewCyclePenalty(30);
      const dueDate = reviewCyclePenalty(0);
      expect(eightMonthsOut).toBeLessThan(oneMonthOut);
      expect(oneMonthOut).toBeLessThan(dueDate);
    });

    it("accelerates after the due date passes", () => {
      const dueDate = reviewCyclePenalty(0);
      const sixMonthsOverdue = reviewCyclePenalty(-180);
      const oneYearOverdue = reviewCyclePenalty(-365);
      expect(sixMonthsOverdue).toBeGreaterThan(dueDate);
      expect(oneYearOverdue).toBeGreaterThan(sixMonthsOverdue);
    });

    it("saturates at 100 for a course 3 or more years overdue", () => {
      expect(reviewCyclePenalty(-3 * 365)).toBe(100);
      expect(reviewCyclePenalty(-4 * 365)).toBe(100);
    });

    it("forces course health to 0 once 3+ years overdue regardless of other factors", () => {
      const result = calculateCourseHealth({ metadataCompletenessScore: 100, unresolvedConflictCount: 0, daysUntilNextReview: -3 * 365 });
      expect(result.score).toBe(0);
      expect(result.status).toBe("Critical");
    });
  });

  it("measures exactly the eight documented metadata fields", () => {
    expect(calculateMetadataCompleteness({ lmsCourseId: "1", courseName: "Name", contentType: "Video", durationMinutes: 0, published: false, description: "Description", verticals: ["Law Enforcement"], frontendLink: "https://example.com" })).toBe(100);
    expect(calculateMetadataCompleteness({ lmsCourseId: "1", courseName: "Name", contentType: null, durationMinutes: null, published: null, description: null, verticals: [], frontendLink: null })).toBe(25);
    expect(HEALTH_FACTORS).toHaveLength(3);
    expect(HEALTH_LEVELS.map((level) => [level.min, level.max])).toEqual([[85, 100], [70, 84], [55, 69], [35, 54], [0, 34]]);
  });
});
