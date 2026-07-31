# Source workbook import mapping

The local workbook `Files/all_courses_20260715073414 (1).xlsx` was inspected
read-only. It remains unchanged.

## Discovered sheets

- `All (comma separated)` — 16,545 data rows, 31 columns
- `By Topics`
- `By Sites`
- `By Topics and Sites` — 4,413 data rows, 31 columns

The first sheet is the recommended raw import source. The other sheets appear to
be denormalized reporting views and may duplicate courses.

## Initial mapping

| Workbook column | CourseTrack target | Rule |
| --- | --- | --- |
| Course ID | `courses.lms_course_id` | Trim; retain as external text identifier |
| Course Name | `courses.title` | Required |
| Course Type | `courses.delivery_format`/payload | Map through a controlled lookup |
| Duration | `courses.duration_minutes` | Parse explicitly; record warning on ambiguity |
| Course Description | `courses.description` | Preserve source text |
| Public Topics / Private Topics | topic relationships/payload | Split comma lists with quote-aware parsing |
| Sites | source payload | Normalize only after a controlled site vocabulary exists |
| Published Date | `courses.original_publish_date` | Parse to date; never infer timezone silently |
| Author / Owner | course owner/source payload | Resolve to profile only on an exact known match |
| Is published | `courses.publication_status` | Controlled Boolean/status mapping |
| Created Date | source payload | Retain for provenance |
| Last Revision Date | `courses.last_major_revision_date` | Parse to date |
| Accreditation fields | `accreditation_records` | Create one record per explicit accreditation row |
| Training Credits | `accreditation_records.credit_hours` | Decimal validation |
| Accreditation End Date | `accreditation_records.expiration_date` | Parse to date |

## Import controls

- Dry-run by default.
- Require a stable external ID and title.
- Detect duplicate external IDs before write.
- Report row number, source sheet, warning/error code, and raw value.
- Store a source-file hash and import correlation ID.
- Neutralize spreadsheet formulas when exporting reports.
- Never overwrite internal CourseTrack fields from a workbook refresh.
