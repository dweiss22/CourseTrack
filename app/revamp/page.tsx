import type { Metadata } from "next";
import { RevampWorkspace } from "@/components/portfolio-workspaces";

export const metadata: Metadata = { title: "Revamp Planning" };

export default function RevampPage() {
  return <RevampWorkspace />;
}
