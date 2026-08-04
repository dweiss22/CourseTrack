import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("the dashboard greeting uses the authenticated profile instead of a hardcoded person", async () => {
  const dashboard = await readFile(new URL("components/dashboard/dashboard.tsx", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(dashboard, /Welcome, \{firstName\}/);
  assert.doesNotMatch(dashboard, /Dana/);
  assert.match(page, /context\.firstName/);
});

test("authenticated profile context includes user-managed identity details", async () => {
  const auth = await readFile(new URL("lib/auth.ts", root), "utf8");
  assert.match(auth, /first_name,last_name,display_name,job_title,department,timezone/);
  for (const field of ["firstName", "lastName", "displayName", "jobTitle", "department", "timezone"]) {
    assert.match(auth, new RegExp(`${field}:`));
  }
});

test("profile updates cannot accept authorization fields", async () => {
  const route = await readFile(new URL("app/api/profile/route.ts", root), "utf8");
  const repository = await readFile(new URL("db/user-repository.ts", root), "utf8");
  for (const field of ["firstName", "lastName", "displayName", "jobTitle", "department", "timezone"]) {
    assert.match(route, new RegExp(`${field}:`));
  }
  const updateStart = repository.indexOf("export async function updateOwnProfile");
  const updateEnd = repository.indexOf("\nexport interface ApplicationUserSummary", updateStart);
  const updateBody = repository.slice(updateStart, updateEnd);
  assert.doesNotMatch(updateBody, /role:|account_status:|email:/);
});

test("rich profile migration corrects Devin's identity without broad matching", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/202608040004_rich_user_profiles.sql", root),
    "utf8",
  );
  assert.match(migration, /add column if not exists first_name text/);
  assert.match(migration, /display_name = 'Devin Weiss'/);
  assert.match(migration, /id = '865d4df0-7217-4768-b5a3-bd0f09e0e576'/);
  assert.match(migration, /lower\(email\) = 'dweiss@lexipol\.com'/);
});
