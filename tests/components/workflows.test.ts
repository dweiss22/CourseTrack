import { describe, expect, it } from "vitest";
import { flagSchema } from "@/lib/workflow-validation";
import { statusesForKind, taskCalloutDueState, taskCalloutStatusAction } from "@/lib/task-callouts";

const base = { category: "Content", title: "Review source", description: "", priority: "High", assigneeId: null, dueDate: null, completionNotes: null } as const;
describe("task/callout model", () => {
  it("enforces type-aware terminal states", () => {
    expect(flagSchema.safeParse({ ...base, recordKind: "Task", status: "Completed" }).success).toBe(true);
    expect(flagSchema.safeParse({ ...base, recordKind: "Task", status: "Resolved" }).success).toBe(false);
    expect(flagSchema.safeParse({ ...base, recordKind: "Callout", status: "Resolved" }).success).toBe(true);
    expect(flagSchema.safeParse({ ...base, recordKind: "Callout", status: "Completed" }).success).toBe(false);
    expect(statusesForKind("Task")).not.toContain("Resolved");
  });
  it("distinguishes overdue and accessible actions without color", () => {
    expect(taskCalloutDueState({ dueDate: "2020-01-01", status: "Open" }, "2026-01-01")).toBe("Overdue");
    expect(taskCalloutStatusAction({ recordKind: "Task", status: "Open" })).toEqual({ label: "Complete", status: "Completed" });
    expect(taskCalloutStatusAction({ recordKind: "Callout", status: "Resolved" })).toEqual({ label: "Reopen", status: "Open" });
  });
});
