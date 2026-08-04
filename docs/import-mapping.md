# Workbook imports

Workbook files and parsed row payloads are immutable **Uploaded** sources. Each import run records its actor, time, checksum, validation results, and counts. Importing updates the application projection without overwriting raw values or prior runs.

Legacy `sample`, `import`, and workbook-derived `lms` values backfill to `uploaded`; legacy `manual` values backfill to `coursetrack`. Editing an Uploaded projection field changes only that field's current provenance to CourseTrack. Stable LMS identity, calculated fields, raw uploads, snapshots, and import/audit history remain locked.

Normalization trims values for comparison while retaining raw text. Accreditation grouping additionally collapses organization and jurisdiction whitespace/case. Equivalent accreditation rows remain in history and the newest audit row is labeled canonical.
