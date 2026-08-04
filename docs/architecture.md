# Architecture

CourseTrack retains the existing Next.js hosting architecture and Supabase/Postgres data layer. There is no alternate database runtime.

## Immutable source, editable projection

Workbook uploads and future LMS GET responses are source events. Their raw payloads, snapshots, retrieval/import runs, and audit rows are append-only. Normalized application tables are projections that authorized users can edit without changing source history.

Projection values carry:

- origin provenance, which never changes;
- current record provenance;
- field provenance for independently edited course fields;
- creator/updater actor IDs and timestamps;
- `updated_at` concurrency tokens;
- soft-archive actor/time metadata.

The display labels are exactly **Uploaded**, **Connected via LMS API**, and **CourseTrack**.

## Request boundary

Protected pages and APIs require a real Supabase session plus an active application profile. APIs authorize before record lookup, validate strict allowlisted payloads with shared Zod schemas, and return typed 401/403/404/409/422/500-class errors. Missing authentication or persistence is an error; there is no synthetic identity or in-memory fallback.

Writes use database functions for atomic operations such as favorites, course lifecycle changes, version-current transitions, manual relationships, and Revamp movement. Database constraints and policies remain the final enforcement layer.

## Operational views

Accreditation assessment is centralized in `lib/accreditation-grouping.ts`. Revamp uses four active buckets with integer ordering and optimistic rollback. Versions enforce one active current row per course. Dashboard, reports, badges, and queues derive values from database records or show honest empty states.
