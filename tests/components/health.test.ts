import { describe, expect, it } from "vitest";
import { calculateCourseHealth, calculateMetadataCompleteness, HEALTH_FACTORS, HEALTH_LEVELS, healthStatusForScore } from "@/lib/health";

describe("canonical CourseTrack health", () => {
  it.each([
    [100, "Healthy"], [85, "Healthy"], [84, "Monitor"], [70, "Monitor"],
    [69, "Needs Review"], [55, "Needs Review"], [54, "At Risk"], [35, "At Risk"],
    [34, "Critical"], [10, "Critical"],
  ] as const)("maps %i to %s", (score, status) => expect(healthStatusForScore(score)).toBe(status));

  it("uses every deduction and both clamp boundaries", () => {
    expect(calculateCourseHealth({ metadataCompletenessScore: 120, unresolvedConflictCount: 0, importValidationErrorCount: 0, hasCurrentLmsSnapshot: true }).score).toBe(100);
    expect(calculateCourseHealth({ metadataCompletenessScore: 100, unresolvedConflictCount: 2, importValidationErrorCount: 1, hasCurrentLmsSnapshot: false })).toMatchObject({ score: 61, status: "Needs Review", deductions: { unresolvedConflicts: 14, importValidationErrors: 15, missingLmsSnapshot: 10 } });
    expect(calculateCourseHealth({ metadataCompletenessScore: 0, unresolvedConflictCount: 99, importValidationErrorCount: 99, hasCurrentLmsSnapshot: false }).score).toBe(10);
  });

  it("measures exactly the eight documented metadata fields", () => {
    expect(calculateMetadataCompleteness({ lmsCourseId: "1", courseName: "Name", contentType: "Video", durationMinutes: 0, published: false, description: "Description", verticals: ["Law Enforcement"], frontendLink: "https://example.com" })).toBe(100);
    expect(calculateMetadataCompleteness({ lmsCourseId: "1", courseName: "Name", contentType: null, durationMinutes: null, published: null, description: null, verticals: [], frontendLink: null })).toBe(25);
    expect(HEALTH_FACTORS).toHaveLength(4);
    expect(HEALTH_LEVELS.map((level) => [level.min, level.max])).toEqual([[85, 100], [70, 84], [55, 69], [35, 54], [10, 34]]);
  });
});
