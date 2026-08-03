import type { Metadata } from "next";
import { ProfileWorkspace } from "@/components/portfolio-workspaces";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "User Profile" };

export default async function ProfilePage() {
  const authContext = await requireUser();
  return <ProfileWorkspace authContext={authContext} />;
}
