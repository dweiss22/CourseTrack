# Database schema

## Provenance rules

Every externally derived record carries:

- source system/provider
- external identifier where available
- retrieval timestamp
- retrieval run or snapshot linkage
- normalized payload and mapping warnings where appropriate

Internal metadata is stored separately from the immutable LMS snapshot. A
retrieval may refresh LMS-owned fields but may not overwrite internal notes,
owners, flags, review dates, or proposals.

## Core tables

| Table | Purpose | Important constraints |
| --- | --- | --- |
| `profiles` | Application identity profile | One row per auth user; unique email |
| `roles` | Named authorization bundles | Unique stable key |
| `permissions` | Atomic capabilities | Unique stable key |
| `user_roles` | User-to-role grants | Unique user/role pair |
| `role_permissions` | Role capabilities | Unique role/permission pair |
| `verticals` | Controlled portfolio verticals | Unique name and slug |
| `courses` | CourseTrack portfolio record | Unique course code; unique nullable LMS ID |
| `course_verticals` | Secondary vertical classification | Unique course/vertical pair |
| `course_versions` | Version history | Course foreign key; explicit provenance |
| `accreditation_records` | Approval and expiration tracking | Course foreign key; expiration index |
| `course_flags` | Internal risks and tasks | Status/priority indexes |
| `notes` | Internal collaboration notes | Soft delete timestamp |
| `revamp_proposals` | Modernization pipeline | Score constrained to 0–100 |
| `lms_retrieval_runs` | Retrieval execution history | Counts and explicit outcome |
| `lms_snapshots` | Immutable normalized LMS state | Payload hash; one promoted current record |
| `audit_logs` | Append-only accountability events | Actor, record, before/after values, correlation ID |

## Index strategy

- Trigram search on course title/code plus B-tree indexes for lifecycle,
  vertical, next-review date, and health.
- Accreditation expiration and flag status/priority indexes support risk queues.
- Provider/external ID indexes support snapshot reconciliation.
- Audit record and creation indexes support chronological investigations.

## Delete behavior

Courses are archived with lifecycle state rather than deleted. Child records use
foreign keys and conservative deletion rules. Audit logs and LMS snapshots are
append-only in normal application operation.

## Runtime adapter

`db/index.ts` uses the official Supabase client from server-only code. It seeds
missing sample records without overwriting internal edits, reads persisted owner
and review fields into the portfolio, records retrieval history, and calls an
atomic PostgreSQL function for course edits plus audit logging.

The SQL files under `supabase/migrations/` are the schema authority for every
deployment target.
