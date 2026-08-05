# Workbook imports

Workbook files and parsed row payloads are immutable **Uploaded** sources. Each import run records its actor, time, checksum, validation results, and counts. Importing updates the application projection without overwriting raw values or prior runs.

Legacy `sample`, `import`, and workbook-derived `lms` values backfill to `uploaded`; legacy `manual` values backfill to `coursetrack`. Editing an Uploaded projection field changes only that field's current provenance to CourseTrack. Stable LMS identity, calculated fields, raw uploads, snapshots, and import/audit history remain locked.

Normalization trims values for comparison while retaining raw text. Accreditation grouping additionally collapses organization and jurisdiction whitespace/case. Equivalent accreditation rows remain in history and the newest audit row is labeled canonical.

## Course library baseline import

The committed `Files/all_*` workbooks are the LMS baseline. The adapter reads only `All (comma separated)` from `all_Standard Courses.xlsx` and `Sheet1` from the other `all_*` files. `Files/LMS new list - master.xlsx` supplies the initial CourseTrack projection. Unknown columns are ignored, headers are normalized, and the vertical alias `EMS1A` is stored as `EMS1`.

Run the non-writing acceptance check first:

```powershell
npm run import:course-workbooks
```

The command must report 18,406 LMS courses, 1,952 master rows, 18,530 union courses, 1,828 linked IDs, 16,578 LMS-only records, 124 master-only records, six initial comparable differences, 19,571 accreditation rows, 7,299 organization/jurisdiction groups, and 697 at-risk courses for 2026-08-04. Any count mismatch or duplicate course ID stops the import.

Apply mode requires a server-only Supabase secret in the target environment:

```powershell
npm run import:course-workbooks:apply
```

Apply mode is intentionally idempotent. Course IDs remain stable, manual CourseTrack overrides are skipped, source fingerprints prevent duplicate LMS accreditation rows, and each workbook run appends immutable raw metadata and LMS snapshot history.

## Rollout order

1. Back up the target Supabase database and record the restore point.
2. Apply all migrations, including `202608040008_course_data_cleanup.sql`.
3. Run dry-run locally against the committed workbooks and verify the exact acceptance counts above.
4. Point server-only environment variables at staging and run apply mode.
5. Validate course editing/comparisons, accreditation risk, saved columns, permanent workflow deletion, and Revamp movement in the staging deployment.
6. Repeat the backup, migration, dry-run, apply, and smoke-test sequence for production only after staging approval.
