import type { Metadata } from "next";
import { FlagsWorkspace } from "@/components/portfolio-workspaces";
import { getFlagBoard } from "@/db";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Flags & Follow-Up" };

export const dynamic = "force-dynamic";

export default async function FlagsPage() {
  await requireUser();
  const entries = await getFlagBoard();
  return <FlagsWorkspace entries={entries} />;
}
