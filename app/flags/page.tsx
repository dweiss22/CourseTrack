import type { Metadata } from "next";
import { FlagsWorkspace } from "@/components/portfolio-workspaces";
import { getFlagBoard } from "@/db";

export const metadata: Metadata = { title: "Flags & Follow-Up" };

export const dynamic = "force-dynamic";

export default async function FlagsPage() {
  const entries = await getFlagBoard();
  return <FlagsWorkspace entries={entries} />;
}
