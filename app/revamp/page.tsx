import type { Metadata } from "next";
import { RevampWorkspace } from "@/components/portfolio-workspaces";
import { getCourseIndex, getRevampBoard } from "@/db";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Revamp Planning" };

export const dynamic = "force-dynamic";

export default async function RevampPage() {
  const auth = await requirePageRole("super_admin", "admin", "content");
  const [entries, courseOptions] = await Promise.all([getRevampBoard(), getCourseIndex()]);
  return <RevampWorkspace entries={entries} courseOptions={courseOptions} canApprove={["super_admin", "admin"].includes(auth.role)} />;
}
