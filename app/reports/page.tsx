import type { Metadata } from "next";
import { ReportsWorkspace } from "@/components/portfolio-workspaces";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return <ReportsWorkspace />;
}
