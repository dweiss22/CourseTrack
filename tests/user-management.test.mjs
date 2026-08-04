import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

// db/user-repository.ts imports ApplicationRole (type-only, erased) from
// lib/auth.ts, but lib/auth.ts's next/navigation import still makes a
// runtime import fail outside the Next.js/vinext runtime (see
// tests/auth-guards.test.mjs) -- verified via static contract checks
// instead, same as the rest of this repo's server-side test suite.

test("ordinary user creation never assigns super_admin, while admins remain limited to basic roles", async () => {
  const source = await readFile(new URL("db/user-repository.ts", root), "utf8");
  const start = source.indexOf("function assertActorCanAssignRole");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);
  assert.match(body, /targetRole === "super_admin"/);
  assert.match(body, /protected transfer workflow/i);
  assert.match(body, /targetRole === "accreditation" \|\| targetRole === "content"/);
  assert.match(body, /throw new Error/);
});

test("changeUserRoleOrStatus rejects self-service role/status changes", async () => {
  const source = await readFile(new URL("db/user-repository.ts", root), "utf8");
  const start = source.indexOf("export async function changeUserRoleOrStatus");
  const end = source.indexOf("\nexport async function resendUserRecoveryEmail", start);
  const body = source.slice(start, end);
  assert.match(body, /input\.targetId === input\.actorId/);
  assert.match(body, /cannot change your own role/i);
});

test("admins cannot modify a super_admin or another admin", async () => {
  const source = await readFile(new URL("db/user-repository.ts", root), "utf8");
  const start = source.indexOf("export async function changeUserRoleOrStatus");
  const end = source.indexOf("\nexport async function resendUserRecoveryEmail", start);
  const body = source.slice(start, end);
  assert.match(body, /actorRole === "admin"/);
  assert.match(body, /currentRole === "super_admin" \|\| input\.newRole === "super_admin"/);
  assert.match(body, /currentRole === "admin"/);
});

test("the super_admin holder can only change through the protected transfer workflow", async () => {
  const source = await readFile(new URL("db/user-repository.ts", root), "utf8");
  const start = source.indexOf("export async function changeUserRoleOrStatus");
  const end = source.indexOf("\nexport async function resendUserRecoveryEmail", start);
  const body = source.slice(start, end);
  assert.match(body, /currentRole === "super_admin" \|\| input\.newRole === "super_admin"/);
  assert.match(body, /protected transfer workflow/i);
});

test("createApplicationUserMembership normalizes email and validates role assignability before creating the Auth identity", async () => {
  const source = await readFile(new URL("db/user-repository.ts", root), "utf8");
  const start = source.indexOf("export async function createApplicationUserMembership");
  const inviteIndex = source.indexOf("inviteUserByEmail", start);
  const assignCheckIndex = source.indexOf("assertActorCanAssignRole", start);
  assert.ok(assignCheckIndex >= 0 && assignCheckIndex < inviteIndex, "role assignability must be checked before creating the Auth identity");
  const body = source.slice(start, inviteIndex);
  assert.match(body, /\.trim\(\)\.toLowerCase\(\)/);
});

test("resending a setup/reset email never creates a new user, only re-triggers Supabase's own email", async () => {
  const source = await readFile(new URL("db/user-repository.ts", root), "utf8");
  const start = source.indexOf("export async function resendUserRecoveryEmail");
  const body = source.slice(start);
  assert.match(body, /resetPasswordForEmail/);
  assert.doesNotMatch(body, /inviteUserByEmail|createUser\(/);
});

test("the database permits one super_admin and exposes only an atomic service-role transfer", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/202608040003_single_super_admin_transfer.sql", root),
    "utf8",
  );
  assert.match(migration, /protect_profile_role_changes/);
  assert.match(migration, /profiles_single_super_admin_idx/);
  assert.match(migration, /create or replace function public\.transfer_super_admin/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /email_confirmed_at, last_sign_in_at/);
  assert.match(migration, /before update or delete on public\.profiles/);
  assert.match(migration, /grant execute on function public\.transfer_super_admin\(uuid, uuid\) to service_role/);
  assert.match(migration, /super_admin\.transferred/);
});

test("the migration replaces the additive 6-role scaffold with the exclusive 4-role model", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/202608040002_role_based_auth.sql", root),
    "utf8",
  );
  assert.match(migration, /check \(role in \('super_admin', 'admin', 'accreditation', 'content'\)\)/);
  assert.match(migration, /check \(account_status in \('active', 'disabled'\)\)/);
  assert.match(migration, /drop table if exists public\.role_permissions/);
  assert.match(migration, /drop table if exists public\.user_roles/);
  assert.match(migration, /drop table if exists public\.roles/);
  assert.match(migration, /drop table if exists public\.permissions/);
  // has_permission()/has_permission_for_email() keep their exact names so
  // every existing RLS policy elsewhere in the schema keeps working.
  assert.match(migration, /create or replace function public\.has_permission\(required_permission text\)/);
  assert.match(migration, /create or replace function public\.has_permission_for_email\(p_email text, p_permission text\)/);
  assert.match(migration, /when email = 'coursetrack-import@system\.local' then 'disabled'/);
  assert.doesNotMatch(migration, /role = coalesce\(role, 'super_admin'\)/);
});

test("superadmin transfer is a dedicated, superadmin-only API", async () => {
  const source = await readFile(
    new URL("app/api/admin/users/transfer-superadmin/route.ts", root),
    "utf8",
  );
  assert.match(source, /requireApiSuperAdmin/);
  assert.match(source, /targetUserId/);
  assert.match(source, /confirmationEmail/);
  assert.match(source, /transferSuperAdminRole/);
});

test("public signup is not part of the user-provisioning path -- only admin/super_admin-initiated creation", async () => {
  const routeFiles = ["app/api/admin/users/route.ts"];
  const sources = await Promise.all(routeFiles.map((file) => readFile(new URL(file, root), "utf8")));
  for (const source of sources) {
    assert.match(source, /requireApiAdmin/);
  }
  // No public /signup route should exist.
  await assert.rejects(() => readFile(new URL("app/signup/page.tsx", root), "utf8"));
});
