import type { Metadata } from "next";
import { VersionsWorkspace } from "@/components/portfolio-workspaces";

export const metadata: Metadata = { title: "Versions" };

export default function VersionsPage() {
  return <VersionsWorkspace />;
}
