import type { Metadata } from "next";
import { VersionsWorkspace } from "@/components/portfolio-workspaces";
import { getVersionBoardPage } from "@/db";
import { requirePageRole } from "@/lib/auth";
import { getVersionsTablePreferences } from "@/db/preference-repository";
import { withServerOperation } from "@/lib/server-observability";

export const metadata: Metadata = { title: "Versions" };

export const dynamic = "force-dynamic";

export default async function VersionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const auth = await requirePageRole("super_admin", "admin", "content");
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);
  const [result, preferences] = await withServerOperation(
    { route: "/versions", operation: "load versions workspace" },
    () => Promise.all([getVersionBoardPage(page, 100), getVersionsTablePreferences(auth.userId)]),
  );
  return <VersionsWorkspace entries={result.items} initialPreferences={preferences} canRestore={["super_admin", "admin"].includes(auth.role)} page={page} total={result.total} />;
}
