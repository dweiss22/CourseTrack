import type { Metadata } from "next";
import { AdminWorkspace } from "@/components/portfolio-workspaces";

export const metadata: Metadata = { title: "Administration" };

export default function AdministrationPage() {
  return <AdminWorkspace />;
}
