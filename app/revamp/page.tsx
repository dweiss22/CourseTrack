import type { Metadata } from "next";
import { RevampWorkspace } from "@/components/portfolio-workspaces";
import { getRevampBoard } from "@/db";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Revamp Planning" };

export const dynamic = "force-dynamic";

export default async function RevampPage() {
  await requirePageRole("super_admin", "admin", "content");
  const entries = await getRevampBoard();
  return <RevampWorkspace entries={entries} />;
}
