import type { DataAlignmentStatus } from "@/types/course";

export const ALIGNMENT_DEFINITIONS: Readonly<Record<DataAlignmentStatus, string>> = Object.freeze({
  "In sync": "The LMS value, uploaded metadata, and current CourseTrack value agree after normalization. No action is required.",
  "App only": "This field is owned by CourseTrack or has no corresponding LMS-managed value. No LMS update is required.",
  "Manually confirmed": "A user confirmed that the LMS was updated to match the current CourseTrack value. The confirmation remains in the audit history.",
  "Pending LMS update": "CourseTrack contains an approved value that does not yet match the LMS. Update the LMS, then confirm the change.",
  "Missing metadata": "No current importable uploaded metadata value is available for this field. Review the source workbook or mapping.",
  "Mapping required": "The source value cannot be compared reliably until its field or value mapping is resolved.",
});
