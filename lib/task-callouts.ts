import type { TaskCalloutRecord } from "@/types/course";

export const TASK_CALLOUT_KINDS = ["Task", "Callout"] as const;
export const TASK_CALLOUT_PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export const TASK_CALLOUT_STATUSES = ["Open", "In Progress", "Blocked", "Completed", "Resolved"] as const;

export function statusesForKind(kind: TaskCalloutRecord["recordKind"]): TaskCalloutRecord["status"][] {
  return kind === "Task"
    ? ["Open", "In Progress", "Blocked", "Completed"]
    : ["Open", "In Progress", "Blocked", "Resolved"];
}

export function isTaskCalloutClosed(record: Pick<TaskCalloutRecord, "status">): boolean {
  return record.status === "Completed" || record.status === "Resolved";
}

export function taskCalloutDueState(record: Pick<TaskCalloutRecord, "dueDate" | "status">, today = new Date().toISOString().slice(0, 10)): "Overdue" | "Due" | "No due date" | "Closed" {
  if (isTaskCalloutClosed(record)) return "Closed";
  if (!record.dueDate) return "No due date";
  return record.dueDate < today ? "Overdue" : "Due";
}

export function taskCalloutStatusAction(record: Pick<TaskCalloutRecord, "recordKind" | "status">): { label: string; status: TaskCalloutRecord["status"] } {
  if (record.status === "Completed" || record.status === "Resolved") return { label: "Reopen", status: "Open" };
  return record.recordKind === "Task" ? { label: "Complete", status: "Completed" } : { label: "Resolve", status: "Resolved" };
}
