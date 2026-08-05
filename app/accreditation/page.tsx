import type { Metadata } from "next";
import { AccreditationWorkspace } from "@/components/portfolio-workspaces";
import { getAccreditationBoard } from "@/db";
import { requirePageRole } from "@/lib/auth";
import { getAccreditationTablePreferences } from "@/db/preference-repository";

export const metadata: Metadata = { title: "Accreditation" };

export const dynamic = "force-dynamic";

export default async function AccreditationPage() {
  const auth = await requirePageRole("super_admin", "admin", "accreditation");
  const [entries, preferences] = await Promise.all([getAccreditationBoard(), getAccreditationTablePreferences(auth.userId)]);
  return <AccreditationWorkspace entries={entries} initialPreferences={preferences} />;
}
