import type { Metadata } from "next";
import { VersionsWorkspace } from "@/components/portfolio-workspaces";
import { getVersionBoard } from "@/db";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Versions" };

export const dynamic = "force-dynamic";

export default async function VersionsPage() {
  await requirePageRole("super_admin", "admin", "content");
  const entries = await getVersionBoard();
  return <VersionsWorkspace entries={entries} />;
}
