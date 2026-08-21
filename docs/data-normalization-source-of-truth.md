# Data normalization source of truth

This document is the reference for how CourseTrack's data variables are named, typed, and normalized as they flow from external sources into the app's core entities. It complements [`import-mapping.md`](import-mapping.md) (which covers the workbook import *process* and rollout) by focusing on *what the data looks like* at each stage: raw source shape → normalization rule → canonical entity field.

Update this file whenever a source alias, normalization rule, entity field, or acceptance baseline changes. Treat `config/course-data-manifest.json` as the authoritative baseline numbers — this doc explains them, it doesn't override them.

## 1. Data sources

| Source | Files / mechanism | Loader | Status |
|---|---|---|---|
| LMS "Standard" course export | `Files/all_Standard Courses.xlsx`, sheet `All (comma separated)` (31 cols) | `scripts/course-workbook-loader.mjs` | Active |
| LMS "compact" course exports | `Files/all_Full Length Courses.xlsx`, `all_Single Video Courses.xlsx`, `all_Training Block Courses.xlsx`, sheet `Sheet1` (11 cols) | same | Active |
| CourseTrack/Content "master" metadata | `Files/LMS new list - master.xlsx`, sheet `Master` (17 cols) — the "master-import" | same | Active |
| Topics matrix | `Files/LMS new list - Topics.xlsx` | `lib/source-normalization.ts` (`parseTopicsMatrix`) | Parsed but **not wired into** the main import — partially built |
| LMS live API | — | `lib/integration-mappings.ts` (`LMS_MAPPING_REGISTRY`, intentionally empty) | Not implemented. `lms_authority_settings.authority_mode` supports `'api'` but no connector ships |
| Wrike (tasks/contacts/folders) | Wrike REST API, GET-only | `lib/wrike-sync.ts`, `lib/wrike-http-client.ts`, `lib/wrike-matching.ts` | Active, reference-only (disabled until configured) |
| Auth/identity | Supabase Auth (`auth.users`) → `public.profiles` | `db/user-repository.ts`, `db/profile-repository.ts` | Active |
| Manual/app input | App UI + RPCs | `db/*-repository.ts` | Active |

`config/course-data-manifest.json` pins the exact reviewed workbook set (filenames, sizes, SHA-256 hashes, review date) plus the `acceptedCounts` baseline that gates import.

## 2. Per-source normalization

### 2.1 LMS workbook rows

Parser: `parseLmsRow` in [`lib/source-normalization.ts`](../lib/source-normalization.ts) (~line 456).

Raw columns are matched case/whitespace-insensitively via `LMS_ALIASES` (~line 84): `Course ID`, `Course Type`, `Course Name`, `Duration`, `Course Description`, `Public/Private Topics`, `Sites`, `Published Date`, `Author`, `Owner`, `Visible/Hidden in Organizations`, `Author Status`, `Is published`, `Has topics`, `Is Lexipol`, `Generate Certificate`, `Available/Hidden in States`, `Surveys`, `Created Date`, `Last Revision Date`, `Course Accreditation State`, `Training Credits`, plus parallel accreditation columns (`Issuing Body`, `State`, `Accreditation Number`, `Topic Number`, `Accreditation Start/End Date` — comma-lists aligned positionally per course).

| Raw field | Rule | Function |
|---|---|---|
| Course ID | Strips Excel `.0` float suffix, rejects non-safe integers | `normalizeCourseId` |
| Boolean flags (`Is published`, `Has topics`, `Is Lexipol`, `Generate Certificate`) | `1/yes/true/y` → `true`, `0/no/false/n` → `false` | `normalizeBoolean` |
| Duration | Hours → minutes (`*60`); derived from Training Credits if blank | `normalizeLmsDuration` |
| Training Credits | Free text (`"1 hour 30 minutes"`) → `{ rawDisplay, amount, unit }` | `parseTrainingCredits` |
| Dates (Published/Created/Last Revision) | Excel serial (epoch 1899-12-30), ISO `YYYY-MM-DD`, US `M/D/YYYY[ h:mm AM/PM]`, else `Date.parse` fallback | `normalizeDate` |
| Multi-value fields (topics, sites, states, surveys, org visibility) | Split on `;`/`,` | `splitSemicolonValues` / `splitCommaValues` |
| Sites → Vertical | Mapped via `DEFAULT_LMS_SITE_ALIASES` (e.g. `policeone_academy` → `P1A`); unmapped site → warning, not error | `mapLmsSites` |
| Accreditation parallel lists | Zipped by index across the 6 columns; length mismatch → warning, values retained | `parseParallelAccreditations` |

The full original row is retained verbatim as `rawPayload` alongside the normalized object. **Duplicate Course IDs across the 4 LMS workbooks hard-fail the import.**

### 2.2 Master metadata rows

Parser: `parseContentMetadataRow` (~line 539).

Raw columns (`CONTENT_ALIASES`, ~line 121): `Course Id`, `Course Name`, `Content Type`, `Duration (min)`, `Training Credits`, `Published`, `Authoring Tool`, `Description`, `Backend Link`, `Frontend Link`, `Published Date`, `Update Type`, `Updated`, `Verticals`, `Parent`, `Child`, `Notes`.

