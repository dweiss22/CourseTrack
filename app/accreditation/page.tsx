import type { Metadata } from "next";
import { AccreditationWorkspace } from "@/components/portfolio-workspaces";

export const metadata: Metadata = { title: "Accreditation" };

export default function AccreditationPage() {
  return <AccreditationWorkspace />;
}
