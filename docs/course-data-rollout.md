# Course data repair rollout

Run this sequence against staging first. Do not publish the new application build against a database that has not received both migrations.

1. Create a restorable Supabase database backup using the platform backup tooling.
2. Capture the protected application records and checksums before any migration:

   ```powershell
   npm run rollout:course-data-preflight
   ```

   The command writes a timestamped, git-ignored JSON file under `backups/`. Store that artifact with the database backup. It includes versions, Wrike references, manual course overrides, notes, audit rows, and source-table counts.
3. Apply `202608040008_course_data_cleanup.sql`, then `202608050001_course_data_repair_and_comparison.sql`.
4. Run the workbook import first without `--apply`. Confirm the reconciliation summary is exactly:

   - 18,530 unique courses
   - 18,406 LMS rows
   - 1,952 metadata rows
   - 1,828 matched courses
   - 16,578 LMS-only courses
   - 124 metadata-only courses
   - 19,571 accreditation rows
   - 513 topic numbers
   - 8 initial shared-field conflicts

5. Run `npm run import:course-workbooks:apply`. The importer aborts when the post-import acceptance counts differ. It backfills matching accreditation rows by deterministic fingerprint, inserts missing source rows, and does not delete ambiguous rows.
6. Re-run the preflight command with an explicit post-import filename and compare protected-record counts and checksums:

   ```powershell
   npm run rollout:course-data-preflight -- --output=backups/course-data-post-import.json
   ```

7. Verify representative course, accreditation, version, LMS-link, and Wrike-link records. Then run `npm run typecheck`, `npx vitest run`, and `npm run build`.
8. Publish staging and complete user acceptance testing. Repeat the backed-up sequence in production only after staging approval.

Switching LMS authority to API mode is a separate operation. The database rejects that switch until the connector is marked healthy and a successful API snapshot is recorded.
