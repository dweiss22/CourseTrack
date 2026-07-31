import type { Metadata } from "next";
import { FlagsWorkspace } from "@/components/portfolio-workspaces";

export const metadata: Metadata = { title: "Flags & Follow-Up" };

export default function FlagsPage() {
  return <FlagsWorkspace />;
}
