import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const { WRIKE_SOURCE_FOLDERS, isApprovedWrikeFolderId } = await import("../lib/wrike-source-folders.ts");

const APPROVED_IDS = [
  "IEACHQK7I4UOEPFL",
  "IEACHQK7I4PGHAIF",
  "IEACHQK7I4QUZOFS",
  "IEACHQK7I45QZU3G",
  "IEACHQK7I4PGHAD7",
  "IEACHQK7I4SCO46Z",
  "IEACHQK7I4PGHBAC",
  "IEACHQK7I4N7GGRM",
  "IEACHQK7I4PGHACI",
  "IEACHQK7I4N7GGQ4",
  "IEACHQK7I4PGG7Z2",
  "IEACHQK7I4SCPAAB",
  "IEACHQK7I4N7GGRB",
];

test("exactly the approved 13 folder ids are present, no others", () => {
  assert.equal(WRIKE_SOURCE_FOLDERS.length, 13);
  const ids = WRIKE_SOURCE_FOLDERS.map((folder) => folder.id);
  assert.deepEqual([...ids].sort(), [...APPROVED_IDS].sort());
});

test("isApprovedWrikeFolderId only accepts approved ids", () => {
  for (const id of APPROVED_IDS) {
    assert.ok(isApprovedWrikeFolderId(id));
  }
  assert.equal(isApprovedWrikeFolderId("SOME-DO-NOT-USE-FOLDER"), false);
  assert.equal(isApprovedWrikeFolderId("JIRA-TICKETS-FOLDER"), false);
  assert.equal(isApprovedWrikeFolderId("BLUEPRINTS-FOLDER"), false);
});

test("the migration seeds exactly the same approved folder ids", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/202608040001_wrike_task_sync.sql", root),
    "utf8",
  );
  for (const id of APPROVED_IDS) {
    assert.match(migration, new RegExp(id));
  }
});
