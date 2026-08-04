# Staging data refresh

CourseTrack staging uses a separate Supabase project. A scheduled GitHub
Actions workflow replaces its application data each Sunday at 08:00 UTC with
a sanitized, internally consistent production snapshot. The workflow can also
be started manually with **Run workflow**.

The refresh is one way. Staging never writes to production, and changes made
in staging are disposable.

## Safety model

- `PRODUCTION_DATABASE_URL` must belong to a database role with `SELECT` access
  to the `public` schema and read access to the migration-version table. Do not
  use the production `postgres` password or a production Supabase
  secret/service-role key.
- The utility refuses to run unless `COURSETRACK_ENVIRONMENT=staging`, the two
  Supabase project references differ, the database URLs differ, both public
  schemas match, and there is exactly one production superadmin.
- Staging replacement occurs inside one database transaction. A failed copy or
  foreign-key validation rolls back to the previous public dataset.
- Non-tester Auth placeholders keep production UUID relationships but use
  deterministic `@staging.invalid` addresses, random unknown passwords, and a
  long Auth ban. Supabase `createUser()` does not send an invitation email.
- Production password hashes are never read or copied.
- Audit history and Wrike operational caches are cleared. The staging-specific
  `wrike_connection` row is preserved, but staging deployments must use mock or
  non-mutating integration settings.
- Notes, proposal justifications, raw payloads, profile details, and actor
  emails are redacted or masked.

Auth placeholder creation happens before the public-data transaction because
`profiles.id` references `auth.users.id`. Existing Auth users are not modified
until the transaction commits. If a newly created placeholder remains after a
failed first-time refresh it is banned, cannot sign in, and is removed by a
later successful reconciliation.

## GitHub staging environment

Create a protected GitHub environment named `staging` and configure:

| Name | Kind | Purpose |
| --- | --- | --- |
| `PRODUCTION_SUPABASE_URL` | Secret | Production URL, used only to verify project separation |
| `PRODUCTION_DATABASE_URL` | Secret | Read-only production Postgres connection |
| `STAGING_SUPABASE_URL` | Secret | Staging project URL |
| `STAGING_SUPABASE_SECRET_KEY` | Secret | Staging-only Auth administration key |
| `STAGING_DATABASE_URL` | Secret | Staging administrative Postgres connection |
| `STAGING_MASKING_KEY` | Secret | Stable random value of at least 32 characters |
| `STAGING_TESTER_EMAILS` | Variable | Comma-separated approved tester emails |

Provision the production export role with only the access used by the refresh:

```sql
create role coursetrack_staging_export login password '<generated password>';
grant connect on database postgres to coursetrack_staging_export;
grant usage on schema public, supabase_migrations to coursetrack_staging_export;
grant select on all tables in schema public to coursetrack_staging_export;
grant select on supabase_migrations.schema_migrations to coursetrack_staging_export;
alter default privileges in schema public
  grant select on tables to coursetrack_staging_export;
```

The sole production superadmin must be included in `STAGING_TESTER_EMAILS` and
must already exist in staging Auth with the same UUID and email. Bootstrap that
identity once before the first refresh. Additional testers must also use their
production profile UUID and email.

Rotate production and staging credentials independently. Rotating
`STAGING_MASKING_KEY` changes every masked identity, so keep it stable unless a
deliberate remasking is required.

## First refresh and recovery

1. Apply every checked-in migration to both projects, including
   `202608040005_staging_snapshot_status.sql`.
2. Confirm the staging superadmin Auth UUID matches production and add the
   email to `STAGING_TESTER_EMAILS`.
3. Ensure staging Auth SMTP cannot deliver to production users and set Vercel
   Preview integrations to mock/read-only credentials.
4. Run **Refresh staging data** manually in GitHub Actions.
5. Confirm the banner contains the refresh date, User Management shows the
   expected masked roster, and representative course counts match production.

If a refresh fails, correct the reported credential, schema, or data problem
and run it again. Do not point staging at production as a workaround.

## Vercel configuration

Keep `main` as Production and configure branch-specific Preview variables for
`staging`:

```dotenv
COURSETRACK_ENVIRONMENT=staging
SUPABASE_URL=<staging project URL>
SUPABASE_SECRET_KEY=<staging secret key>
NEXT_PUBLIC_SUPABASE_URL=<same staging project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging publishable key>
WRIKE_PROVIDER=mock
```

Assign the `staging` branch a persistent `staging.<production-domain>` domain
in Vercel and enable Deployment Protection for that domain/environment. Keep
the production domain assigned only to `main`. Redeploy after changing any
environment variables.

Feature branches should set or inherit `COURSETRACK_ENVIRONMENT=preview`; they
display a **PREVIEW** banner but do not receive the scheduled staging refresh.
