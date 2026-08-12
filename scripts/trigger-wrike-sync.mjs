#!/usr/bin/env node
import { pathToFileURL } from "node:url";

/**
 * Triggers the scheduled Wrike synchronization against a deployed environment.
 *
 * Runs from a GitHub Actions schedule rather than a platform cron because the
 * sync route authenticates with a POST and a bearer header, and because both
 * staging and production point at their own Supabase project and each need
 * their own run. Read-only against Wrike; see docs/wrike-setup.md.
 */

// The sync walks every approved folder with bounded concurrency, so allow well
// beyond a normal run before giving up on the response.
const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

export function redact(text, ...secrets) {
  let safe = String(text ?? "");
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join("[redacted]");
  }
  return safe.replace(/bearer\s+\S+/gi, "bearer [redacted]").slice(0, 300);
}

export async function main() {
  const rawUrl = process.env.COURSETRACK_SMOKE_BASE_URL?.trim();
  if (!rawUrl) throw new Error("Missing required variable COURSETRACK_SMOKE_BASE_URL.");
  const baseUrl = new URL(rawUrl);
  if (baseUrl.protocol !== "https:") throw new Error("COURSETRACK_SMOKE_BASE_URL must use HTTPS.");

  const cronSecret = process.env.WRIKE_SYNC_CRON_SECRET?.trim();
  if (!cronSecret) throw new Error("Missing required secret WRIKE_SYNC_CRON_SECRET.");
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

  const headers = { authorization: `Bearer ${cronSecret}`, accept: "application/json" };
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;

  const response = await fetch(new URL("/api/wrike/sync", baseUrl), {
    method: "POST",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);

  if (response.status === 409) {
    // Another run is already in flight. Best-effort delivery means this is a
    // normal outcome, not a failure.
    console.log("Wrike synchronization is already running; nothing to do.");
    return;
  }
  if (!response.ok || !body?.run) {
    throw new Error(
      `Wrike synchronization request failed with HTTP ${response.status}: ${redact(body?.message, cronSecret, bypassSecret)}`,
    );
  }

  const run = body.run;
  console.log(
    `Wrike synchronization ${run.status}: ${run.foldersSucceeded}/${run.foldersAttempted} folders, `
    + `${run.tasksSeen} tasks seen, ${run.tasksUpserted} upserted, ${run.tasksMarkedInactive} marked inactive.`,
  );
  for (const failure of run.errors ?? []) {
    console.warn(`Folder ${failure.folderName ?? failure.folderId} failed: ${redact(failure.error, cronSecret, bypassSecret)}`);
  }
  // A partial run still commits the folders that succeeded, so surface it
  // without failing the workflow; a fully failed run is a real problem.
  if (run.status === "failed") throw new Error("Wrike synchronization failed for every approved folder.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Wrike synchronization trigger failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
