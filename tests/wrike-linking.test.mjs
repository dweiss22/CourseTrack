import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const { assertValidWrikeApiHost, isValidWrikeHost } = await import("../lib/wrike-env.ts");
const { normalizeForMatch, buildWrikeTaskSearchQuery } = await import("../lib/wrike-matching.ts");

test("isValidWrikeHost accepts wrike.com and subdomains only", () => {
  assert.ok(isValidWrikeHost("wrike.com"));
  assert.ok(isValidWrikeHost("www.wrike.com"));
  assert.ok(isValidWrikeHost("app-us2.wrike.com"));
  assert.equal(isValidWrikeHost("wrike.com.evil.example"), false);
  assert.equal(isValidWrikeHost("notwrike.com"), false);
  assert.equal(isValidWrikeHost("evil.example.com"), false);
});

test("assertValidWrikeApiHost rejects non-https and non-Wrike hosts", () => {
  assert.throws(() => assertValidWrikeApiHost("http://www.wrike.com"), /https/i);
  assert.throws(() => assertValidWrikeApiHost("https://evil.example.com"), /wrike\.com/i);
  assert.throws(() => assertValidWrikeApiHost("not a url"), /valid https url/i);
});

test("assertValidWrikeApiHost accepts a valid Wrike host and strips a trailing slash", () => {
  assert.equal(assertValidWrikeApiHost("https://www.wrike.com/"), "https://www.wrike.com");
});

test("normalizeForMatch collapses whitespace, case, and common punctuation", () => {
  assert.equal(normalizeForMatch("  EMS-101:  Airway  Management "), "ems 101 airway management");
});

test("buildWrikeTaskSearchQuery prefers the exact course code over the title", () => {
  assert.equal(buildWrikeTaskSearchQuery({ courseCode: "EMS1-102035773", title: "Anything" }), "EMS1-102035773");
  assert.equal(buildWrikeTaskSearchQuery({ courseCode: "", title: "Airway Management" }), "Airway Management");
});

test("the migration enforces zero-or-one active Wrike link per version and per task", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/202608040001_wrike_task_sync.sql", root),
    "utf8",
  );
  assert.match(migration, /version_wrike_task_one_active_per_version_idx/);
  assert.match(migration, /version_wrike_task_one_active_per_task_idx/);
  assert.match(migration, /where unlinked_at is null/i);
});

test("unlinking a Wrike task never calls the Wrike HTTP client", async () => {
  const source = await readFile(new URL("db/wrike-repository.ts", root), "utf8");
  const start = source.indexOf("export async function unlinkCourseVersionWrikeTask");
  assert.ok(start >= 0, "unlinkCourseVersionWrikeTask should exist");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /callWrikeApi|fetchAllWrikePages/);
});

test("linking a Wrike task verifies it server-side before persisting", async () => {
  const source = await readFile(new URL("db/wrike-repository.ts", root), "utf8");
  const start = source.indexOf("export async function linkCourseVersionWrikeTask");
  const insertIndex = source.indexOf("version_wrike_task_references", start);
  const callIndex = source.indexOf("callWrikeApi", start);
  assert.ok(callIndex >= 0 && callIndex < insertIndex, "the Wrike task must be verified before the insert");
});
