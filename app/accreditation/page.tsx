import type { Metadata } from "next";
import { AccreditationWorkspace } from "@/components/portfolio-workspaces";
import { getAccreditationBoard } from "@/db";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Accreditation" };

export const dynamic = "force-dynamic";

export default async function AccreditationPage() {
  await requirePageRole("super_admin", "admin", "accreditation");
  const entries = await getAccreditationBoard();
  return <AccreditationWorkspace entries={entries} />;
}
