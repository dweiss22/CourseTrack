# Database schema

Supabase/Postgres is the only persistence layer. The operational additions are checked in at `supabase/migrations/202608040006_operational_workflows.sql` and are not applied remotely by the implementation workflow.

Application-owned records carry `provenance`, `origin_provenance`, `updated_by`, `updated_at`, `archived_at`, and `archived_by`. Courses additionally carry `field_provenance`. Valid provenance values are:

| Stored value | Display label | Mutation rule |
|---|---|---|
| `uploaded` | Uploaded | Projection editable; original upload immutable |
| `lms_api` | Connected via LMS API | Read-only |
| `coursetrack` | CourseTrack | Editable by authorized workflows |

`course_favorites` is keyed by user and course and protected by per-user RLS. `course_versions` has a partial unique index enforcing one unarchived current row per course. Revamp tasks use `bucket_key`, integer `sort_order`, `updated_at`, and archive metadata. Movement and version-current changes are transactional database functions.

Source tables and history tables are append-only. Courses, versions, accreditation records, notes, flags, Revamp tasks, and relationships are filtered by soft archive. Manual CourseTrack taxonomy and relationship assignments are the only audited hard-delete paths.

The migration maps workbook/import origins to `uploaded`, manual origins to `coursetrack`, and reserves `lms_api` for future connector snapshots. Cleanup archives generated Revamp rows only when actor and justification fingerprints both match, unlinks known `Mock Wrike` references, and writes a cleanup report while leaving ambiguous rows untouched.
