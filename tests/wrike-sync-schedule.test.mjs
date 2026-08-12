import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("the Wrike sync runs on a schedule for both deployed environments", async () => {
  const workflow = await source(".github/workflows/wrike-sync.yml");

  assert.match(workflow, /schedule:\s*\n\s*(#[^\n]*\n\s*)*- cron: "0 7 \* \* 0"/, "weekly schedule");
  assert.match(workflow, /workflow_dispatch:/, "must stay manually runnable");
  assert.match(workflow, /concurrency:\s*\n\s*group: wrike-sync\s*\n\s*cancel-in-progress: false/);

  // Staging and production point at separate Supabase projects, so each needs
  // its own run against its own environment-scoped secrets.
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /vars\.WRIKE_SYNC_ENABLED == 'true'/, "the schedule must be opt-in");

  // A job-level `if` runs before the environment is resolved, so an
  // environment-scoped variable reads as "" there and the job silently skips.
  // Exactly one job may be schedule-gated, and only on a repository variable.
  assert.equal((workflow.match(/github\.event_name == 'schedule'/g) ?? []).length, 1);
  const stagingJob = workflow.slice(workflow.indexOf("  staging:"));
  assert.doesNotMatch(stagingJob, /github\.event_name == 'schedule'/, "staging is dispatch-only until it has a Wrike connection");
  assert.match(stagingJob, /workflow_dispatch/);

  assert.match(workflow, /permissions:\s*\n\s*contents: read/, "least privilege");
  assert.doesNotMatch(workflow, /permissions:\s*\n\s*contents: write/);
  assert.match(workflow, /run: node scripts\/trigger-wrike-sync\.mjs/);

  // Secrets are referenced, never inlined.
  assert.match(workflow, /WRIKE_SYNC_CRON_SECRET: \$\{\{ secrets\.WRIKE_SYNC_CRON_SECRET \}\}/);

  // Checked against assignments rather than any mention, so explanatory
  // comments naming a variable do not trip it.
  const directives = workflow.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
  assert.doesNotMatch(
    directives,
    /(WRIKE_PERMANENT_TOKEN|TOKEN_ENCRYPTION_KEY|SUPABASE_SECRET_KEY|DATABASE_URL)\s*:/,
    "the trigger needs no database or Wrike credentials",
  );
});

test("the sync trigger is an HTTPS POST that redacts secrets and tolerates an in-flight run", async () => {
  const script = await source("scripts/trigger-wrike-sync.mjs");

  assert.match(script, /method: "POST"/);
  assert.match(script, /"\/api\/wrike\/sync"/);
  assert.match(script, /baseUrl\.protocol !== "https:"/, "the target must be HTTPS");
  assert.match(script, /AbortSignal\.timeout/);
  assert.match(script, /redirect: "manual"/, "a redirected sync must not be followed to another host");

  // Overlapping runs are expected under best-effort scheduling.
  assert.match(script, /response\.status === 409/);

  // The secret is interpolated exactly once -- into the Authorization header --
  // and the bypass secret is never interpolated into a string at all.
  assert.equal((script.match(/\$\{cronSecret\}/g) ?? []).length, 1);
  assert.match(script, /authorization: `Bearer \$\{cronSecret\}`/);
  assert.doesNotMatch(script, /\$\{bypassSecret\}/);

  // Every value that reaches a log goes through redact().
  assert.match(script, /redact\(body\?\.message, cronSecret, bypassSecret\)/);
  assert.match(script, /redact\(failure\.error, cronSecret, bypassSecret\)/);
});

test("redact removes the configured secrets and any bearer token from reported text", async () => {
  const { redact } = await import("../scripts/trigger-wrike-sync.mjs");

  assert.equal(redact("token s3cr3t-value leaked", "s3cr3t-value"), "token [redacted] leaked");
  assert.equal(redact("a byp4ss and s3cr3t", "s3cr3t", "byp4ss"), "a [redacted] and [redacted]");
  assert.equal(redact("Authorization: Bearer abc.def"), "Authorization: bearer [redacted]");
  // A secret appearing more than once is removed every time.
  assert.equal(redact("s3cr3t/s3cr3t", "s3cr3t"), "[redacted]/[redacted]");
  // Undefined/empty secrets must not corrupt the message or throw.
  assert.equal(redact("nothing to hide", undefined, ""), "nothing to hide");
  assert.equal(redact(undefined), "");
  assert.equal(redact(null, "s3cr3t"), "");
  // Long provider output is truncated rather than dumped into the log.
  assert.equal(redact("x".repeat(500)).length, 300);
});

test("only one Wrike sync runs at a time, and an abandoned run cannot block search forever", async () => {
  const repository = await source("db/wrike-repository.ts");
  const route = await source("app/api/wrike/sync/route.ts");

  const start = repository.indexOf("export async function runWrikeSync");
  const body = repository.slice(start, repository.indexOf('.from("wrike_source_folders")', start));

  // The guard must run before a new run row is inserted.
  const guardIndex = body.indexOf('.eq("status", "running")');
  const insertIndex = body.indexOf('.insert({ status: "running"');
  assert.ok(guardIndex >= 0, "runWrikeSync should check for an in-flight run");
  assert.ok(insertIndex >= 0 && guardIndex < insertIndex, "the check must precede starting a new run");
  assert.match(body, /A Wrike synchronization is already running\./);

  // A crashed run leaves a "running" row; searchWrikeTaskIndex refuses to
  // return candidates while one exists, so it must be reclaimable.
  assert.match(repository, /WRIKE_SYNC_RUN_ABANDONED_AFTER_MS/);
  assert.match(body, /abandoned/);
  assert.match(body, /status: "failed"/);

  // The API surfaces the conflict distinctly so a scheduled trigger can treat
  // it as a no-op instead of a failure.
  assert.match(route, /already running/i);
  assert.match(route, /status: 409/);
});

test("the scheduled sync stays read-only against Wrike", async () => {
  const [workflow, script, route] = await Promise.all([
    source(".github/workflows/wrike-sync.yml"),
    source("scripts/trigger-wrike-sync.mjs"),
    source("app/api/wrike/sync/route.ts"),
  ]);
  for (const [name, text] of [["workflow", workflow], ["script", script], ["route", route]]) {
    assert.doesNotMatch(text, /wrike\.com\/api\/v4\/[a-z]+["']?\s*,?\s*\{\s*method:\s*["'](POST|PUT|PATCH|DELETE)/i, `${name} must not write to Wrike`);
  }
  // The only POST the trigger makes is to CourseTrack's own sync route.
  assert.equal((script.match(/method: "(POST|PUT|PATCH|DELETE)"/g) ?? []).length, 1);
});
