# Live Wrike course-version linking

This is a **linking integration, not a Wrike synchronization system that
writes anything back to Wrike**. It lets an administrator associate exactly
one existing Wrike task with a course version and open it from CourseTrack.
Wrike itself is never modified: no tasks, custom fields, folders, statuses,
or workflows are created, renamed, or required.

This is separate from the pre-existing `WRIKE_PROVIDER=mock` "Wrike work
reference" browse panel on `/versions`, which is untouched by this feature.

## 1. Register a dedicated Wrike app and generate a permanent access token

Use a separate Wrike App Console registration for CourseTrack (do not reuse
another application's token). In the Wrike App Console:

1. Create a new app for CourseTrack.
2. Request only the **`wsReadOnly`** scope.
3. Generate a **permanent access token** for the connected Wrike account (this
   is Wrike's simplified, non-expiring token flow — no authorization-code
   redirect or refresh-token rotation to manage).
4. Copy the token once; it is not shown again.

## 2. Configure environment variables

```dotenv
WRIKE_API_HOST=https://www.wrike.com
WRIKE_PERMANENT_TOKEN=            # optional fallback; can also be pasted in the admin UI
TOKEN_ENCRYPTION_KEY=             # 32+ random bytes; encrypts the stored token at rest
WRIKE_SYNC_CRON_SECRET=           # shared secret for an external scheduler, see step 5
```

None of these are `NEXT_PUBLIC_`-prefixed; they are read only in server-side
code and never sent to the browser.

## 3. Connect

Go to **Administration → Wrike provider**. Paste the permanent token (or
leave it blank to use `WRIKE_PERMANENT_TOKEN`) and click **Connect**.
CourseTrack calls `GET /account` once to confirm the token works and to
capture the account name for display — this does not modify anything in
Wrike.

Use **Check health** at any time to re-verify the connection. **Disconnect**
removes the locally stored, encrypted token; it does not revoke or change
anything in Wrike.

## 4. Approved folders

CourseTrack only ever reads tasks from the following pre-approved top-level
folders (`lib/wrike-source-folders.ts`, mirrored in the
`wrike_source_folders` table):

Cordico [New] · Custody [Maint] · Custody [New] · Dispatch [New] ·
EMS [Maint] · EMS [New] · Fire [Maint] · Fire [New] ·
Law Enforcement [Maint] · Law Enforcement [New] · Local Gov [Maint] ·
Local Gov [New] · Non-Vertical Content Projects [Maint]

No other folder — including any "DO NOT USE" folder, the top-level JIRA
Tickets folder, or the Blueprints folder — is ever queried. Adding a folder
to this allowlist requires a code change and a migration, not a runtime
setting.

## 5. Running a sync

A sync reads every approved folder (`GET /folders/{id}/tasks?descendants=true`,
one request per folder, bounded concurrency, retried with backoff on
429/5xx), consolidates the results by Wrike task id (preserving every
approved folder a task appears in), and upserts the normalized result into
Supabase. Course-version search then reads that local index — it never calls
Wrike per search.

- **Manual**: click **Run sync now** in the admin panel, or `POST
  /api/wrike/sync` with an authenticated admin session.
- **Scheduled** (recommended, e.g. once daily): this repo has no
  hand-authored `wrangler.toml`/`vercel.json` checked in, so wire whichever
  platform you deploy to:
  - **Vercel Cron**: add a `vercel.json` `crons` entry that calls `POST
    /api/wrike/sync` with header `Authorization: Bearer $WRIKE_SYNC_CRON_SECRET`.
  - **Cloudflare Cron Trigger**: add a `[triggers] crons` entry to your
    deployed Worker config with a scheduled handler that fetches the same
    route with the same header.

  The route accepts either an authenticated admin session or the
  `WRIKE_SYNC_CRON_SECRET` bearer header — no signed-in user is available for
  a platform-scheduled invocation.

A sync that fails on some folders still commits the successful folders'
results (`status: "partial"`); tasks are only marked inactive after a fully
successful sync omits them, so a transient per-folder failure never causes a
false "stale" marking.

## 6. Linking a course version

On a course's **Versions** tab:

- **Paste an exact Wrike task URL** — CourseTrack resolves it through
  Wrike's exact permalink filter (`GET /tasks?permalink=...`) and only
  persists the link if exactly one task matches.
- **Find candidates** — searches the locally synchronized index (never
  triggers a live Wrike call) using the course code as the primary search
  term. Zero, one, or a bounded list of candidates are shown; you must
  explicitly select one.
- Either path re-verifies the exact task against Wrike (`GET /tasks/{id}`)
  before saving — nothing is persisted from unverified user input.

Once linked: **Open in Wrike** (opens the permalink in a new tab), **Verify
link** (re-fetches the task once, on demand — the normal page load never
calls Wrike), **Relink**, and **Unlink** (clears the CourseTrack association
only; no request is ever sent to Wrike to unlink).

## 7. Troubleshooting

- **"That Wrike task was not found or is not accessible"**: the token's
  connected account cannot see that task, or the permalink is wrong.
- **"That link matched more than one Wrike task"**: the permalink resolved
  ambiguously; link the exact task by id instead.
- **No candidates found**: the task may not exist yet in the synchronized
  index — try **Run sync now**, or paste the exact permalink.
- **Sync shows `partial`**: check the per-folder table on the admin panel for
  the failing folder's sanitized error; a partial sync retains prior data for
  folders that didn't run.
- **"Wrike rejected the stored access token"**: the permanent token was
  revoked in Wrike — generate a new one and reconnect.

## Security

- The Wrike token is encrypted at rest (AES-256-GCM) and never returned to
  the browser, logged, or included in error messages.
- Every Wrike API host is validated against `wrike.com`/`*.wrike.com` before
  a request is ever built.
- Connecting, disconnecting, running a sync, and linking/verifying/unlinking
  a course version are all restricted to administrators
  (`administration:manage`) or version managers (`versions:manage`).
