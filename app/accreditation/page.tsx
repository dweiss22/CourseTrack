import type { Metadata } from "next";
import { AccreditationWorkspace } from "@/components/portfolio-workspaces";
import { getAccreditationBoardPage, getLmsAuthorityMode } from "@/db";
import { requirePageRole } from "@/lib/auth";
import { getAccreditationTablePreferences } from "@/db/preference-repository";
import { withServerOperation } from "@/lib/server-observability";

export const metadata: Metadata = { title: "Accreditation" };

export const dynamic = "force-dynamic";

export default async function AccreditationPage({ searchParams }: { searchParams: Promise<{ page?: string; pageSize?: string }> }) {
  const auth = await requirePageRole("super_admin", "admin", "accreditation");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const requestedSize = Number(params.pageSize ?? 100);
  const pageSize = [25, 50, 100, 200].includes(requestedSize) ? requestedSize : 100;
  const [result, preferences, authorityMode] = await withServerOperation(
    { route: "/accreditation", operation: "load accreditation workspace" },
    () => Promise.all([getAccreditationBoardPage(page, pageSize), getAccreditationTablePreferences(auth.userId), getLmsAuthorityMode()]),
  );
  return <AccreditationWorkspace entries={result.items} initialPreferences={preferences} canRestore={["super_admin", "admin", "accreditation"].includes(auth.role)} page={page} pageSize={pageSize} total={result.total} authorityMode={authorityMode} userId={auth.userId} />;
}
