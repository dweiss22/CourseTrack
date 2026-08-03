import { mapWithConcurrency } from "@/lib/concurrency";
import { sanitizeErrorMessage } from "@/lib/wrike-http-client";

export interface RawWrikeTask {
  id: string;
  title: string;
  status?: string;
  customStatusId?: string;
  parentIds?: string[];
  superParentIds?: string[];
  responsibleIds?: string[];
  createdDate?: string;
  updatedDate?: string;
  completedDate?: string;
  permalink?: string;
  customFields?: Array<{ id: string; value: string }>;
}

export interface NormalizedWrikeTask {
  wrikeTaskId: string;
  title: string;
  status: string | null;
  customStatusId: string | null;
  responsibleIds: string[];
  parentIds: string[];
  superParentIds: string[];
  customFields: Array<{ id: string; value: string }>;
  permalink: string | null;
  wrikeCreatedDate: string | null;
  wrikeUpdatedDate: string | null;
  wrikeCompletedDate: string | null;
  rawPayload: RawWrikeTask;
  folderIds: string[];
}

export interface FolderSyncOutcome {
  folderId: string;
  folderName: string;
  ok: boolean;
  taskCount: number;
  error: string | null;
}

export interface SyncConsolidationResult {
  tasks: NormalizedWrikeTask[];
  folderResults: FolderSyncOutcome[];
  allFoldersOk: boolean;
}

/** Discards every Wrike field not tracked in the wrike_tasks column list. */
export function normalizeWrikeTask(raw: RawWrikeTask): Omit<NormalizedWrikeTask, "folderIds"> {
  return {
    wrikeTaskId: raw.id,
    title: raw.title,
    status: raw.status ?? null,
    customStatusId: raw.customStatusId ?? null,
    responsibleIds: raw.responsibleIds ?? [],
    parentIds: raw.parentIds ?? [],
    superParentIds: raw.superParentIds ?? [],
    customFields: raw.customFields ?? [],
    permalink: raw.permalink ?? null,
    wrikeCreatedDate: raw.createdDate ?? null,
    wrikeUpdatedDate: raw.updatedDate ?? null,
    wrikeCompletedDate: raw.completedDate ?? null,
    rawPayload: raw,
  };
}

const DEFAULT_CONCURRENCY = 4;

/**
 * Fetches every approved folder (bounded concurrency), consolidates the
 * results by Wrike task id, and preserves every approved folder a task was
 * seen in — regardless of which folder request happened to resolve last.
 * A single folder failure never discards another folder's results.
 */
export async function syncApprovedWrikeFolders(
  folders: Array<{ id: string; name: string }>,
  fetchFolderTasks: (folderId: string) => Promise<RawWrikeTask[]>,
  concurrencyLimit: number = DEFAULT_CONCURRENCY,
): Promise<SyncConsolidationResult> {
  const rawResults = await mapWithConcurrency(folders, concurrencyLimit, async (folder) => {
    try {
      const tasks = await fetchFolderTasks(folder.id);
      return { folderId: folder.id, folderName: folder.name, ok: true, taskCount: tasks.length, error: null, tasks };
    } catch (error) {
      return {
        folderId: folder.id,
        folderName: folder.name,
        ok: false,
        taskCount: 0,
        error: sanitizeErrorMessage(error instanceof Error ? error.message : "Unknown error syncing this folder."),
        tasks: [] as RawWrikeTask[],
      };
    }
  });

  // Iterate results in the fixed folder order (not completion order) so a
  // task's recorded folder associations never depend on network timing.
  const byTaskId = new Map<string, NormalizedWrikeTask>();
  for (const result of rawResults) {
    for (const raw of result.tasks) {
      const existing = byTaskId.get(raw.id);
      if (existing) {
        if (!existing.folderIds.includes(result.folderId)) {
          existing.folderIds.push(result.folderId);
        }
      } else {
        byTaskId.set(raw.id, { ...normalizeWrikeTask(raw), folderIds: [result.folderId] });
      }
    }
  }

  return {
    tasks: [...byTaskId.values()],
    folderResults: rawResults.map(({ folderId, folderName, ok, taskCount, error }) => ({
      folderId,
      folderName,
      ok,
      taskCount,
      error,
    })),
    allFoldersOk: rawResults.every((result) => result.ok),
  };
}
