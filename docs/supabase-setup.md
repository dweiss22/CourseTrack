# Supabase setup

Configure server credentials and browser authentication credentials in `.env.local` using `.env.example` as the field list. The app requires a real Supabase session and an active `profiles` membership; it does not synthesize users.

Apply migrations in filename order only to an explicitly authorized development/staging project. Review `202608040006_operational_workflows.sql` before applying it. This repository task intentionally does not apply migrations or deploy remotely.

After migration, verify:

1. provenance constraints and backfill counts;
2. RLS and service-role-only function grants;
3. favorite isolation;
4. audit creation and LMS API immutability;
5. current-version uniqueness;
6. Revamp atomic reindexing and concurrency conflicts;
7. fingerprinted cleanup-report totals.

If credentials, schema, or permissions are missing, the app returns an explicit error. It does not fall back to bundled records.
