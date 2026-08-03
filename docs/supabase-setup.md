# Supabase setup

CourseTrack uses the official Supabase JavaScript client from server-only code.
The secret key is never imported by a client component or returned by an API.

## 1. Create or choose a Supabase project

Collect these values from the project settings:

- Project URL
- Secret key (`sb_secret_...`) or the legacy `service_role` key

Do not use a publishable/anonymous key for the server adapter. Do not commit any
key.

## 2. Apply migrations

Apply all six SQL files, in order, either through the Supabase Dashboard's
SQL Editor (paste and run each file one at a time) or with the Supabase CLI:

1. `supabase/migrations/202607300001_phase1_foundation.sql`
2. `supabase/migrations/202607300002_supabase_runtime_adapter.sql`
3. `supabase/migrations/202607310003_lexipol_verticals.sql`
4. `supabase/migrations/202607310004_source_reconciliation.sql`
5. `supabase/migrations/202607310005_app_owned_versions_wrike.sql`
6. `supabase/migrations/202608030001_manual_taxonomy.sql`

With the Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

## 3. Configure local development

Create `.env.local`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` is accepted as a legacy alternative to
`SUPABASE_SECRET_KEY`.

## 3.5. Seed the sample portfolio

The full relational graph behind the 1,952 sample courses (versions,
accreditations, flags, notes, revamp proposals, LMS snapshots, content
metadata, field comparisons, topics, and relationships) is populated by a
standalone script, not automatically on first request:

```bash
node --import ./scripts/register-aliases.mjs --env-file=.env.local scripts/seed-supabase.mjs
```

The script is idempotent — every row id is a deterministic UUID derived from
a stable natural key, so re-running it upserts the same rows instead of
duplicating data. Set `SEED_LIMIT=50` to seed a small slice first when
testing against a new project. `scripts/register-aliases.mjs` exists only
because this script runs under plain Node (not the app's Vite/Next bundler)
and needs the same `@/*` path alias the rest of the app uses.

## 4. Configure hosts

Add the same two server-only values to:

- Vercel project environment variables
- OpenAI Sites runtime environment variables

Redeploy after changing hosted environment values.

## Runtime behavior

- Both credentials present and migrations applied: Supabase/Postgres is active.
- Neither credential present: the app remains usable in labeled sample fallback
  mode.
- Partial credentials or missing migrations: bootstrap reports a configuration
  error and the portfolio stays available from sample data.

The adapter uses the elevated secret only in trusted server routes. Browser code
never receives it. Because the secret bypasses RLS, CourseTrack rejects
unauthenticated production writes before calling Supabase and attributes every
accepted write in the audit log. Add organization role resolution before
granting broader production access.