| Raw field | Rule |
|---|---|
| Duration (min) | Strict non-negative integer minutes; error if fractional/negative/non-numeric (`normalizeMinuteDuration`) |
| Backend Link / Frontend Link | Must be `http:`/`https:`, else validation error (`validateUrl`) |
| Verticals | Split on `,;\n`, uppercased; alias `EMS1A` → `EMS1`; unknown vertical → warning |
| Parent / Child | Normalized via `normalizeCourseId`; self-reference and circular parent/child graphs detected via DFS (`validateCourseRelationships`) |
| Course Name | The only required field |

**Duplicate Course IDs in master rows do not halt the run** — only the duplicate row is flagged `validationErrors` and excluded.

### 2.3 Reconciliation (LMS ↔ Master)

`reconcileCourseSources` (~line 801) compares 8 shared fields — `courseId, courseName, contentType, durationMinutes, trainingCredits, published, description, publishedDate` — and classifies each as `Match | Conflict | LMS only | Content Metadata only | Missing from both`. Comparison normalizes case/whitespace and truncates datetimes to date-only (`comparable()`, ~line 776). Prior manual conflict resolutions ("Use LMS" / "Keep Content Team") are preserved across re-imports.

### 2.4 Join, dedup, union

`loadCourseWorkbookDataset` in `scripts/course-workbook-loader.mjs` builds `lmsById` (last writer wins, files processed in filename-sorted order) and `metadataById`, unions IDs, and for each course computes `lms`, `metadata`, `projection` (or a synthetic projection derived from LMS when no master row exists), `comparisons`, `accreditations`, and `accreditationGroups`.

`assertCourseWorkbookBaseline()` hard-fails the run unless summary counts exactly match `config/course-data-manifest.json`'s `acceptedCounts` — see [§4](#4-validation--acceptance-gates).

### 2.5 Application projection assembly

`projectionFor` in `scripts/import-course-workbooks.mjs` (~line 52) derives the row upserted into `public.courses`:

- `appId = "LMS-{courseId}"`, `courseCode = courseId`
- Title/description/contentType/duration prefer master metadata, fall back to LMS
- `managementClassification` via `determineManagementClassification`: `"Lexipol managed"` if a valid Content-Metadata match exists → else honors a manual CourseTrack override → else `"Unclassified"`
- `projectionOrigin` = `"master_import"` if metadata present, else `"lms_export"`
- `lifecycleStatus` / `publicationStatus` derived from the `published` flag
- `reconciliationStatus` / `retrievalStatus` derived from source presence

`applyDataset()` performs the upserts and **never overwrites a field a human has edited in-app** — `keepOverride()` checks `field_provenance[key] === "coursetrack"` per field before applying a new source value. Accreditation rows are deduplicated by a SHA-256 `fingerprint` over `[courseId, index, issuingBody, state, accreditationNumber, topicNumber, startDate, endDate]`, with a legacy fallback treating `state === null` as historical `"National"`.

Staging imports redact raw payloads (`source_payload`/`raw_payload` zeroed); production retains them.

### 2.6 Wrike

`normalizeWrikeTask` in `lib/wrike-sync.ts` explicitly discards every Wrike field not tracked in the `wrike_tasks` column list — treat Wrike sync as a strict allowlist projection, not a full mirror.

## 3. Core entities (canonical shapes)

Source of truth: [`types/course.ts`](../types/course.ts) (TypeScript shapes) + `supabase/migrations/202607300001_phase1_foundation.sql` and later ALTERs (DDL). When the two disagree, the DB migration history wins for what's actually deployed; `types/course.ts` should be kept in sync with it.

| Entity | Table | Type | Notes |
|---|---|---|---|
| Course | `courses` | `Course` (types/course.ts) | Central entity: identity, classification, verticals, lifecycle/publication status, duration, training credits, health score, `dataSource`/`fieldProvenance`, `projectionOrigin`, manual-override flag, links |
| Vertical | `verticals` | — | 8 seeded verticals + synthetic `"unclassified"` |
| Course version | `course_versions` | `CourseVersion` | |
| Accreditation record | `accreditation_records` | `AccreditationRecord` / `AssessedAccreditationRecord` / `AccreditationHistoryGroup` | Grouping/risk logic in `lib/accreditation-grouping.ts` |
| Task/Callout | `course_flags` | `TaskCalloutRecord` / `CourseFlag` | Remodeled into shared Task/Callout system (`record_kind`, `completed_by`) |
| Note | `notes` | `CourseNote` | |
| Revamp proposal | `revamp_proposals` | `RevampProposal` | |
| LMS retrieval run / snapshot | `lms_retrieval_runs` / `lms_snapshots` | `LmsCourseSnapshot` / `NormalizedLmsPayload` | Immutable history |
| Content metadata record / import run | `content_metadata_records` / `content_metadata_import_runs` | `ContentMetadataRecord` | Only one `is_current=true` per course — this is the "master-import" evidence table |
| Field comparison | `field_comparisons` | `FieldComparison` / `DataComparison` | Per-field LMS-vs-Metadata-vs-App reconciliation, with `alignment_status` and hash-based confirmation tracking |
| Profile/role/permission | `profiles`, `roles`, `permissions`, `user_roles`, `role_permissions` | — | Auth/RBAC |
| Audit log | `audit_logs` | — | Append-only, all mutating RPCs write here |
| Wrike task/contact/folder | `wrike_tasks`, `wrike_contacts`, `wrike_folder_index`, `version_wrike_task_references` | `VersionWrikeTaskReference` | Strict allowlist projection of Wrike API data |

