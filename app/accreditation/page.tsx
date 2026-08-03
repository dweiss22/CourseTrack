import type { Metadata } from "next";
import { AccreditationWorkspace } from "@/components/portfolio-workspaces";
import { getAccreditationBoard } from "@/db";

export const metadata: Metadata = { title: "Accreditation" };

export const dynamic = "force-dynamic";

export default async function AccreditationPage() {
  const entries = await getAccreditationBoard();
  return <AccreditationWorkspace entries={entries} />;
}
