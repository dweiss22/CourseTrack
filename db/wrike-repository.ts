import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/wrike-crypto";
import { assertValidWrikeApiHost, getTokenEncryptionKey, isValidWrikeHost } from "@/lib/wrike-env";
import { callWrikeApi, fetchAllWrikePages, sanitizeErrorMessage } from "@/lib/wrike-http-client";
import { syncApprovedWrikeFolders, type RawWrikeTask } from "@/lib/wrike-sync";
import { WRIKE_TASK_OPTIONAL_FIELDS } from "@/lib/integration-mappings";
import { isApprovedWrikeFolderId } from "@/lib/wrike-source-folders";
import { getCachedCustomFieldDefinitions } from "@/lib/wrike-custom-field-cache";
import {
  buildCustomFieldIndex,
  extractReportingYear,
  findCustomFieldValueById,
  normalizeWrikeCustomFieldDefinitions,
  resolveTaskCustomFields,
  type WrikeCustomFieldDefinition,
  type WrikeResolvedCustomField,
} from "@/lib/wrike-custom-fields";

type Row = Record<string, unknown>;

function repositoryError(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${error.message}`);
}

/** PostgreSQL unique_violation, surfaced by PostgREST as `code`. */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function mappedWrikePublishedDate(customFields: unknown): string | null {
  const fieldId = process.env.WRIKE_VERSION_PUBLISHED_DATE_FIELD_ID?.trim();
  if (!fieldId) return null;
  const value = findCustomFieldValueById(customFields, fieldId);
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Connection (singleton, permanent token)
// ---------------------------------------------------------------------------

export interface WrikeConnectionSummary {
  connected: boolean;
  apiHost: string | null;
  accountId: string | null;
  accountName: string | null;
  status: "connected" | "error" | "disconnected" | null;
  lastError: string | null;
  connectedByEmail: string | null;
  updatedAt: string | null;
}

function toConnectionSummary(row: Row | null): WrikeConnectionSummary {
  if (!row) {
    return {
      connected: false,
      apiHost: null,
      accountId: null,
      accountName: null,
      status: null,
      lastError: null,
      connectedByEmail: null,
      updatedAt: null,
    };
  }
  return {
    connected: row.status === "connected",
    apiHost: (row.api_host as string) ?? null,
    accountId: (row.account_id as string) ?? null,
    accountName: (row.account_name as string) ?? null,
    status: row.status as WrikeConnectionSummary["status"],
    lastError: (row.last_error as string) ?? null,
    connectedByEmail: (row.connected_by_email as string) ?? null,
    updatedAt: (row.updated_at as string) ?? null,
  };
}

export async function getWrikeConnectionSummary(client: SupabaseClient): Promise<WrikeConnectionSummary> {
  const { data, error } = await client
    .from("wrike_connection")
    .select("*")
    .eq("connection_key", "default")
    .maybeSingle();
  if (error) throw repositoryError("Could not read the Wrike connection", error);
  return toConnectionSummary(data as Row | null);
}

async function getDecryptedConnection(
  client: SupabaseClient,
): Promise<{ apiHost: string; accountId: string | null; accessToken: string } | null> {
  const { data, error } = await client
    .from("wrike_connection")
    .select("api_host,account_id,access_token_encrypted,status")
    .eq("connection_key", "default")
    .maybeSingle();
  if (error) throw repositoryError("Could not read the Wrike connection", error);
  if (!data || data.status !== "connected") return null;
  return {
    apiHost: data.api_host as string,
    accountId: (data.account_id as string) ?? null,
    accessToken: decryptSecret(data.access_token_encrypted as string, getTokenEncryptionKey()),
  };
}

interface WrikeAccountResponse {
  data: Array<{ id: string; name?: string }>;
}

export async function connectWrike(
  client: SupabaseClient,
  input: { token: string; apiHost: string; actorId: string; actorEmail: string },
): Promise<WrikeConnectionSummary> {
  const validatedHost = assertValidWrikeApiHost(input.apiHost);
  const account = await callWrikeApi<WrikeAccountResponse>({
    apiHost: validatedHost,
    accessToken: input.token,
    path: "/api/v4/account",
  });
  const accountRow = account.data?.[0];
  const encrypted = encryptSecret(input.token, getTokenEncryptionKey());

  const { error } = await client.from("wrike_connection").upsert(
    {
      connection_key: "default",
      api_host: validatedHost,
      access_token_encrypted: encrypted,
      account_id: accountRow?.id ?? null,
      account_name: accountRow?.name ?? null,
      status: "connected",
      last_error: null,
      connected_by_email: input.actorEmail,
    },
    { onConflict: "connection_key" },
  );
  if (error) throw repositoryError("Could not save the Wrike connection", error);
  const { error: auditError } = await client.from("audit_logs").insert({ actor_id: input.actorId, actor_email: input.actorEmail.toLowerCase(), action: "wrike.connection.connected", record_type: "integration", record_id: "wrike", new_values: { apiHost: validatedHost, accountId: accountRow?.id ?? null }, source: "CourseTrack" });
  if (auditError) throw repositoryError("Could not audit the Wrike connection", auditError);
  return getWrikeConnectionSummary(client);
}

export async function disconnectWrike(client: SupabaseClient, actorId: string, actorEmail: string): Promise<void> {
  const previous = await getWrikeConnectionSummary(client);
  const { error } = await client.from("wrike_connection").delete().eq("connection_key", "default");
  if (error) throw repositoryError("Could not disconnect Wrike", error);
  const { error: auditError } = await client.from("audit_logs").insert({ actor_id: actorId, actor_email: actorEmail.toLowerCase(), action: "wrike.connection.disconnected", record_type: "integration", record_id: "wrike", previous_values: previous, source: "CourseTrack" });
  if (auditError) throw repositoryError("Could not audit the Wrike disconnection", auditError);
}

export async function checkWrikeHealth(client: SupabaseClient): Promise<WrikeConnectionSummary> {
  const connection = await getDecryptedConnection(client);
  if (!connection) return getWrikeConnectionSummary(client);

  try {
    await callWrikeApi<WrikeAccountResponse>({
      apiHost: connection.apiHost,
      accessToken: connection.accessToken,
      path: "/api/v4/account",
    });
    await client
      .from("wrike_connection")
      .update({ status: "connected", last_error: null })
      .eq("connection_key", "default");
  } catch (error) {
    await client
      .from("wrike_connection")
      .update({
        status: "error",
        last_error: error instanceof Error ? error.message : "Wrike health check failed.",
      })
      .eq("connection_key", "default");
  }
  return getWrikeConnectionSummary(client);
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export interface WrikeSyncRunSummary {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "succeeded" | "partial" | "failed";
  triggeredBy: string;
  foldersAttempted: number;
  foldersSucceeded: number;
  foldersFailed: number;
  tasksSeen: number;
  tasksUpserted: number;
  tasksMarkedInactive: number;
  // folderId/folderName are null for run-scoped failures that belong to no
  // single folder -- a reclaimed abandoned run, or a custom-field catalogue
  // write that failed without stopping the task sync.
  errors: Array<{ folderId: string | null; folderName: string | null; error: string | null }>;
}

function toSyncRunSummary(row: Row): WrikeSyncRunSummary {
  return {
    id: row.id as string,
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string) ?? null,
    status: row.status as WrikeSyncRunSummary["status"],
    triggeredBy: row.triggered_by as string,
    foldersAttempted: Number(row.folders_attempted ?? 0),
    foldersSucceeded: Number(row.folders_succeeded ?? 0),
    foldersFailed: Number(row.folders_failed ?? 0),
    tasksSeen: Number(row.tasks_seen ?? 0),
    tasksUpserted: Number(row.tasks_upserted ?? 0),
    tasksMarkedInactive: Number(row.tasks_marked_inactive ?? 0),
    errors: (row.errors as WrikeSyncRunSummary["errors"]) ?? [],
  };
}

/**
 * A run still marked "running" after this long is abandoned -- the process that
 * started it died without recording an outcome. Reclaiming it matters because
 * searchWrikeTaskIndex refuses to return candidates while a run is in flight,
 * so a crashed sync would otherwise block task search indefinitely.
 */
const WRIKE_SYNC_RUN_ABANDONED_AFTER_MS = 60 * 60 * 1000;

/**
 * audit_logs.actor_email is NOT NULL, but a scheduled sync has no human actor.
 * A reserved .invalid address (RFC 2606) records the automated actor honestly
 * without implying a real mailbox, matching the placeholder-domain convention
 * in scripts/refresh-staging-from-production.mjs.
 *
 * Without this the cron path could not complete: the sync itself succeeded and
 * the run row was marked succeeded, then the audit insert violated the NOT NULL
 * constraint and the caller saw a failure for work that had actually finished.
 */
const SCHEDULED_ACTOR_EMAIL = "scheduled@coursetrack.invalid";

function auditActorEmail(triggeredBy: string): string {
  return triggeredBy.startsWith("manual:")
    ? triggeredBy.slice("manual:".length).toLowerCase()
    : SCHEDULED_ACTOR_EMAIL;
}

export async function runWrikeSync(client: SupabaseClient, triggeredBy: string, actorId: string | null = null): Promise<WrikeSyncRunSummary> {
  const connection = await getDecryptedConnection(client);
  if (!connection) throw new Error("Wrike is not connected.");

  // Scheduled delivery is best effort and can duplicate an invocation, and an
  // admin can always click "Run sync now". Two concurrent runs would race on
  // the same task rows, and the loser's stale view could wrongly mark live
  // tasks inactive -- so only one run at a time.
  //
  // Exclusion is enforced by the partial unique index added in
  // 202608120002, NOT by this read. Reading first only lets us reclaim
  // abandoned runs and report the common case with a clear message; the read
  // and the insert below cannot be atomic together, so the insert's unique
  // violation is the actual guarantee.
  const { data: activeRuns, error: activeError } = await client
    .from("wrike_sync_runs")
    .select("id,started_at")
    .eq("status", "running");
  if (activeError) throw repositoryError("Could not read Wrike sync runs", activeError);

  const abandonedCutoff = Date.now() - WRIKE_SYNC_RUN_ABANDONED_AFTER_MS;
  const abandoned: string[] = [];
  for (const run of (activeRuns ?? []) as Row[]) {
    const startedAt = Date.parse((run.started_at as string) ?? "");
    if (Number.isFinite(startedAt) && startedAt < abandonedCutoff) abandoned.push(run.id as string);
    else throw new Error("A Wrike synchronization is already running.");
  }
  if (abandoned.length > 0) {
    await client
      .from("wrike_sync_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        errors: [{ folderId: null, folderName: null, error: "Abandoned run reclaimed by a later synchronization." }],
      })
      .in("id", abandoned);
  }

  const { data: runRow, error: insertError } = await client
    .from("wrike_sync_runs")
    .insert({ status: "running", triggered_by: triggeredBy })
    .select("id,started_at")
    .single();
  if (insertError) {
    // 23505 is the partial unique index refusing a second in-flight run --
    // the atomic form of the check above, reported the same way.
    if (isUniqueViolation(insertError)) throw new Error("A Wrike synchronization is already running.");
    throw repositoryError("Could not start a Wrike sync run", insertError);
  }
  const runId = runRow.id as string;

  const { data: folderRows, error: folderError } = await client
    .from("wrike_source_folders")
    .select("folder_id,name")
    .eq("enabled", true);
  if (folderError) throw repositoryError("Could not read approved Wrike folders", folderError);
  const unapprovedFolders = (folderRows ?? []).filter((row) => !isApprovedWrikeFolderId(String(row.folder_id)));
  if (unapprovedFolders.length > 0) throw new Error("Invalid Wrike folder configuration. Only the approved read-only folder allowlist may be synchronized.");
  const folders = (folderRows ?? []).map((row) => ({ id: row.folder_id as string, name: row.name as string }));

  const [contacts, folderIndex, customFieldDefinitions] = await Promise.all([
    fetchAllWrikePages<{ id: string; firstName?: string; lastName?: string; profiles?: Array<{ email?: string }>; type?: string; deleted?: boolean }>({
      apiHost: connection.apiHost,
      accessToken: connection.accessToken,
      path: "/api/v4/contacts",
    }),
    folders.length > 0
      ? callWrikeApi<{ data: Array<{ id: string; title?: string; permalink?: string; project?: { status?: string } }> }>({
          apiHost: connection.apiHost,
          accessToken: connection.accessToken,
          path: `/api/v4/folders/${folders.map((folder) => encodeURIComponent(folder.id)).join(",")}`,
        }).then((response) => response.data)
      : Promise.resolve([]),
    // Custom-field definitions change rarely, so they ride along with the other
    // reference data instead of being fetched on the interactive search path.
    // Isolated deliberately: field titles are decoration, so losing them must
    // never fail a task sync. The previous catalogue simply stays in place, and
    // the staleness fallback in listWrikeCustomFieldDefinitions takes over if
    // the failure persists.
    callWrikeApi<{ kind: string; data: unknown[] }>({
      apiHost: connection.apiHost,
      accessToken: connection.accessToken,
      path: "/api/v4/customfields",
    })
      .then((response) => normalizeWrikeCustomFieldDefinitions(response))
      .catch(() => [] as WrikeCustomFieldDefinition[]),
  ]);

  const contactNameById = new Map(contacts.map((contact) => [
    contact.id,
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.profiles?.[0]?.email || contact.id,
  ]));
  const folderTitleById = new Map(folderIndex.map((folder) => [folder.id, folder.title ?? folders.find((item) => item.id === folder.id)?.name ?? folder.id]));

  if (contacts.length > 0) {
    const { error: contactError } = await client.from("wrike_contacts").upsert(contacts.map((contact) => ({
      contact_id: contact.id,
      display_name: contactNameById.get(contact.id),
      contact_type: contact.type ?? null,
      active: !contact.deleted,
      raw_payload: contact,
      last_synced_at: new Date().toISOString(),
    })), { onConflict: "contact_id" });
    if (contactError) throw repositoryError("Could not synchronize Wrike contacts", contactError);
  }
  if (folderIndex.length > 0) {
    const { error: folderIndexError } = await client.from("wrike_folder_index").upsert(folderIndex.map((folder) => ({
      folder_id: folder.id,
      title: folderTitleById.get(folder.id),
      permalink: folder.permalink ?? null,
      project_status: folder.project?.status ?? null,
      raw_payload: folder,
      last_synced_at: new Date().toISOString(),
    })), { onConflict: "folder_id" });
    if (folderIndexError) throw repositoryError("Could not synchronize Wrike folders", folderIndexError);
  }
  // Recorded on the run rather than thrown, so the failure stays visible in the
  // admin panel without aborting the task sync.
  let customFieldSyncError: string | null = null;
  if (customFieldDefinitions.length > 0) {
    const { error: customFieldError } = await client.from("wrike_custom_field_index").upsert(customFieldDefinitions.map((definition) => ({
      field_id: definition.id,
      title: definition.title,
      field_type: definition.type || null,
      raw_payload: definition,
      last_synced_at: new Date().toISOString(),
    })), { onConflict: "field_id" });
    // Deliberately not fatal, unlike the contact and folder writes above.
    // Field titles only decorate search results, and this runs before any
    // folder task is fetched -- throwing here would abandon the entire task
    // sync over optional metadata, and (since runWrikeSync has no try/catch)
    // strand its run row as "running" until the abandonment reclaim. The
    // previous catalogue stays in place and the staleness fallback in
    // listWrikeCustomFieldDefinitions covers a persistent failure.
    if (customFieldError) {
      customFieldSyncError = sanitizeErrorMessage(customFieldError.message);
    }
  }

  const result = await syncApprovedWrikeFolders(folders, async (folderId) =>
    fetchAllWrikePages<RawWrikeTask>({
      apiHost: connection.apiHost,
      accessToken: connection.accessToken,
      path: `/api/v4/folders/${encodeURIComponent(folderId)}/tasks`,
      searchParams: {
        descendants: "true",
        fields: JSON.stringify(WRIKE_TASK_OPTIONAL_FIELDS),
      },
    }),
  );

  const now = new Date().toISOString();
  for (const folderResult of result.folderResults) {
    await client
      .from("wrike_source_folders")
      .update({
        last_sync_at: now,
        last_sync_error: folderResult.error,
        last_sync_task_count: folderResult.taskCount,
      })
      .eq("folder_id", folderResult.folderId);
  }

  const taskRows = result.tasks.map((task) => ({
    wrike_task_id: task.wrikeTaskId,
    title: task.title,
    status: task.status,
    custom_status_id: task.customStatusId,
    responsible_ids: task.responsibleIds,
    parent_ids: task.parentIds,
    super_parent_ids: task.superParentIds,
    custom_fields: task.customFields,
    permalink: task.permalink,
    wrike_created_date: task.wrikeCreatedDate,
    wrike_updated_date: task.wrikeUpdatedDate,
    wrike_completed_date: task.wrikeCompletedDate,
    due_date: task.dueDate,
    assignee_names: task.responsibleIds.map((id) => contactNameById.get(id) ?? id),
    project_ids: task.folderIds,
    project_titles: task.folderIds.map((id) => folderTitleById.get(id) ?? folders.find((folder) => folder.id === id)?.name ?? id),
    search_text: [task.wrikeTaskId, task.title, ...task.folderIds.map((id) => folderTitleById.get(id) ?? "")].join(" ").toLowerCase(),
    raw_payload: task.rawPayload,
    is_active: true,
    last_synced_at: now,
  }));
  if (taskRows.length > 0) {
    const { error: upsertError } = await client
      .from("wrike_tasks")
      .upsert(taskRows, { onConflict: "wrike_task_id" });
    if (upsertError) throw repositoryError("Could not upsert synchronized Wrike tasks", upsertError);
  }

  const relationshipRows = result.tasks.flatMap((task) =>
    task.folderIds.map((folderId) => ({
      wrike_task_id: task.wrikeTaskId,
      folder_id: folderId,
      last_seen_at: now,
    })),
  );
  if (relationshipRows.length > 0) {
    const { error: relationshipError } = await client
      .from("wrike_task_source_folders")
      .upsert(relationshipRows, { onConflict: "wrike_task_id,folder_id" });
    if (relationshipError) throw repositoryError("Could not upsert Wrike task/folder relationships", relationshipError);
  }

  let tasksMarkedInactive = 0;
  // Only mark tasks inactive when every approved folder synced successfully —
  // a partial failure must never cause a false "stale" marking.
  if (result.allFoldersOk) {
    const seenIds = new Set(result.tasks.map((task) => task.wrikeTaskId));
    const { data: activeRows, error: activeError } = await client
      .from("wrike_tasks")
      .select("wrike_task_id")
      .eq("is_active", true);
    if (activeError) throw repositoryError("Could not read active Wrike tasks", activeError);
    const idsToDeactivate = (activeRows ?? [])
      .map((row) => row.wrike_task_id as string)
      .filter((id) => !seenIds.has(id));
    if (idsToDeactivate.length > 0) {
      const { error: deactivateError } = await client
        .from("wrike_tasks")
        .update({ is_active: false })
        .in("wrike_task_id", idsToDeactivate);
      if (deactivateError) throw repositoryError("Could not mark stale Wrike tasks inactive", deactivateError);
      tasksMarkedInactive = idsToDeactivate.length;
    }
  }

  const foldersSucceeded = result.folderResults.filter((f) => f.ok).length;
  const foldersFailed = result.folderResults.length - foldersSucceeded;
  const status: WrikeSyncRunSummary["status"] = result.allFoldersOk
    ? "succeeded"
    : foldersSucceeded > 0
      ? "partial"
      : "failed";
  const errors: WrikeSyncRunSummary["errors"] = result.folderResults
    .filter((f) => !f.ok)
    .map((f) => ({ folderId: f.folderId, folderName: f.folderName, error: f.error }));
  // A catalogue write failure does not change `status`: the task sync itself
  // succeeded, and only the decorative field titles are stale.
  if (customFieldSyncError) {
    errors.push({ folderId: null, folderName: "Custom field catalogue", error: customFieldSyncError });
  }
  const completedAt = new Date().toISOString();

  const { error: completeError } = await client
    .from("wrike_sync_runs")
    .update({
      completed_at: completedAt,
      status,
      folders_attempted: folders.length,
      folders_succeeded: foldersSucceeded,
      folders_failed: foldersFailed,
      tasks_seen: result.tasks.length,
      tasks_upserted: taskRows.length,
      tasks_marked_inactive: tasksMarkedInactive,
      errors,
    })
    .eq("id", runId);
  if (completeError) throw repositoryError("Could not record the Wrike sync result", completeError);
  const { error: auditError } = await client.from("audit_logs").insert({ actor_id: actorId, actor_email: auditActorEmail(triggeredBy), action: "wrike.synchronization.completed", record_type: "integration", record_id: "wrike", new_values: { runId, status, tasksUpserted: taskRows.length, foldersFailed }, source: "CourseTrack" });
  if (auditError) throw repositoryError("Could not audit the Wrike synchronization", auditError);

  return {
    id: runId,
    startedAt: runRow.started_at as string,
    completedAt,
    status,
    triggeredBy,
    foldersAttempted: folders.length,
    foldersSucceeded,
    foldersFailed,
    tasksSeen: result.tasks.length,
    tasksUpserted: taskRows.length,
    tasksMarkedInactive,
    errors,
  };
}

export interface WrikeSourceFolderStatus {
  folderId: string;
  name: string;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastSyncTaskCount: number | null;
}

export interface WrikeSyncStatus {
  lastRun: WrikeSyncRunSummary | null;
  isRunning: boolean;
  folders: WrikeSourceFolderStatus[];
}

export async function getWrikeSyncStatus(client: SupabaseClient): Promise<WrikeSyncStatus> {
  const [lastRunResult, runningResult, folderResult] = await Promise.all([
    client.from("wrike_sync_runs").select("*").order("started_at", { ascending: false }).limit(1),
    client.from("wrike_sync_runs").select("id").eq("status", "running").limit(1),
    client.from("wrike_source_folders").select("*").order("name"),
  ]);
  if (lastRunResult.error) throw repositoryError("Could not read the last Wrike sync run", lastRunResult.error);
  if (runningResult.error) throw repositoryError("Could not check for a running Wrike sync", runningResult.error);
  if (folderResult.error) throw repositoryError("Could not read Wrike source folders", folderResult.error);

  return {
    lastRun: lastRunResult.data?.[0] ? toSyncRunSummary(lastRunResult.data[0] as Row) : null,
    isRunning: (runningResult.data?.length ?? 0) > 0,
    folders: (folderResult.data ?? []).map((row) => ({
      folderId: row.folder_id as string,
      name: row.name as string,
      enabled: Boolean(row.enabled),
      lastSyncAt: (row.last_sync_at as string) ?? null,
      lastSyncError: (row.last_sync_error as string) ?? null,
      lastSyncTaskCount: row.last_sync_task_count === null ? null : Number(row.last_sync_task_count),
    })),
  };
}

// ---------------------------------------------------------------------------
// Local task search (never triggers a sync)
// ---------------------------------------------------------------------------

export interface WrikeTaskSearchFilters {
  query?: string;
  sourceFolderId?: string;
  customStatusId?: string;
  responsibleId?: string;
  updatedAfter?: string;
  page?: number;
  pageSize?: number;
}

export interface WrikeTaskCandidate {
  wrikeTaskId: string;
  title: string;
  status: string | null;
  permalink: string | null;
  wrikeUpdatedDate: string | null;
  sourceFolders: Array<{ folderId: string; folderName: string }>;
  projectTitles: string[];
  assigneeNames: string[];
  dueDate: string | null;
  /** Four-digit year, or null when absent/blank/unparseable. Never a raw value. */
  reportingYear: string | null;
  /** Only fields whose id resolved to a human-readable title with a usable value. */
  customFields: WrikeResolvedCustomField[];
  lastSyncedAt: string;
  indexState: WrikeConnectorState;
}

export type WrikeConnectorState =
  | { status: "disconnected"; message: string }
  | { status: "never_synchronized"; message: string }
  | { status: "synchronization_running"; message: string }
  | { status: "ready"; message: string }
  | { status: "permission_denied"; message: string }
  | { status: "provider_failure"; message: string };

export interface WrikeTaskSearchResult {
  items: WrikeTaskCandidate[];
  total: number;
  hasMore: boolean;
  state: WrikeConnectorState;
}

export async function searchLocalWrikeTasks(
  client: SupabaseClient,
  filters: WrikeTaskSearchFilters,
): Promise<WrikeTaskSearchResult> {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 10, 1), 25);
  const page = Math.max(filters.page ?? 1, 1);
  const from = (page - 1) * pageSize;
  const { data, error } = await client.rpc("search_wrike_task_candidates", {
    p_query: filters.query ?? "",
    p_limit: pageSize,
    p_offset: from,
  });
  if (error) throw repositoryError("Could not search the synchronized Wrike task index", error);
  const state: WrikeConnectorState = { status: "ready", message: "Synchronized Wrike task index is ready." };
  const items = ((data ?? []) as Row[]).map((row) => {
    const projectIds = (row.project_ids as string[]) ?? [];
    const projectTitles = (row.project_titles as string[]) ?? [];
    return {
      wrikeTaskId: row.wrike_task_id as string,
      title: row.title as string,
      status: (row.status as string) ?? null,
      permalink: (row.permalink as string) ?? null,
      wrikeUpdatedDate: null,
      sourceFolders: projectIds.map((folderId, index) => ({ folderId, folderName: projectTitles[index] ?? folderId })),
      projectTitles,
      assigneeNames: (row.assignee_names as string[]) ?? [],
      dueDate: (row.due_date as string) ?? null,
      // Defaults only. The search RPC does not return custom_fields; they are
      // attached by enrichWrikeCandidatesWithCustomFields so this stays a pure
      // index reader.
      reportingYear: null,
      customFields: [] as WrikeResolvedCustomField[],
      lastSyncedAt: row.last_synced_at as string,
      indexState: state,
    };
  });
  const total = Number(((data ?? [])[0] as Row | undefined)?.total_count ?? items.length);
  return { items, total, hasMore: total > page * pageSize, state };
}

/**
 * How long the locally synchronized catalogue is trusted without a fresh sync.
 *
 * The schedule is weekly (.github/workflows/wrike-sync.yml), so this must clear
 * a full cycle with room to spare -- a threshold at or near 7 days would sit on
 * the boundary and send almost every search down the live fallback. Two missed
 * cycles means the schedule has genuinely stopped.
 */
const CUSTOM_FIELD_INDEX_STALE_AFTER_MS = 16 * 24 * 60 * 60 * 1000;

/** Reads the locally synchronized catalogue written by the scheduled sync. */
async function readWrikeCustomFieldIndex(
  client: SupabaseClient,
): Promise<{ definitions: WrikeCustomFieldDefinition[]; lastSyncedAt: string | null }> {
  const { data, error } = await client
    .from("wrike_custom_field_index")
    .select("field_id,title,field_type,last_synced_at");
  if (error) throw repositoryError("Could not read the Wrike custom-field index", error);

  const rows = (data ?? []) as Row[];
  const definitions = normalizeWrikeCustomFieldDefinitions(
    rows.map((row) => ({ id: row.field_id, title: row.title, type: row.field_type ?? "" })),
  );
  const lastSyncedAt = rows.reduce<string | null>((latest, row) => {
    const value = (row.last_synced_at as string) ?? null;
    return value && (!latest || value > latest) ? value : latest;
  }, null);
  return { definitions, lastSyncedAt };
}

/**
 * Fetches the account-level Wrike custom-field catalogue live.
 *
 * The host comes from the stored connection, which was validated through
 * assertValidWrikeApiHost before it was saved -- no default host is hardcoded
 * here, because Wrike accounts can live on different API hosts. The token stays
 * server-side; only normalized {id, title, type} records ever leave here.
 *
 * Results are cached per account (see lib/wrike-custom-field-cache.ts). Retries
 * are disabled and the request is time-boxed because this can run inline with
 * an interactive search: a slow catalogue must not become a slow search.
 */
async function fetchWrikeCustomFieldDefinitions(
  client: SupabaseClient,
  options: { strict?: boolean } = {},
): Promise<WrikeCustomFieldDefinition[]> {
  const connection = await getDecryptedConnection(client);
  if (!connection) {
    if (options.strict) throw new Error("Wrike is not connected.");
    return [];
  }
  const load = async () => {
      // No searchParams: the catalogue is a few dozen records and is cached, so
      // filtering saves nothing while every extra parameter is another way for
      // Wrike to reject the request and blank out all field titles at once.
      // WorkItem compatibility is enforced downstream by the renderable-type
      // safelist; add applicableEntityTypes=["WorkItem"] here if it ever needs
      // trimming at the source.
      const payload = await callWrikeApi<{ kind: string; data: unknown[] }>({
        apiHost: connection.apiHost,
        accessToken: connection.accessToken,
        path: "/api/v4/customfields",
        maxRetries: 0,
        timeoutMs: 4_000,
      });
      return normalizeWrikeCustomFieldDefinitions(payload);
  };

  // The cache never rejects -- a provider failure becomes an empty list so a
  // task search is never blocked by Wrike. That is wrong for a caller whose
  // whole purpose is to report the catalogue: an outage would be
  // indistinguishable from an account with no custom fields. Strict callers
  // therefore bypass the swallow and let the failure propagate.
  if (options.strict) return load();
  return getCachedCustomFieldDefinitions(`${connection.apiHost}|${connection.accountId ?? ""}`, load);
}

/**
 * Resolves the custom-field catalogue, preferring the locally synchronized copy.
 *
 * The scheduled sync refreshes public.wrike_custom_field_index alongside
 * contacts and folders, so the common path costs one indexed read and zero
 * Wrike requests -- consistent across every serverless instance, and unaffected
 * by a Wrike outage.
 *
 * The live fetch is only a fallback, for the window before the first sync after
 * this feature ships and for the case where the sync has stopped running. A
 * stale local copy still beats no field names, so it is preferred over an empty
 * live result.
 */
export async function listWrikeCustomFieldDefinitions(
  client: SupabaseClient,
  options: { strict?: boolean } = {},
): Promise<WrikeCustomFieldDefinition[]> {
  const indexed = await readWrikeCustomFieldIndex(client);
  const isFresh =
    indexed.lastSyncedAt !== null &&
    Date.now() - Date.parse(indexed.lastSyncedAt) < CUSTOM_FIELD_INDEX_STALE_AFTER_MS;
  if (indexed.definitions.length > 0 && isFresh) return indexed.definitions;

  // Strict callers must be able to tell "Wrike is unreachable" from "this
  // account has no custom fields", so a provider failure is reported rather
  // than degraded into an empty list.
  if (options.strict) {
    const live = await fetchWrikeCustomFieldDefinitions(client, { strict: true });
    return live.length > 0 ? live : indexed.definitions;
  }

  const live = await fetchWrikeCustomFieldDefinitions(client);
  return live.length > 0 ? live : indexed.definitions;
}

/**
 * Decorates locally indexed candidates with resolved custom fields.
 *
 * The synchronized index remains the source of truth for which tasks match a
 * search; the Wrike catalogue only supplies titles. Both reads are individually
 * isolated, so a Wrike outage or a database hiccup degrades the extra metadata
 * without failing the search. When WRIKE_REPORTING_YEAR_FIELD_ID is configured
 * the Reporting Year resolves from the already-synchronized jsonb and needs no
 * Wrike call at all.
 */
async function enrichWrikeCandidatesWithCustomFields(
  client: SupabaseClient,
  items: WrikeTaskCandidate[],
): Promise<WrikeTaskCandidate[]> {
  if (items.length === 0) return items;

  const [rawByTaskId, definitions] = await Promise.all([
    (async () => {
      const map = new Map<string, unknown>();
      try {
        const { data, error } = await client
          .from("wrike_tasks")
          .select("wrike_task_id,custom_fields")
          .in("wrike_task_id", items.map((item) => item.wrikeTaskId));
        if (error) return map;
        for (const row of (data ?? []) as Row[]) {
          map.set(row.wrike_task_id as string, row.custom_fields);
        }
      } catch {
        // Decoration only -- fall through with an empty map.
      }
      return map;
    })(),
    (async () => {
      try {
        return await listWrikeCustomFieldDefinitions(client);
      } catch {
        return [] as WrikeCustomFieldDefinition[];
      }
    })(),
  ]);

  const index = buildCustomFieldIndex(definitions);
  const configuredFieldId = process.env.WRIKE_REPORTING_YEAR_FIELD_ID?.trim() ?? "";
  return items.map((item) => {
    const raw = rawByTaskId.get(item.wrikeTaskId);
    if (raw === undefined) return item;
    return {
      ...item,
      reportingYear: extractReportingYear({ raw, index, configuredFieldId }),
      customFields: resolveTaskCustomFields(index, raw),
    };
  });
}

export async function searchWrikeTaskIndex(client: SupabaseClient, filters: WrikeTaskSearchFilters): Promise<WrikeTaskSearchResult> {
  const [connection, sync] = await Promise.all([getWrikeConnectionSummary(client), getWrikeSyncStatus(client)]);
  if (!connection.connected) {
    const state: WrikeConnectorState = { status: "disconnected", message: "Wrike is not connected." };
    return { items: [], total: 0, hasMore: false, state };
  }
  if (sync.isRunning) {
    const state: WrikeConnectorState = { status: "synchronization_running", message: "Wrike synchronization is running." };
    return { items: [], total: 0, hasMore: false, state };
  }
  if (!sync.lastRun) {
    const state: WrikeConnectorState = { status: "never_synchronized", message: "Wrike is connected but has never been synchronized." };
    return { items: [], total: 0, hasMore: false, state };
  }
  if (sync.lastRun.status === "failed") {
    const state: WrikeConnectorState = { status: "provider_failure", message: "The latest Wrike synchronization failed." };
    return { items: [], total: 0, hasMore: false, state };
  }
  const result = await searchLocalWrikeTasks(client, filters);
  return { ...result, items: await enrichWrikeCandidatesWithCustomFields(client, result.items) };
}

export async function getCourseVersionSearchContext(
  client: SupabaseClient,
  courseVersionId: string,
): Promise<{ courseCode: string; title: string; versionNumber: string } | null> {
  const { data, error } = await client
    .from("course_versions")
    .select("version_number,courses(course_code,title)")
    .eq("id", courseVersionId)
    .maybeSingle();
  if (error) throw repositoryError("Could not read the course version", error);
  const course = data?.courses as { course_code?: string; title?: string } | null;
  if (!data || !course) return null;
  return {
    courseCode: course.course_code ?? "",
    title: course.title ?? "",
    versionNumber: data.version_number as string,
  };
}

// ---------------------------------------------------------------------------
// Course-version linking (link / verify / unlink)
// ---------------------------------------------------------------------------

interface WrikeTaskDetailResponse {
  data: Array<{ id: string; title: string; permalink?: string; status?: string; responsibleIds?: string[]; parentIds?: string[]; dates?: { due?: string } }>;
}

export interface WrikeVersionLink {
  id: string;
  wrikeTaskId: string;
  taskTitle: string;
  permalink: string | null;
  taskStatus: string | null;
  projectTitle: string | null;
  assigneeNames: string[];
  dueDate: string | null;
  updatedAt: string;
  wrikePublishedDate: string | null;
}

export async function linkCourseVersionWrikeTask(
  client: SupabaseClient,
  input: {
    courseVersionId: string;
    permalink?: string;
    candidateTaskId?: string;
    expectedUpdatedAt?: string;
    actorId: string;
    actorEmail: string;
  },
): Promise<WrikeVersionLink> {
  const connection = await getDecryptedConnection(client);
  if (!connection) throw new Error("Wrike is not connected.");

  const { data: versionRow, error: versionError } = await client
    .from("course_versions")
    .select("id")
    .eq("id", input.courseVersionId)
    .maybeSingle();
  if (versionError) throw repositoryError("Could not read the course version", versionError);
  if (!versionRow) throw new Error("Course version not found.");

  let resolvedTask: { id: string; title: string; permalink: string | null; status: string | null };

  if (input.permalink) {
    let parsed: URL;
    try {
      parsed = new URL(input.permalink);
    } catch {
      throw new Error("Enter a valid Wrike task URL.");
    }
    if (parsed.protocol !== "https:" || !isValidWrikeHost(parsed.hostname)) {
      throw new Error("Only https://wrike.com (or a wrike.com subdomain) task links are accepted.");
    }
    const result = await callWrikeApi<WrikeTaskDetailResponse>({
      apiHost: connection.apiHost,
      accessToken: connection.accessToken,
      path: "/api/v4/tasks",
      searchParams: { permalink: input.permalink },
    });
    if (result.data.length === 0) {
      throw new Error("That Wrike task was not found, or is not accessible to the connected account.");
    }
    if (result.data.length > 1) {
      throw new Error("That link matched more than one Wrike task. Link the exact task instead.");
    }
    resolvedTask = { ...result.data[0], permalink: result.data[0].permalink ?? null, status: result.data[0].status ?? null };
  } else if (input.candidateTaskId) {
    const result = await callWrikeApi<WrikeTaskDetailResponse>({
      apiHost: connection.apiHost,
      accessToken: connection.accessToken,
      path: `/api/v4/tasks/${encodeURIComponent(input.candidateTaskId)}`,
    });
    if (result.data.length === 0) {
      throw new Error("The selected Wrike task is no longer accessible.");
    }
    resolvedTask = { ...result.data[0], permalink: result.data[0].permalink ?? null, status: result.data[0].status ?? null };
  } else {
    throw new Error("Provide either a Wrike permalink or a selected candidate task id.");
  }

  const { data: indexed } = await client.from("wrike_tasks").select("project_ids,project_titles,assignee_names,due_date,custom_fields").eq("wrike_task_id", resolvedTask.id).maybeSingle();
  const { data, error } = await client.rpc("save_version_wrike_link", {
    p_course_version_id: input.courseVersionId,
    p_task: {
      id: resolvedTask.id, title: resolvedTask.title, permalink: resolvedTask.permalink,
      status: resolvedTask.status, projectId: indexed?.project_ids?.[0] ?? null,
      projectTitle: indexed?.project_titles?.[0] ?? null,
      assigneeNames: indexed?.assignee_names ?? [], dueDate: indexed?.due_date ?? null,
    },
    p_link_method: input.permalink ? "manual_permalink" : "selected_candidate",
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_actor_id: input.actorId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw repositoryError("Could not save the Wrike Task Link", error);
  let saved = data as Row;
  const wrikePublishedDate = mappedWrikePublishedDate(indexed?.custom_fields);
  if (wrikePublishedDate) {
    const { data: dated, error: dateError } = await client.from("version_wrike_task_references").update({ wrike_published_date: wrikePublishedDate }).eq("id", saved.id).select("*").single();
    if (dateError) throw repositoryError("Could not save the mapped Wrike publication date", dateError);
    saved = dated as Row;
  }

  return {
    id: saved.id as string,
    wrikeTaskId: saved.external_task_id as string,
    taskTitle: saved.task_title as string,
    permalink: (saved.permalink as string) ?? null,
    taskStatus: (saved.task_status as string) ?? null,
    projectTitle: (saved.project_title as string) ?? null,
    assigneeNames: (saved.assignee_names as string[]) ?? [],
    dueDate: (saved.due_date as string) ?? null,
    updatedAt: saved.updated_at as string,
    wrikePublishedDate: (saved.wrike_published_date as string) ?? null,
  };
}

export async function verifyCourseVersionWrikeTask(
  client: SupabaseClient,
  input: { referenceId: string; expectedUpdatedAt: string; actorId: string; actorEmail: string },
): Promise<WrikeVersionLink & { lastVerifiedAt: string }> {
  const connection = await getDecryptedConnection(client);
  if (!connection) throw new Error("Wrike is not connected.");

  const { data: refRow, error: refError } = await client
    .from("version_wrike_task_references")
    .select("id,external_task_id")
    .eq("id", input.referenceId)
    .is("unlinked_at", null)
    .maybeSingle();
  if (refError) throw repositoryError("Could not read the Wrike link", refError);
  if (!refRow) throw new Error("Active Wrike link not found.");

  const result = await callWrikeApi<WrikeTaskDetailResponse>({
    apiHost: connection.apiHost,
    accessToken: connection.accessToken,
    path: `/api/v4/tasks/${encodeURIComponent(refRow.external_task_id as string)}`,
  });
  if (result.data.length === 0) {
    throw new Error("This Wrike task is no longer accessible to the connected account.");
  }
  const task = result.data[0];
  const { data: indexed } = await client.from("wrike_tasks").select("project_titles,assignee_names,due_date,custom_fields").eq("wrike_task_id", task.id).maybeSingle();
  const { data, error } = await client.rpc("verify_version_wrike_link", {
    p_reference_id: input.referenceId,
    p_task: { id: task.id, title: task.title, permalink: task.permalink ?? null, status: task.status ?? null, projectTitle: indexed?.project_titles?.[0] ?? null, assigneeNames: indexed?.assignee_names ?? [], dueDate: indexed?.due_date ?? null },
    p_expected_updated_at: input.expectedUpdatedAt,
    p_actor_id: input.actorId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw repositoryError("Could not verify the Wrike Task Link", error);
  let saved = data as Row;
  const wrikePublishedDate = mappedWrikePublishedDate(indexed?.custom_fields);
  if (wrikePublishedDate) {
    const { data: dated, error: dateError } = await client.from("version_wrike_task_references").update({ wrike_published_date: wrikePublishedDate }).eq("id", saved.id).select("*").single();
    if (dateError) throw repositoryError("Could not save the mapped Wrike publication date", dateError);
    saved = dated as Row;
  }

  return {
    id: saved.id as string,
    wrikeTaskId: saved.external_task_id as string,
    taskTitle: saved.task_title as string,
    permalink: (saved.permalink as string) ?? null,
    taskStatus: (saved.task_status as string) ?? null,
    projectTitle: (saved.project_title as string) ?? null,
    assigneeNames: (saved.assignee_names as string[]) ?? [],
    dueDate: (saved.due_date as string) ?? null,
    updatedAt: saved.updated_at as string,
    lastVerifiedAt: saved.last_verified_at as string,
    wrikePublishedDate: (saved.wrike_published_date as string) ?? null,
  };
}

export async function unlinkCourseVersionWrikeTask(
  client: SupabaseClient,
  input: { referenceId: string; expectedUpdatedAt: string; actorId: string; actorEmail: string },
): Promise<boolean> {
  const { data, error } = await client.rpc("unlink_version_wrike_link", {
    p_reference_id: input.referenceId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_actor_id: input.actorId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw repositoryError("Could not unlink the Wrike Task Link", error);
  return data === true;
}
