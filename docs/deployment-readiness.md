# Deployment readiness contract

CourseTrack deployments are valid only when application code, Supabase Auth,
and the target database migration ledger agree. Vercel runs
`npm run build:vercel`, which executes `npm run check:deployment` before the
code-only Next.js build. A failed contract check stops publication; it never
changes the database.

`npm run build:code` is the secret-free build used for local work and pull
requests. Do not configure Vercel to use it in place of `build:vercel`.

## Release order

Staging:

1. Apply approved migrations, in filename order, to the persistent Supabase
   `staging` branch.
2. Run the sanitized workbook import and its count/checksum acceptance checks.
3. Run `npm run check:deployment` with the protected staging contract values.
4. Publish the `staging` Vercel deployment.
5. Run `npm run smoke:deployment` against the published URL.

Production:

1. Back up production and record the required protected counts/checksums.
2. Apply only the approved migrations to the production Supabase project.
3. Run production acceptance checks.
4. Run the protected production schema contract check.
5. Publish `main`, then run the production smoke test.

Never apply production migrations from a temporary branch, Vercel build,
health request, or smoke test. Database changes remain an explicit release
operation performed before application publication.

The production project was connected to Supabase Branching after its schema
already existed. Supabase recorded reviewed baseline migration
`20260806160508`, which represents the checked-in migrations through
`202608040007`. Migrations `202608040008`, `202608050001`, and every later
checked-in migration must appear as their own ledger rows. Staging continues
to require an exact checked-in migration ledger; do not copy, rename, or
manually rewrite either environment's migration history. Before invoking the
Supabase CLI, the protected Production preparation workflow creates a local,
comment-only marker for that already-applied baseline version. This satisfies
the CLI's local-history check without executing SQL or changing the remote
migration ledger.

## Vercel variables

Configure these variables as branch-specific Preview overrides for the
`staging` Git branch. Do not use a custom Vercel `staging` environment.
Production has a separate set scoped only to Production. Temporary branches
are not deployed and must not inherit staging or production values.

| Variable | Vercel scope | Notes |
| --- | --- | --- |
| `COURSETRACK_ENVIRONMENT` | Branch-specific | `staging` or `production` in the two-environment model |
| `SUPABASE_URL` | Branch-specific | Server API URL; same project as browser and checker |
| `SUPABASE_SECRET_KEY` | Secret, branch-specific | Server-only modern secret key |
| `NEXT_PUBLIC_SUPABASE_URL` | Branch-specific | Browser Auth URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Branch-specific | Publishable/anonymous browser key |
| `COURSETRACK_SCHEMA_DATABASE_URL` | Secret, branch-specific | Dedicated read-only schema-check login only |
| `COURSETRACK_PRODUCTION_SUPABASE_REF` | Environment identifier | Production `main` branch reference, never a key |
| `COURSETRACK_STAGING_SUPABASE_REF` | Environment identifier | Persistent `staging` branch reference |
| `COURSETRACK_PREVIEW_SUPABASE_REF` | Reserved | Used only if a third, isolated feature-preview environment is introduced later |

Vercel also supplies `VERCEL_GIT_COMMIT_REF` and `VERCEL_GIT_COMMIT_SHA`. The
gate cross-checks the branch and reports the commit in the safe health response.

The schema-check login must be `LOGIN NOINHERIT`, have no ownership or write
privileges, and receive database `CONNECT`; schema `USAGE` on `public` and
`supabase_migrations`; and `SELECT` only on
`supabase_migrations.schema_migrations`, `public.courses`,
`public.content_metadata_records`, `public.lms_snapshots`, and
`public.accreditation_records`. Those four application tables support the
read-only release audit. Give the login a short statement timeout. Never use
the Supabase database owner, service role, or administrative password for
`COURSETRACK_SCHEMA_DATABASE_URL`.

## GitHub protected environments

Use the existing GitHub environments `staging` and `Production`. Restrict them
to the `staging` and `main` branches, respectively. The CI contract jobs read
these values:

| Kind | Name |
| --- | --- |
| Environment variable | `SUPABASE_URL` |
| Environment secret | `SUPABASE_SECRET_KEY` |
| Environment variable | `NEXT_PUBLIC_SUPABASE_URL` |
| Environment variable | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Environment secret | `COURSETRACK_SCHEMA_DATABASE_URL` |
| Environment variable | `COURSETRACK_PRODUCTION_SUPABASE_REF` |
| Environment variable | `COURSETRACK_STAGING_SUPABASE_REF` |
| Environment variable | `COURSETRACK_SMOKE_BASE_URL` |
| Environment variable | `COURSETRACK_SMOKE_COURSE_ID` |
| Environment secret | `VERCEL_AUTOMATION_BYPASS_SECRET` |

The deployment-status workflow automatically runs the public health smoke.
Set `COURSETRACK_SMOKE_BASE_URL` to the stable branch domain for each GitHub
environment; Vercel deployment-status URLs are used only as a fallback because
they are not guaranteed to be the release domain. The workflow also supplies
the triggering deployment SHA as `COURSETRACK_SMOKE_EXPECTED_COMMIT`, and the
health response must report that exact commit so a stale stable-domain alias
cannot approve a release. If Vercel Deployment Protection is enabled, its
standard automation bypass is sent only in the `x-vercel-protection-bypass`
header; it does not bypass CourseTrack authentication. A
release operator then runs `npm run smoke:deployment` with
`COURSETRACK_SMOKE_BASE_URL`, `COURSETRACK_SMOKE_COURSE_ID`, and a current
`COURSETRACK_SMOKE_SESSION_COOKIE` supplied only to that process. Never save the
cookie in GitHub, Vercel, an env file, or repository. The authenticated smoke
does not create a bypass and does not create or modify application data.

## Health and failure diagnosis

`GET /api/health/deployment` returns only environment, Auth configuration,
database reachability, migration-contract state, and deployed commit. It
returns 200 only when all readiness checks pass; otherwise it returns 503.
It never returns project references, URLs, keys, database errors, or user data.

When a server-rendered page fails, CourseTrack logs a structured server event
with route, operation, environment, and an incident/request identifier. The
browser receives only the normal safe Next.js digest and a retry action. Use
Vercel runtime logs—not the displayed digest—to diagnose the underlying error.
