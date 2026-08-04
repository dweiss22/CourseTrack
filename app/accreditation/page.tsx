import type { Metadata } from "next";
import { AccreditationWorkspace } from "@/components/portfolio-workspaces";
import { getAccreditationBoard, getCourseIndex } from "@/db";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Accreditation" };

export const dynamic = "force-dynamic";

export default async function AccreditationPage() {
  await requirePageRole("super_admin", "admin", "accreditation");
  const [entries, courseOptions] = await Promise.all([getAccreditationBoard(), getCourseIndex()]);
  return <AccreditationWorkspace entries={entries} courseOptions={courseOptions} />;
}
