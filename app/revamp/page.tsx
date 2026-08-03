import type { Metadata } from "next";
import { RevampWorkspace } from "@/components/portfolio-workspaces";
import { getRevampBoard } from "@/db";

export const metadata: Metadata = { title: "Revamp Planning" };

export const dynamic = "force-dynamic";

export default async function RevampPage() {
  const entries = await getRevampBoard();
  return <RevampWorkspace entries={entries} />;
}
