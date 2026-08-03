# CourseTrack architecture and delivery plan

## Repository assessment

The repository began as a minimal vinext/Cloudflare starter. It had no domain
model, application routes, production UI, or business integrations. The current
foundation adds a complete vertical slice while retaining the starter's
deployable Cloudflare worker shape.

The LMS Course List, Course Metadata, and Topics workbooks are treated as
read-only discovery artifacts. Their actual layouts informed configurable
parsers and mock fixtures; they are never altered or treated as a live database.

## Technical architecture

```mermaid
flowchart LR
  UI["React application shell and workspaces"]
  API["Server route handlers"]
  Domain["Typed CourseTrack domain model"]
  DB["CourseTrack data store"]
  LMS["ReadOnlyLmsProvider"]
  Import["Confirmed file imports"]
  Reconcile["Source comparison and resolution"]
  Mock["Deterministic Mock LMS"]
  Live["Live LMS adapter (not configured)"]

  UI --> API
  UI --> Domain
  API --> DB
  API --> LMS
  API --> Import
  LMS --> Reconcile
  Import --> Reconcile
  Reconcile --> Domain
  LMS --> Mock
  LMS --> Live
```

- The UI reads from typed domain objects and calls same-origin APIs for internal
  writes and LMS retrieval requests.
- Internal writes are validated server-side and limited by centralized
  permissions.
- LMS integrations implement a query-only interface. No create, update, delete,
  publish, or assignment methods exist in the contract.
- Successful LMS retrievals are normalized into immutable snapshots. Failed
  retrievals preserve the most recent successful snapshot.
- Content Metadata and Topics retain raw import values beside normalized
  records. Preview validation blocks unsafe rows before confirmation.
- Source conflicts preserve both values. A user resolution selects only the
  active CourseTrack display value and is recorded in the audit log.
- CourseTrack is the sole version authority. The LMS provider exposes no
  version operation because LMS versioning is not communicated to the app.
- Wrike is a future read-only task-reference source. CourseTrack stores the
  version-to-task link and a retrieved task snapshot without writing to Wrike.
- Both deployment targets use a server-only Supabase/Postgres adapter. Missing
  credentials activate a labeled sample fallback without allowing fake writes.

## Entity relationship model

```mermaid
erDiagram
  COURSES ||--o{ COURSE_VERSIONS : has
  COURSE_VERSIONS ||--o{ VERSION_WRIKE_TASK_REFERENCES : documents
  COURSES ||--o{ ACCREDITATION_RECORDS : has
  COURSES ||--o{ COURSE_FLAGS : has
  COURSES ||--o{ NOTES : has
  COURSES ||--o{ REVAMP_PROPOSALS : has
  COURSES ||--o{ LMS_SNAPSHOTS : maps
  COURSES ||--o{ CONTENT_METADATA_RECORDS : enriches
  CONTENT_METADATA_IMPORT_RUNS ||--o{ CONTENT_METADATA_RECORDS : produces
  COURSES ||--o{ FIELD_COMPARISONS : reconciles
  COURSES ||--o{ MONITORING_CLASSIFICATIONS : classifies
  COURSES ||--o{ COURSE_TOPICS : assigned
  TOPICS ||--o{ COURSE_TOPICS : categorizes
  COURSES ||--o{ COURSE_RELATIONSHIPS : relates
  CONTENT_METADATA_IMPORT_RUNS ||--o{ IMPORT_VALIDATION_ERRORS : reports
  LMS_RETRIEVAL_RUNS ||--o{ LMS_SNAPSHOTS : produces
  COURSES ||--o{ COURSE_VERTICALS : classified
  VERTICALS ||--o{ COURSE_VERTICALS : includes
  PROFILES ||--o{ AUDIT_LOGS : acts
```

## Initial table set

1. Identity and authorization: `profiles` (backed by Supabase Auth's
   `auth.users`, carrying an exclusive `role` and `account_status`).
2. Portfolio: `verticals`, `courses`, `course_verticals`, `course_versions`,
   `accreditation_records`.
