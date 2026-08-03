import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

// db/user-repository.ts imports ApplicationRole (type-only, erased) from
// lib/auth.ts, but lib/auth.ts's next/navigation import still makes a
// runtime import fail outside the Next.js/vinext runtime (see
// tests/auth-guards.test.mjs) -- verified via static contract checks
// instead, same as the rest of this repo's server-side test suite.

test("admins may only assign the accreditation or content role, never super_admin or admin", async () => {
  const source = await readFile(new URL("db/user-repository.ts", root), "utf8");
  const start = source.indexOf("function assertActorCanAssignRole");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);
  assert.match(body, /actorRole === "super_admin"/);
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
  assert.match(body, /currentRole === "super_admin" \|\| currentRole === "admin"/);
});

test("the last active super_admin cannot be demoted, disabled, or removed (app-layer check)", async () => {
  const source = await readFile(new URL("db/user-repository.ts", root), "utf8");
  const start = source.indexOf("export async function changeUserRoleOrStatus");
  const end = source.indexOf("\nexport async function resendUserRecoveryEmail", start);
  const body = source.slice(start, end);
  assert.match(body, /wouldRemoveSuperAdmin/);
  assert.match(body, /eq\("role", "super_admin"\)/);
  assert.match(body, /eq\("account_status", "active"\)/);
  assert.match(body, /neq\("id", input\.targetId\)/);
  assert.match(body, /last active super_admin/i);
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

test("the migration protects the last active super_admin at the database boundary regardless of caller", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/202608040002_role_based_auth.sql", root),
    "utf8",
  );
  assert.match(migration, /protect_profile_role_changes/);
  assert.match(migration, /auth\.uid\(\) is not null and auth\.uid\(\) = old\.id/);
  assert.match(migration, /Cannot remove, disable, or demote the last active super_admin/i);
  assert.match(migration, /before update on public\.profiles/);
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
