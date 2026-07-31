import type { WrikeTask } from "@/providers/wrike/wrike-types";

const retrievedAt = "2026-07-31T14:00:00.000Z";

const projects = [
  ["MOCK-WRIKE-PROJECT-01", "2026 Course Maintenance"],
  ["MOCK-WRIKE-PROJECT-02", "Legal and Policy Updates"],
  ["MOCK-WRIKE-PROJECT-03", "Accessibility Remediation"],
  ["MOCK-WRIKE-PROJECT-04", "Accreditation Renewals"],
  ["MOCK-WRIKE-PROJECT-05", "New Course Development"],
] as const;

const work = [
  "Refresh scenarios and knowledge checks",
  "Review policy and legal references",
  "Remediate captions and keyboard navigation",
  "Update accreditation documentation",
  "Replace outdated course examples",
  "Revise narration and supporting media",
  "Validate learner-facing links",
  "Complete editorial and stakeholder review",
  "Publish approved course package",
  "Confirm post-release quality checks",
] as const;

const assignees = [
  ["Jamie Patel"],
  ["Taylor Reed", "Morgan Chen"],
  ["Riley Brooks"],
  ["Avery Johnson"],
] as const;

export const sampleWrikeTasks: WrikeTask[] = Array.from(
  { length: 18 },
  (_, index) => {
    const project = projects[index % projects.length];
    const status = ["New", "In Progress", "Completed", "On Hold"][index % 4];
    const dueDate = new Date(Date.UTC(2026, 7, 8 + index * 3))
      .toISOString()
      .slice(0, 10);
    return {
      externalTaskId: `MOCK-WRIKE-TASK-${String(index + 1).padStart(4, "0")}`,
      title: `${work[index % work.length]} - sample ${index + 1}`,
      projectId: project[0],
      projectTitle: project[1],
      status,
      assigneeNames: [...assignees[index % assignees.length]],
      dueDate,
      permalink: null,
      retrievedAt,
      providerName: "Mock Wrike",
      isSample: true,
      rawPayload: {
        fixture: "Mock Wrike task",
        taskIndex: index + 1,
      },
    };
  },
);