3. Internal workflow: `course_flags`, `notes`, `revamp_proposals`.
4. Integration and provenance: `lms_retrieval_runs`, `lms_snapshots`.
5. Imported sources: `content_metadata_import_runs`,
   `content_metadata_records`, `topics`, `course_topics`, and
   `monitoring_classifications`.
6. Reconciliation and structure: `field_comparisons`,
   `course_relationships`, and `import_validation_errors`.
7. Accountability: `audit_logs`.

The canonical column-level design is in
[`database-schema.md`](database-schema.md). The source-aware extension is in
`supabase/migrations/202607310004_source_reconciliation.sql`; it remains an
unapplied migration until a separate production-database authorization.

## Permission strategy

Authorization is deny-by-default. UI affordances improve usability but are not
the security boundary; APIs and database policies enforce permissions again.
Each user has exactly one exclusive role — no additive/composed permissions:

- `super_admin`
- `admin`
- `accreditation`
- `content`

See [`permissions.md`](permissions.md) for the access matrix and
[`auth-setup.md`](auth-setup.md) for authentication setup and the
super_admin bootstrap procedure.

## Sample-data strategy

- Generate stable course records from the supplied Content Metadata workbook,
  enrich matching IDs from the supplied LMS exports, and attach matching Topics
  matrix assignments without requiring the source files at deployment time.
- Use a fixed reference date so review and accreditation queues remain
  deterministic.
- Deliberately include healthy, warning, stale, failed, and incomplete records.
- Mark every generated record with `isSample`, `dataSource`, and `sourceSystem`.
- Never blend sample data with a live provider without a visible environment
  label.

## Mock-provider strategy

The mock provider implements the same read-only interface as a future live
provider and supports three deterministic modes:

- `healthy`: all records retrieved.
- `warnings`: partial success with explicit mapping warnings.
- `outage`: retrieval fails while the previous snapshot stays active.

Live API endpoint shapes and response fields are not guessed. The placeholder
adapter reports `not-configured` until documentation and credentials are
available.

## Delivery phases

### Phase 1 — foundation and portfolio vertical slice

- Architecture, schema, RLS, roles, and provenance
- Responsive shell, dashboard, library, and course detail
- Deterministic sample data and mock LMS provider
- Supabase/Postgres persistence plus deterministic sample fallback
- Build, contract, and rendered-output tests

### Phase 2 — production identity and ingestion

- Connect production Supabase project credentials and apply migrations
- Implement the documented live LMS adapter
- Add scheduled retrievals, retry policy, incremental cursors, and alerts
- Add controlled workbook import jobs with row-level validation reports

### Phase 3 — workflow hardening

- Approval workflows, notification routing, richer audit views
- Browser end-to-end, accessibility, and performance regression suites
- Fine-grained organization/vertical scopes and data-retention controls

### Phase 4 — analytics and operations

- Saved server-side reports and scheduled exports
- Trend snapshots, portfolio forecasting, and operational service levels
- Runbooks, recovery tests, and production observability

## Assumptions

- CourseTrack is the system of record only for internal portfolio metadata.
- The LMS remains authoritative for LMS-owned course fields.
- Authentication identifies a person; authorization is resolved by CourseTrack
  roles.
- Soft archive is preferred over destructive course deletion.
- A future live LMS supports read APIs and server-side authentication, but its
  exact capabilities are unknown.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| LMS fields or pagination differ from expectations | Keep provider mapping isolated; do not invent endpoints |
| Stale data is mistaken for current data | Show source, retrieval status, and timestamp near LMS fields |
| A failed retrieval erases useful data | Store immutable snapshots and promote only successful retrievals |
| UI role checks are bypassed | Re-check permissions in APIs and RLS |
| Spreadsheet values contain formulas or malformed dates | Map explicitly, validate rows, and neutralize formula-leading exports |
| Host configuration diverges | Use one server-only Supabase adapter and the same ordered migrations on every host |

## Recommended migration order

1. Identity, roles, permissions, and helper functions.
2. Verticals and courses.
3. Versions, accreditation, flags, notes, and revamp proposals.
4. Retrieval runs and immutable snapshots.
5. Audit logs and indexes.
6. RLS enablement and policies.
7. Reference role, permission, and vertical seed records.
