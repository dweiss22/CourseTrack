import type { ReactNode } from "react";

const toneByLabel: Record<string, string> = {
  Healthy: "success",
  Retrieved: "success",
  Published: "success",
  Completed: "success",
  CourseTrack: "success",
  Approved: "success",
  "Lexipol managed": "success",
  "Matched between LMS and Content Metadata": "success",
  Match: "success",
  "Sample Data": "sample",
  sample: "sample",
  Monitor: "info",
  Draft: "info",
  "In Progress": "info",
  "In Review": "info",
  Scheduled: "info",
  "Under Review": "info",
  "Needs Review": "warning",
  "Expiring Soon": "warning",
  "Retrieved with Warnings": "warning",
  "Stale Data": "warning",
  Unclassified: "warning",
  "LMS only / missing Content Metadata": "warning",
  "Content Metadata only / missing from LMS": "warning",
  "At Risk": "danger",
  Critical: "danger",
  Expired: "danger",
  "Retrieval Failed": "danger",
  "Mapping Required": "danger",
  "Mapping required": "danger",
  "Duplicate identifier": "danger",
  "Invalid source record": "danger",
  Conflict: "danger",
  Archived: "neutral",
  Retired: "neutral",
  "Not Required": "neutral",
  "Non-Lexipol tracked": "info",
  "Non-Lexipol excluded": "neutral",
  "LMS only": "info",
  "Content Metadata only": "info",
  "Missing from both": "neutral",
  Superseded: "neutral",
  "On Hold": "warning",
  "Mock Wrike": "sample",
};

export function StatusBadge({
  children,
  label,
  tone,
}: {
  children?: ReactNode;
  label?: string;
  tone?: "success" | "warning" | "danger" | "info" | "sample" | "neutral";
}) {
  const text = label ?? String(children ?? "");
  const resolvedTone = tone ?? toneByLabel[text] ?? "neutral";
  return <span className={`status-badge status-${resolvedTone}`}>{children ?? label}</span>;
}
