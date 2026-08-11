# Course data parity rollout

The canonical link backfill `202608100001` is already applied in staging and
Production. Do not add or rerun a link backfill while
`npm run audit:course-data` reports zero eligible fields and zero normalized
disagreements. The remaining Production gap is the missing LMS-export import.

The six workbooks stay under the git-ignored `Files/` directory. Only
`config/course-data-manifest.json` is committed. Every apply is target-explicit,
uses the reviewed `2026-08-06` timestamp, verifies all six file sizes and
SHA-256 hashes, validates the Supabase project ref in both API and database
URLs, and preserves CourseTrack-owned fields through `field_provenance`.

## Approval-gated Production procedure

Do this only after the repository workflows, environments, rulesets, and
controlled staging release have been configured and verified.

1. Confirm every source manifest entry has a reviewed 64-character SHA-256.
   A null hash is an intentional hard stop.
2. Verify and retain the current Supabase Production backup timestamp.
3. Capture protected application records:

   ```powershell
   npm run rollout:course-data-preflight -- --output=backups/course-data-production-before.json
   ```

4. Dry-run the exact source set:

   ```powershell
   npm run import:course-workbooks -- --target=production
   ```

5. Review the summary and apply only after the explicit approval checkpoint:

   ```powershell
   npm run import:course-workbooks:apply -- --target=production --approved-production-rollout
   ```

6. Require the safe audit to pass:

   ```powershell
   npm run audit:course-data -- --target=production --require-full-parity
   ```

Expected acceptance:

- 18,530 courses
- 18,406 current LMS snapshots
- 1,952 current metadata records
- 16,578 `lms_export` and 1,952 `master_import` projections
- 1,341 canonical backend and 1,341 canonical frontend links
- zero eligible missing link fields and zero normalized disagreements
- at least 19,571 LMS-upload accreditation sources and 513 topic numbers

The audit prints counts, migration versions, project ref, required-column
status, and optionally safe application course IDs. It never prints URLs,
titles, payloads, keys, or database credentials.

The importer never copies staging to Production. If acceptance fails, disable
promotion, preserve logs and the preflight artifact, and investigate without
rerunning. Restore only from the verified Production backup when reversal of
the import itself is required.
