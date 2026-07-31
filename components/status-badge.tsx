import type { ReactNode } from "react";

const toneByLabel: Record<string, string> = {
  Healthy: "success",
  Retrieved: "success",
  Published: "success",
  Approved: "success",
  "Sample Data": "sample",
  sample: "sample",
  Monitor: "info",
  Draft: "info",
  "Under Review": "info",
  "Needs Review": "warning",
  "Expiring Soon": "warning",
  "Retrieved with Warnings": "warning",
  "Stale Data": "warning",
  "At Risk": "danger",
  Critical: "danger",
  Expired: "danger",
  "Retrieval Failed": "danger",
  "Mapping Required": "danger",
  Archived: "neutral",
  Retired: "neutral",
  "Not Required": "neutral",
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
