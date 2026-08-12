# Live Wrike course-version linking

This is a **linking integration, not a Wrike synchronization system that
writes anything back to Wrike**. It lets an administrator associate exactly
one existing Wrike task with a course version and open it from CourseTrack.
Wrike itself is never modified: no tasks, custom fields, folders, statuses,
or workflows are created, renamed, or required.

Until these settings are present, Wrike controls show an honest unavailable
state and no task data is generated locally.

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
WRIKE_PERMANENT_TOKEN=            # optional server-side token; can also be pasted in the admin UI
TOKEN_ENCRYPTION_KEY=             # 32+ random bytes; encrypts the stored token at rest
WRIKE_SYNC_CRON_SECRET=           # shared secret for an external scheduler, see step 5
WRIKE_VERSION_PUBLISHED_DATE_FIELD_ID=   # optional; see "Custom fields" below
WRIKE_REPORTING_YEAR_FIELD_ID=           # optional; see "Custom fields" below
```

None of these are `NEXT_PUBLIC_`-prefixed; they are read only in server-side
code and never sent to the browser.

On Vercel, set them on the **Production** and **Preview** scopes. There is no
"staging" scope: `scripts/vercel-ignore-build.mjs` builds only `main` and
`staging`, so `main` deploys as Production and `staging` deploys as Preview
(distinguished at runtime by `COURSETRACK_ENVIRONMENT`, see
`lib/deployment-environment.ts`). If you scope a Preview variable to specific
branches rather than all previews, include `staging`.

`WRIKE_SYNC_CRON_SECRET` must exist in **two** places with the same value: here,
so the app can verify an incoming scheduled request, and as a GitHub environment
secret, so the workflow can send it. A mismatch shows up as HTTP 401 on every
scheduled run.

### Custom fields

Wrike returns custom fields on a task as opaque id/value pairs with no titles.
The titles live only in the account-level catalogue (`GET /api/v4/customfields`,
same read-only token, same validated `WRIKE_API_HOST`).

Because definitions change rarely, the **scheduled sync** refreshes them into
`public.wrike_custom_field_index` alongside contacts and folders, and task
search resolves names from that table. The normal path therefore costs one
indexed database read and **zero Wrike requests** — consistent across every
serverless instance, and unaffected by a Wrike outage. Refresh cadence equals
your sync cadence (see step 5).

A live read is used only as a fallback: before the first sync after this
feature is deployed, or if the local copy is more than 16 days old — two missed
weekly cycles, i.e. the schedule has stopped rather than merely run late. That
fallback is cached in-process for 10 minutes;
failed or empty responses are cached for only ~45 seconds so a Wrike outage
neither retries on every keystroke nor hides names once Wrike recovers. A stale
local copy is still preferred over an empty live result.

Any field whose id, title, value, or type cannot be resolved safely is dropped —
CourseTrack never renders a raw field id or an "unknown field" placeholder.

Both field-id variables are optional and neither requires a Wrike change:

- `WRIKE_VERSION_PUBLISHED_DATE_FIELD_ID` — custom-field id holding a linked
  version's published date.
- `WRIKE_REPORTING_YEAR_FIELD_ID` — optional override naming the custom-field id
  that holds the reporting year. Normally unnecessary: the year is recognized by
  field title instead, so no configuration is required.

  **There is no Wrike field named "Reporting Year."** The value lives in the LCT
  reporting dropdowns as display text, and CourseTrack reduces it to a year:

  | Field title | Example value | Shown as |
  |---|---|---|
  | `[LCT] Reporting (M)` | `2026 Courses` | 2026 |
  | `[LCT] Reporting (L)` | `2025 Courses` | 2025 |
  | `Reporting Year` | `2026` | 2026 |

  The (M) and (L) variants are mutually exclusive in practice — of 1000 sampled
  production tasks, 75 carried (M), 237 carried (L), and none carried both.
  Across that sample 31% of tasks resolve a year, spanning 2022–2026.

  Titles are matched **exactly** (after trimming and lowercasing), never as a
  substring, because the account also defines `LCT Reporting`,
  `Assigned SME_LCT Reporting`, `Q1 Priority_LCT reporting`,
  `Course Name_LCT Reporting` and others that carry no reporting year. If two
  differently-valued recognized fields ever appear on one task, the year is
  omitted rather than guessed.

To find a field id, call `GET /api/wrike/custom-fields` as an administrator or
content user — it returns the normalized `{ id, title, type }` catalogue and
nothing else (no token, no raw Wrike payload).

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
Supabase. It also refreshes the reference data used to make task results
readable: contacts, the folder index, and the custom-field catalogue.
Course-version search then reads that local index — it never calls Wrike per
search.

- **Manual**: click **Run sync now** in the admin panel, or `POST
  /api/wrike/sync` with an authenticated admin session.
- **Scheduled**: [`.github/workflows/wrike-sync.yml`](../.github/workflows/wrike-sync.yml)
  runs weekly (Sundays 07:00 UTC) and can be run on demand from the Actions tab
  against `production`, `staging`, or both. It calls `POST /api/wrike/sync`
  with the `WRIKE_SYNC_CRON_SECRET` bearer header — the route accepts either
  that header or an authenticated admin session, since no signed-in user
  exists for a scheduled invocation.

  GitHub Actions rather than a platform cron because staging and production
  point at separate Supabase projects and each needs its own run, and because
  Vercel Cron issues a `GET` with no configurable headers (its own
  `CRON_SECRET` mechanism) and only targets the production deployment.

  Configure one **repository** variable:

  | Name | Kind | Scope | Value |
  |---|---|---|---|
  | `WRIKE_SYNC_ENABLED` | variable | **repository** | `true` to enable the weekly schedule |

  It must be repository-scoped, not environment-scoped. A job-level `if` is
  evaluated before the job is assigned its environment, so an
  environment-scoped variable reads as an empty string there and the job
  silently skips — an easy failure to miss, because a skipped job reports as a
  successful workflow run.

  Then per environment (`Production`, `staging`):

  | Name | Kind | Value |
  |---|---|---|
  | `COURSETRACK_SMOKE_BASE_URL` | variable | deployment origin (already set for smoke tests) |
  | `WRIKE_SYNC_CRON_SECRET` | secret | must match the app's env var |
  | `VERCEL_AUTOMATION_BYPASS_SECRET` | secret | required wherever Vercel deployment protection is on, which includes preview/staging by default |

  Only the production job is on the schedule. Staging runs on demand only,
  because it has no `TOKEN_ENCRYPTION_KEY` and therefore no Wrike connection;
  a scheduled staging run would fail weekly on "Wrike is not connected." To add
  it later: set that key on the Vercel Preview scope, connect Wrike in
  staging's admin UI, then give the staging job the same schedule clause the
  production job uses.

  Manual `workflow_dispatch` runs ignore `WRIKE_SYNC_ENABLED`, so you can
  trigger a sync before enabling the schedule.

Only one sync runs at a time: a second trigger returns HTTP 409 and the
workflow treats that as a no-op. A run whose process died is left marked
`running` and would otherwise block task search indefinitely, so a later sync
reclaims any run still open after an hour and marks it failed.

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
