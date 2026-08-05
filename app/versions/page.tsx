import type { Metadata } from "next";
import { VersionsWorkspace } from "@/components/portfolio-workspaces";
import { getVersionBoard } from "@/db";
import { requirePageRole } from "@/lib/auth";
import { getVersionsTablePreferences } from "@/db/preference-repository";

export const metadata: Metadata = { title: "Versions" };

export const dynamic = "force-dynamic";

export default async function VersionsPage() {
  const auth = await requirePageRole("super_admin", "admin", "content");
  const [entries, preferences] = await Promise.all([getVersionBoard(), getVersionsTablePreferences(auth.userId)]);
  return <VersionsWorkspace entries={entries} initialPreferences={preferences} />;
}
