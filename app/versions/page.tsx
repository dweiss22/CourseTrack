import type { Metadata } from "next";
import { VersionsWorkspace } from "@/components/portfolio-workspaces";
import { getVersionBoard } from "@/db";
import { getWrikeProvider } from "@/providers/wrike";

export const metadata: Metadata = { title: "Versions" };

export const dynamic = "force-dynamic";

export default async function VersionsPage() {
  const [entries, wrikeTasks] = await Promise.all([
    getVersionBoard(),
    getWrikeProvider()
      .searchTasks({ pageSize: 12 })
      .then((response) => response.items)
      .catch(() => []),
  ]);
  return <VersionsWorkspace entries={entries} initialWrikeTasks={wrikeTasks} />;
}
