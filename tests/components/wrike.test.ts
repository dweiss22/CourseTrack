import { describe, expect, it } from "vitest";
import { buildWrikeTaskSearchQuery } from "@/lib/wrike-matching";
import { normalizeWrikeTask } from "@/lib/wrike-sync";

describe("Wrike title search and sparse normalization", () => {
  it("uses meaningful course-title tokens instead of course code", () => {
    expect(buildWrikeTaskSearchQuery({ courseCode: "CT-999", title: "The Critical Incident Leadership Course" })).toBe("critical incident leadership");
  });
  it("normalizes optional fields and retains the full raw payload", () => {
    const raw = { id: "IEAA", title: "Critical incident update", dates: { due: "2026-08-20" }, responsibleIds: ["K1"], customFields: [{ id: "C1", value: "yes" }] };
    expect(normalizeWrikeTask(raw)).toMatchObject({ wrikeTaskId: "IEAA", dueDate: "2026-08-20", responsibleIds: ["K1"], parentIds: [], customFields: raw.customFields, rawPayload: raw });
  });
});