## 4. Validation & acceptance gates

- **Field-level parse/validate functions** in `lib/source-normalization.ts` return `{ value, error }` pairs collected into each record's `errors` / `validationErrors`.
- **TypeScript types** (`types/course.ts`, `types/integrations.ts`, `types/reports.ts`, `types/preferences.ts`) define canonical shapes. `lib/integration-mappings.ts` declares per-source required/read-only fields (`UPLOADED_MAPPING_REGISTRY`, `WRIKE_MAPPING_REGISTRY`, empty `LMS_MAPPING_REGISTRY`).
- **Postgres CHECK constraints / enums** on `lifecycle_status`, `health_status`, `priority`, `status`, `record_kind`, `alignment_status`, `source_domain`, `source_transport`, `projection_origin`, etc. — see migration history.
- **RLS + SECURITY DEFINER RPCs**: every mutation is routed through RPCs (`save_task_callout`, `update_course_projection_v2`, `save_accreditation_v2`, `resolve_course_field_v2`, `save_version_wrike_link`, …) that enforce permission and re-validate payload shape server-side. Optimistic concurrency via `p_expected_updated_at` (raises `'40001'` on mismatch).
- **Import baseline acceptance gate** — the actual QA gate for the whole master-import pipeline. `assertCourseWorkbookBaseline()` (dry-run) and the post-import acceptance block in `import-course-workbooks.mjs` hard-fail unless live counts exactly match `config/course-data-manifest.json`'s `acceptedCounts`. Current reviewed baseline (2026-08-04): 18,406 LMS courses, 1,952 master rows, 18,530 union courses, 1,828 linked IDs, 16,578 LMS-only, 124 master-only, 19,571 accreditation rows, 7,299 org/jurisdiction groups, 697 at-risk courses.
- **`scripts/audit-course-data.mjs`** — separate read-only staging/production auditor for post-import drift (`npm run audit:course-data -- --target=staging|production`).

**These baseline counts are a manually curated source of truth, not a computed constant — they must only change via a reviewed `config/course-data-manifest.json` update, never silently.** See the [§5](#5-known-edge-cases--gotchas) note on the August 2026 baseline revert for why.

## 5. Known edge cases & gotchas

- **Baseline miscount incident (Aug 2026):** a legitimate course archival dropped `masterImportProjections` from 1952 → 1951, which tripped the acceptance gate. The manifest was edited to 1951 (commit `5d09d2e`), then reverted back to 1952 (commit `0c1f661`, PR [#71](../../pull/71)) because the drop turned out not to be a valid baseline shift. Lesson: don't assume a gate failure means the manifest is wrong — investigate the underlying data change first.
- **`EMS1A` → `EMS1`** vertical alias is special-cased in both the master-row parser and the import run's `column_mapping` metadata.
- **Legacy `"National"` jurisdiction fallback** for accreditation records with `state === null`.
- **Accreditation parallel-list length mismatches** are tolerated with a warning, not a failure.
- **Duplicate ID handling differs by source**: duplicate LMS IDs hard-fail the import; duplicate master rows only exclude that one row.
- **Field-level provenance locking**: any field a human has edited in-app is permanently protected from being overwritten by future workbook imports.
- **Topics workbook is parsed but not consumed** by the main import pipeline — flag before relying on it.
- **LMS API and Wrike write-back are not implemented** — don't assume either exists; `LMS_MAPPING_REGISTRY` is intentionally empty pending real provider documentation.

## 6. File map

```
config/course-data-manifest.json     # Reviewed source manifest + acceptance-count baseline
Files/                                # Committed workbook source files
scripts/
  course-workbook-loader.mjs          # Parse + join + baseline assertion
  import-course-workbooks.mjs         # Dry-run/apply CLI, projection assembly, Supabase upserts, acceptance gate
  audit-course-data.mjs               # Read-only data-parity auditor
lib/
  source-normalization.ts             # Core field-level normalization + reconciliation
  accreditation-grouping.ts           # Accreditation history grouping / risk assessment
  integration-mappings.ts             # Declarative source→target field mapping registries
  wrike-sync.ts, wrike-http-client.ts, wrike-matching.ts, wrike-custom-fields.ts
types/
  course.ts                           # Canonical entity TS types
db/
  *-repository.ts                     # Data access layer per entity
supabase/migrations/*.sql             # Authoritative DDL history
docs/
  import-mapping.md                   # Import process + rollout order
  data-normalization-source-of-truth.md  # This document
```
