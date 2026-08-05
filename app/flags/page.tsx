import type { Metadata } from "next";
import { TaskCalloutWorkspace } from "@/components/task-callout-workspace";
import { getActiveAssignees, getFlagBoard } from "@/db";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Tasks & Callouts" };

export const dynamic = "force-dynamic";

export default async function FlagsPage() {
  await requireUser();
  const [entries, assignees] = await Promise.all([getFlagBoard(), getActiveAssignees()]);
  return <TaskCalloutWorkspace entries={entries} assignees={assignees} />;
}
