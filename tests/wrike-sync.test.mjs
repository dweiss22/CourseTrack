import assert from "node:assert/strict";
import test from "node:test";
import "../scripts/register-aliases.mjs";

const { syncApprovedWrikeFolders, normalizeWrikeTask } = await import("../lib/wrike-sync.ts");

const FOLDERS = [
  { id: "FOLDER-A", name: "Fire [New]" },
  { id: "FOLDER-B", name: "EMS [New]" },
];

test("normalizeWrikeTask discards fields not tracked by the wrike_tasks schema", () => {
  const normalized = normalizeWrikeTask({
    id: "T-1",
    title: "Fire Task",
    status: "Active",
    extraneousField: "should not survive",
    permalink: "https://www.wrike.com/open.htm?id=1",
  });
  assert.deepEqual(Object.keys(normalized).sort(), [
    "customFields",
    "customStatusId",
    "dueDate",
    "parentIds",
    "permalink",
    "rawPayload",
    "responsibleIds",
    "status",
    "superParentIds",
    "title",
    "wrikeCompletedDate",
    "wrikeCreatedDate",
    "wrikeTaskId",
    "wrikeUpdatedDate",
  ]);
  assert.equal(normalized.wrikeTaskId, "T-1");
  // rawPayload is the one intentional exception — it retains the original shape.
  assert.equal(normalized.rawPayload.extraneousField, "should not survive");
});

test("a task seen in two folders is consolidated once, preserving both folder associations", async () => {
  const result = await syncApprovedWrikeFolders(FOLDERS, async (folderId) => [
    { id: "SHARED-1", title: "Shared task" },
    { id: `${folderId}-ONLY`, title: `Only in ${folderId}` },
  ]);

  assert.equal(result.tasks.length, 3);
  const shared = result.tasks.find((task) => task.wrikeTaskId === "SHARED-1");
  assert.deepEqual([...shared.folderIds].sort(), ["FOLDER-A", "FOLDER-B"]);
  assert.ok(result.allFoldersOk);
});

test("folder association order does not depend on which request resolves last", async () => {
  const result = await syncApprovedWrikeFolders(FOLDERS, async (folderId) => {
    // FOLDER-B resolves first despite being requested second.
    if (folderId === "FOLDER-A") await new Promise((resolve) => setTimeout(resolve, 20));
    return [{ id: "SHARED-1", title: "Shared task" }];
  });
  const shared = result.tasks.find((task) => task.wrikeTaskId === "SHARED-1");
  // Folder order is fixed by input order, not completion order.
  assert.deepEqual(shared.folderIds, ["FOLDER-A", "FOLDER-B"]);
});

test("one folder failing does not discard the other folder's successful results", async () => {
  const result = await syncApprovedWrikeFolders(FOLDERS, async (folderId) => {
    if (folderId === "FOLDER-B") throw new Error("Wrike returned 500 for this folder.");
    return [{ id: "OK-1", title: "Fine" }];
  });

  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].wrikeTaskId, "OK-1");
  assert.equal(result.allFoldersOk, false);
  const failed = result.folderResults.find((f) => f.folderId === "FOLDER-B");
  const succeeded = result.folderResults.find((f) => f.folderId === "FOLDER-A");
  assert.equal(failed.ok, false);
  assert.match(failed.error, /500/);
  assert.equal(succeeded.ok, true);
  assert.equal(succeeded.taskCount, 1);
});

test("folder results report zero tasks and no error when a folder returns nothing", async () => {
  const result = await syncApprovedWrikeFolders(FOLDERS, async () => []);
  assert.equal(result.tasks.length, 0);
  assert.ok(result.folderResults.every((f) => f.ok && f.taskCount === 0 && f.error === null));
});
