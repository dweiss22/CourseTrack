import type { Metadata } from "next";
import { UserManagementWorkspace } from "@/components/portfolio-workspaces";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/db";

export const metadata: Metadata = { title: "User Management" };

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const context = await requireAdmin();
  const users = await listUsers();
  return (
    <UserManagementWorkspace
      initialUsers={users}
      currentUserId={context.userId}
      currentUserRole={context.role}
    />
  );
}
