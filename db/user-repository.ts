import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationRole } from "@/lib/auth";

type Row = Record<string, unknown>;
type AccountStatus = "active" | "disabled";

function repositoryError(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${error.message}`);
}

/**
 * The only self-service profile mutation: a user's own display name.
 * Deliberately does not accept role/account_status -- those are handled by
 * changeUserRoleOrStatus() and gated to admins, and are additionally
 * protected by the protect_profile_role_changes() DB trigger.
 */
export async function updateOwnDisplayName(
  client: SupabaseClient,
  input: { userId: string; displayName: string },
): Promise<void> {
  const { error } = await client
    .from("profiles")
    .update({ display_name: input.displayName })
    .eq("id", input.userId);
  if (error) throw repositoryError("Could not update your display name", error);
}

export interface ApplicationUserSummary {
  id: string;
  email: string;
  displayName: string;
  role: ApplicationRole;
  accountStatus: AccountStatus;
  createdBy: string | null;
  createdAt: string;
  invitationStatus: "pending" | "ready";
}

function toUserSummary(
  row: Row,
  invitationStatus: ApplicationUserSummary["invitationStatus"] = "pending",
): ApplicationUserSummary {
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    role: row.role as ApplicationRole,
    accountStatus: row.account_status as AccountStatus,
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    invitationStatus,
  };
}

async function authReadinessByUserId(
  client: SupabaseClient,
): Promise<Map<string, ApplicationUserSummary["invitationStatus"]>> {
  const readiness = new Map<string, ApplicationUserSummary["invitationStatus"]>();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw repositoryError("Could not read Auth invitation status", error);
    for (const user of data.users) {
      readiness.set(
        user.id,
        user.email_confirmed_at && user.last_sign_in_at ? "ready" : "pending",
      );
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return readiness;
}

async function invitationStatusForUser(
  client: SupabaseClient,
  userId: string,
): Promise<ApplicationUserSummary["invitationStatus"]> {
  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error) throw repositoryError("Could not read Auth invitation status", error);
  return data.user.email_confirmed_at && data.user.last_sign_in_at ? "ready" : "pending";
}

export async function listApplicationUsers(
  client: SupabaseClient,
  filters: { role?: ApplicationRole; status?: AccountStatus } = {},
): Promise<ApplicationUserSummary[]> {
  let query = client
    .from("profiles")
    .select("id,email,display_name,role,account_status,created_by,created_at")
    .order("created_at", { ascending: false });
  if (filters.role) query = query.eq("role", filters.role);
  if (filters.status) query = query.eq("account_status", filters.status);

  const { data, error } = await query;
  if (error) throw repositoryError("Could not list users", error);
  const readiness = await authReadinessByUserId(client);
  return (data ?? []).map((row) => toUserSummary(row, readiness.get(row.id as string) ?? "pending"));
}

/**
 * Enforces who may assign which role: super_admin can assign any role;
 * admin may only assign accreditation/content (never super_admin or admin,
 * per this app's role definitions -- nothing today requires admin-to-admin
 * promotion). Anyone else may not assign roles at all.
 */
function assertActorCanAssignRole(actorRole: ApplicationRole, targetRole: ApplicationRole): void {
  if (targetRole === "super_admin") {
    throw new Error("Use the protected transfer workflow to assign the super_admin role.");
  }
  if (actorRole === "super_admin") return;
  if (actorRole === "admin") {
    if (targetRole === "accreditation" || targetRole === "content") return;
    throw new Error("Admins may only assign the accreditation or content role.");
  }
  throw new Error("You do not have permission to assign roles.");
}

export async function createApplicationUserMembership(
  client: SupabaseClient,
  input: {
    email: string;
    displayName: string;
    role: ApplicationRole;
    actorId: string;
    actorRole: ApplicationRole;
    redirectTo: string;
  },
): Promise<ApplicationUserSummary> {
  assertActorCanAssignRole(input.actorRole, input.role);

  const normalizedEmail = input.email.trim().toLowerCase();
  let authUserId: string;

  const { data: invited, error: inviteError } = await client.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: input.redirectTo,
  });

  if (invited?.user) {
    authUserId = invited.user.id;
  } else if (inviteError && /already.*(registered|exists)/i.test(inviteError.message)) {
    // The Auth identity already exists (e.g. re-adding a previously removed
    // membership). Confirm it and (re)send a setup link instead of creating
    // a new one.
    const { data: linkData, error: linkError } = await client.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
    });
    if (linkError || !linkData?.user) {
      throw new Error("Could not locate the existing Auth account for this email.");
    }
    authUserId = linkData.user.id;
    await client.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: input.redirectTo });
  } else {
    throw new Error(`Could not create the Auth account: ${inviteError?.message ?? "unknown error"}`);
  }

  const { data, error } = await client
    .from("profiles")
    .upsert(
      {
        id: authUserId,
        email: normalizedEmail,
        display_name: input.displayName,
        role: input.role,
        account_status: "active",
        created_by: input.actorId,
      },
      { onConflict: "id" },
    )
    .select("id,email,display_name,role,account_status,created_by,created_at")
    .single();
  if (error) throw repositoryError("Could not create the application user", error);
  const invitationStatus = await invitationStatusForUser(client, authUserId);
  return toUserSummary(data, invitationStatus);
}

export async function changeUserRoleOrStatus(
  client: SupabaseClient,
  input: {
    targetId: string;
    actorId: string;
    actorRole: ApplicationRole;
    newRole?: ApplicationRole;
    newStatus?: AccountStatus;
  },
): Promise<ApplicationUserSummary> {
  if (input.targetId === input.actorId) {
    throw new Error("You cannot change your own role or account status.");
  }
  if (!input.newRole && !input.newStatus) {
    throw new Error("Nothing to update.");
  }

  const { data: targetRow, error: targetError } = await client
    .from("profiles")
    .select("id,role,account_status")
    .eq("id", input.targetId)
    .maybeSingle();
  if (targetError) throw repositoryError("Could not read the target user", targetError);
  if (!targetRow) throw new Error("User not found.");

  const currentRole = targetRow.role as ApplicationRole;

  if (currentRole === "super_admin" || input.newRole === "super_admin") {
    throw new Error("Use the protected transfer workflow to change the super_admin holder.");
  }

  if (input.actorRole === "admin") {
    if (currentRole === "admin") {
      throw new Error("Admins cannot modify another admin.");
    }
    if (input.newRole) {
      assertActorCanAssignRole(input.actorRole, input.newRole);
    }
  } else if (input.actorRole !== "super_admin") {
    throw new Error("You do not have permission to manage users.");
  }

  const updates: Record<string, unknown> = {};
  if (input.newRole) updates.role = input.newRole;
  if (input.newStatus) updates.account_status = input.newStatus;

  const { data, error } = await client
    .from("profiles")
    .update(updates)
    .eq("id", input.targetId)
    .select("id,email,display_name,role,account_status,created_by,created_at")
    .single();
  if (error) throw repositoryError("Could not update the user", error);
  const invitationStatus = await invitationStatusForUser(client, input.targetId);
  return toUserSummary(data, invitationStatus);
}

export interface SuperAdminTransferResult {
  previousSuperAdmin: ApplicationUserSummary;
  newSuperAdmin: ApplicationUserSummary;
}

export async function transferSuperAdmin(
  client: SupabaseClient,
  input: {
    actorId: string;
    targetId: string;
    confirmationEmail: string;
  },
): Promise<SuperAdminTransferResult> {
  if (input.actorId === input.targetId) {
    throw new Error("Choose another active user as the successor.");
  }

  const { data: target, error: targetError } = await client
    .from("profiles")
    .select("id,email,account_status")
    .eq("id", input.targetId)
    .maybeSingle();
  if (targetError) throw repositoryError("Could not read the selected successor", targetError);
  if (!target) throw new Error("The selected successor does not have an application membership.");
  if ((target.email as string).toLowerCase() !== input.confirmationEmail.trim().toLowerCase()) {
    throw new Error("Enter the successor's email exactly to confirm the transfer.");
  }
  if (target.account_status !== "active") {
    throw new Error("The selected successor must have an active account.");
  }

  const readiness = await invitationStatusForUser(client, input.targetId);
  if (readiness !== "ready") {
    throw new Error("The selected successor must confirm their email and sign in before transfer.");
  }

  const { data, error } = await client.rpc("transfer_super_admin", {
    p_actor_id: input.actorId,
    p_target_id: input.targetId,
  });
  if (error) throw repositoryError("Could not transfer super_admin", error);

  const rows = (data ?? []) as Row[];
  const previousRow = rows.find((row) => row.id === input.actorId);
  const targetRow = rows.find((row) => row.id === input.targetId);
  if (!previousRow || !targetRow) throw new Error("The transfer completed without returning both users.");

  return {
    previousSuperAdmin: toUserSummary(
      previousRow,
      await invitationStatusForUser(client, input.actorId),
    ),
    newSuperAdmin: toUserSummary(targetRow, readiness),
  };
}

export async function resendUserRecoveryEmail(
  client: SupabaseClient,
  input: { email: string; redirectTo: string },
): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(input.email, { redirectTo: input.redirectTo });
  if (error) throw new Error(`Could not send the recovery email: ${error.message}`);
}
