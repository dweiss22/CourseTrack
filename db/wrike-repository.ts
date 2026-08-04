import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/wrike-crypto";
import { assertValidWrikeApiHost, getTokenEncryptionKey, isValidWrikeHost } from "@/lib/wrike-env";
import { callWrikeApi, fetchAllWrikePages } from "@/lib/wrike-http-client";
import { syncApprovedWrikeFolders, type RawWrikeTask } from "@/lib/wrike-sync";
import { WRIKE_TASK_OPTIONAL_FIELDS } from "@/lib/integration-mappings";
import { isApprovedWrikeFolderId } from "@/lib/wrike-source-folders";

type Row = Record<string, unknown>;

function repositoryError(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${error.message}`);
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
): Promise<{ apiHost: string; accessToken: string } | null> {
  const { data, error } = await client
    .from("wrike_connection")
    .select("api_host,access_token_encrypted,status")
    .eq("connection_key", "default")
    .maybeSingle();
  if (error) throw repositoryError("Could not read the Wrike connection", error);
  if (!data || data.status !== "connected") return null;
  return {
    apiHost: data.api_host as string,
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
  errors: Array<{ folderId: string; folderName: string; error: string | null }>;
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

export async function runWrikeSync(client: SupabaseClient, triggeredBy: string, actorId: string | null = null): Promise<WrikeSyncRunSummary> {
  const connection = await getDecryptedConnection(client);
  if (!connection) throw new Error("Wrike is not connected.");

  const { data: runRow, error: insertError } = await client
    .from("wrike_sync_runs")
    .insert({ status: "running", triggered_by: triggeredBy })
    .select("id,started_at")
    .single();
  if (insertError) throw repositoryError("Could not start a Wrike sync run", insertError);
  const runId = runRow.id as string;

  const { data: folderRows, error: folderError } = await client
    .from("wrike_source_folders")
    .select("folder_id,name")
    .eq("enabled", true);
  if (folderError) throw repositoryError("Could not read approved Wrike folders", folderError);
  const unapprovedFolders = (folderRows ?? []).filter((row) => !isApprovedWrikeFolderId(String(row.folder_id)));
  if (unapprovedFolders.length > 0) throw new Error("Invalid Wrike folder configuration. Only the approved read-only folder allowlist may be synchronized.");
  const folders = (folderRows ?? []).map((row) => ({ id: row.folder_id as string, name: row.name as string }));

  const [contacts, folderIndex] = await Promise.all([
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
  const errors = result.folderResults
    .filter((f) => !f.ok)
    .map((f) => ({ folderId: f.folderId, folderName: f.folderName, error: f.error }));
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
  const { error: auditError } = await client.from("audit_logs").insert({ actor_id: actorId, actor_email: triggeredBy.startsWith("manual:") ? triggeredBy.slice(7).toLowerCase() : null, action: "wrike.synchronization.completed", record_type: "integration", record_id: "wrike", new_values: { runId, status, tasksUpserted: taskRows.length, foldersFailed }, source: "CourseTrack" });
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
      lastSyncedAt: row.last_synced_at as string,
      indexState: state,
    };
  });
  const total = Number(((data ?? [])[0] as Row | undefined)?.total_count ?? items.length);
  return { items, total, hasMore: total > page * pageSize, state };
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
  return searchLocalWrikeTasks(client, filters);
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

  const { data: indexed } = await client.from("wrike_tasks").select("project_ids,project_titles,assignee_names,due_date").eq("wrike_task_id", resolvedTask.id).maybeSingle();
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
  const saved = data as Row;

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
  const { data: indexed } = await client.from("wrike_tasks").select("project_titles,assignee_names,due_date").eq("wrike_task_id", task.id).maybeSingle();
  const { data, error } = await client.rpc("verify_version_wrike_link", {
    p_reference_id: input.referenceId,
    p_task: { id: task.id, title: task.title, permalink: task.permalink ?? null, status: task.status ?? null, projectTitle: indexed?.project_titles?.[0] ?? null, assigneeNames: indexed?.assignee_names ?? [], dueDate: indexed?.due_date ?? null },
    p_expected_updated_at: input.expectedUpdatedAt,
    p_actor_id: input.actorId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw repositoryError("Could not verify the Wrike Task Link", error);
  const saved = data as Row;

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
