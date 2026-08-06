import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  databaseProjectRef,
  maskedIdentity,
  resolveCopyOrder,
  sanitizeRow,
} from "../scripts/refresh-staging-from-production.mjs";

const root = new URL("../", import.meta.url);
const maskingKey = "test-masking-key-with-at-least-32-characters";

test("masked staging identities are deterministic and do not expose source data", () => {
  const first = maskedIdentity("865d4df0-7217-4768-b5a3-bd0f09e0e576", maskingKey);
  const second = maskedIdentity("865d4df0-7217-4768-b5a3-bd0f09e0e576", maskingKey);
  assert.deepEqual(first, second);
  assert.match(first.email, /^staging-user-[a-f0-9]{12}@staging\.invalid$/);
  assert.doesNotMatch(JSON.stringify(first), /dweiss|lexipol/i);
});

test("database project references are verified for direct and pooled Supabase URLs", () => {
  assert.equal(
    databaseProjectRef("postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres"),
    "abcdefghijklmnop",
  );
  assert.equal(
    databaseProjectRef("postgresql://postgres.abcdefghijklmnop:secret@aws-0-us.pooler.supabase.com:6543/postgres"),
    "abcdefghijklmnop",
  );
  assert.throws(
    () => databaseProjectRef("postgresql://user:secret@example.com/database"),
    /could not verify/i,
  );
});

test("profile sanitization preserves authorization but masks non-testers", () => {
  const source = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "person@example.com",
    first_name: "Real",
    last_name: "Person",
    display_name: "Real Person",
    job_title: "Director",
    department: "Operations",
    role: "admin",
    account_status: "active",
  };
  const sanitized = sanitizeRow("profiles", source, {
    maskingKey,
    testerEmails: new Set(),
    emailMap: new Map(),
  });
  assert.equal(sanitized.role, "admin");
  assert.equal(sanitized.account_status, "active");
  assert.equal(sanitized.first_name, "Staging");
  assert.equal(sanitized.job_title, null);
  assert.doesNotMatch(JSON.stringify(sanitized), /Real Person|Director|Operations|person@example\.com/);
});

test("approved staging tester profile details and UUID remain intact", () => {
  const source = {
    id: "865d4df0-7217-4768-b5a3-bd0f09e0e576",
    email: "dweiss@lexipol.com",
    display_name: "Devin Weiss",
    role: "super_admin",
    account_status: "active",
  };
  const sanitized = sanitizeRow("profiles", source, {
    maskingKey,
    testerEmails: new Set(["dweiss@lexipol.com"]),
    emailMap: new Map([["dweiss@lexipol.com", "dweiss@lexipol.com"]]),
  });
  assert.deepEqual(sanitized, source);
});

test("free-form content, raw payloads, and actor emails are redacted", () => {
  const note = sanitizeRow("notes", {
    id: "note-1",
    body: "Private note",
    raw_payload: { secret: true },
    created_by_email: "person@example.com",
  }, {
    maskingKey,
    testerEmails: new Set(),
    emailMap: new Map([["person@example.com", "staging-user-123@staging.invalid"]]),
  });
  assert.equal(note.body, "[Redacted in staging]");
  assert.deepEqual(note.raw_payload, {});
  assert.equal(note.created_by_email, "staging-user-123@staging.invalid");
});

test("copy order places referenced tables before dependent tables", () => {
  const order = resolveCopyOrder(
    ["course_flags", "profiles", "courses"],
    [
      { child_table: "course_flags", parent_table: "courses" },
      { child_table: "course_flags", parent_table: "profiles" },
      { child_table: "profiles", parent_table: "profiles" },
    ],
  );
  assert.ok(order.indexOf("profiles") < order.indexOf("course_flags"));
  assert.ok(order.indexOf("courses") < order.indexOf("course_flags"));
});

test("workflow is weekly, manual, staging-scoped, and has no production write key", async () => {
  const workflow = await readFile(new URL(".github/workflows/refresh-staging-data.yml", root), "utf8");
  assert.match(workflow, /cron: "0 8 \* \* 0"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /COURSETRACK_ENVIRONMENT: staging/);
  assert.match(workflow, /PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(workflow, /PRODUCTION_SUPABASE_SECRET_KEY|PRODUCTION_SERVICE_ROLE/);
});

test("refresh checks migration parity before replacing staging", async () => {
  const source = await readFile(new URL("scripts/refresh-staging-from-production.mjs", root), "utf8");
  assert.match(source, /supabase_migrations\.schema_migrations/);
  assert.match(source, /Production and staging migration versions differ/);
  assert.match(source, /select table_name, column_name, data_type, is_nullable\s+from information_schema\.columns/);
  assert.doesNotMatch(source, /select table_name, column_name, data_type, is_nullable, ordinal_position/);
  const mainBody = source.slice(source.indexOf("async function main"));
  assert.ok(mainBody.indexOf("sourceMigrations") < mainBody.indexOf("await replaceStagingData("));
});

test("application environment indicator is explicit and production-safe", async () => {
  const environmentSource = await readFile(new URL("lib/deployment-environment.ts", root), "utf8");
  const shellSource = await readFile(new URL("components/app-shell.tsx", root), "utf8");
  const layoutSource = await readFile(new URL("app/layout.tsx", root), "utf8");
  assert.match(environmentSource, /COURSETRACK_ENVIRONMENT/);
  assert.match(environmentSource, /VERCEL_TARGET_ENV/);
  assert.match(shellSource, /environment === "production"\) return null/);
  assert.match(shellSource, /refresh not recorded/);
  assert.match(layoutSource, /environmentTitlePrefix/);
});

test("snapshot-status migration is service-role only", async () => {
  const migration = await readFile(new URL("supabase/migrations/202608040005_staging_snapshot_status.sql", root), "utf8");
  assert.match(migration, /environment_snapshot_status/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete .* to service_role/);
});
