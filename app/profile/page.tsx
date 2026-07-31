import type { Metadata } from "next";
import { ProfileWorkspace } from "@/components/portfolio-workspaces";

export const metadata: Metadata = { title: "User Profile" };

export default function ProfilePage() {
  return <ProfileWorkspace />;
}
