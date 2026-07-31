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

Apply the SQL files in order:

1. `supabase/migrations/202607300001_phase1_foundation.sql`
2. `supabase/migrations/202607300002_supabase_runtime_adapter.sql`

With the Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The first successful CourseTrack request inserts the 64 deterministic sample
courses and sample retrieval history without overwriting later internal edits.

## 3. Configure local development

Create `.env.local`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` is accepted as a legacy alternative to
`SUPABASE_SECRET_KEY`.

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
