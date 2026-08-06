import type { Metadata } from "next";
import { AccreditationWorkspace } from "@/components/portfolio-workspaces";
import { getAccreditationBoardPage, getLmsAuthorityMode } from "@/db";
import { requirePageRole } from "@/lib/auth";
import { getAccreditationTablePreferences } from "@/db/preference-repository";
import { withServerOperation } from "@/lib/server-observability";

export const metadata: Metadata = { title: "Accreditation" };

export const dynamic = "force-dynamic";

export default async function AccreditationPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const auth = await requirePageRole("super_admin", "admin", "accreditation");
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);
  const [result, preferences, authorityMode] = await withServerOperation(
    { route: "/accreditation", operation: "load accreditation workspace" },
    () => Promise.all([getAccreditationBoardPage(page, 100), getAccreditationTablePreferences(auth.userId), getLmsAuthorityMode()]),
  );
  return <AccreditationWorkspace entries={result.items} initialPreferences={preferences} canRestore={["super_admin", "admin"].includes(auth.role)} page={page} total={result.total} authorityMode={authorityMode} />;
}
