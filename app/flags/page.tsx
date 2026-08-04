import type { Metadata } from "next";
import { FlagsWorkspace } from "@/components/portfolio-workspaces";
import { getCourseIndex, getFlagBoard } from "@/db";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Flags & Follow-Up" };

export const dynamic = "force-dynamic";

export default async function FlagsPage() {
  await requireUser();
  const [entries, courseOptions] = await Promise.all([getFlagBoard(), getCourseIndex()]);
  return <FlagsWorkspace entries={entries} courseOptions={courseOptions} />;
}
