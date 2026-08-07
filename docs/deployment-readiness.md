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

Never apply production migrations from a feature branch, Preview deployment,
Vercel build, health request, or smoke test. Database changes remain an
explicit release operation performed before application publication.

The production project was connected to Supabase Branching after its schema
already existed. Supabase recorded reviewed baseline migration
`20260806160508`, which represents the checked-in migrations through
`202608050001`. The production gate accepts that baseline and still requires
every later checked-in migration as its own ledger row. Staging continues to
require an exact checked-in migration ledger; do not copy, rename, or manually
rewrite either environment's migration history.

## Vercel variables

Configure these variables as branch-specific Preview overrides for the
`staging` Git branch. Do not use a custom Vercel `staging` environment.
Production has a separate set scoped only to Production. A feature Preview
must use an isolated third Supabase project; it may not inherit staging or
production values.

| Variable | Vercel scope | Notes |
| --- | --- | --- |
| `COURSETRACK_ENVIRONMENT` | Branch-specific | `staging`, `production`, or `preview` |
| `SUPABASE_URL` | Branch-specific | Server API URL; same project as browser and checker |
| `SUPABASE_SECRET_KEY` | Secret, branch-specific | Server-only modern secret key |
| `NEXT_PUBLIC_SUPABASE_URL` | Branch-specific | Browser Auth URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Branch-specific | Publishable/anonymous browser key |
| `COURSETRACK_SCHEMA_DATABASE_URL` | Secret, branch-specific | Dedicated read-only schema-check login only |
| `COURSETRACK_PRODUCTION_SUPABASE_REF` | Production/Preview identifier | Production project reference, never a key |
| `COURSETRACK_STAGING_SUPABASE_REF` | Production/Preview identifier | Persistent staging branch reference |
| `COURSETRACK_PREVIEW_SUPABASE_REF` | Feature Preview only | Isolated feature-preview project reference |

Vercel also supplies `VERCEL_GIT_COMMIT_REF` and `VERCEL_GIT_COMMIT_SHA`. The
gate cross-checks the branch and reports the commit in the safe health response.

The schema-check login must be `LOGIN NOINHERIT`, have no ownership or write
privileges, and receive only database `CONNECT`, schema `USAGE` on
`supabase_migrations`, and `SELECT` on
`supabase_migrations.schema_migrations`. Give it a short statement timeout.
Never use the Supabase database owner, service role, or administrative password
for `COURSETRACK_SCHEMA_DATABASE_URL`.

## GitHub protected environments

Create GitHub environments named `staging` and `production`. The CI contract
jobs read these exact values:

| Kind | Name |
| --- | --- |
| Environment variable | `SUPABASE_URL` |
| Environment secret | `SUPABASE_SECRET_KEY` |
| Environment variable | `NEXT_PUBLIC_SUPABASE_URL` |
| Environment variable | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Environment secret | `COURSETRACK_SCHEMA_DATABASE_URL` |
| Environment variable | `COURSETRACK_PRODUCTION_SUPABASE_REF` |
| Environment variable | `COURSETRACK_STAGING_SUPABASE_REF` |
| Environment variable | `COURSETRACK_SMOKE_COURSE_ID` |
| Environment secret | `VERCEL_AUTOMATION_BYPASS_SECRET` |

The deployment-status workflow automatically runs the public health smoke. If
Vercel Deployment Protection is enabled, its standard automation bypass is
sent only in the `x-vercel-protection-bypass` header; it does not bypass
CourseTrack authentication. A
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
