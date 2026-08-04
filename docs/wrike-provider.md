# Wrike connector

Wrike is an optional, read-only reference connector. CourseTrack may discover and cache approved task fields and link a task reference to a CourseTrack version. It never creates, edits, completes, assigns, or deletes Wrike work.

The connector is unavailable until explicitly configured. Known legacy references labeled `Mock Wrike` are soft-unlinked by the operational cleanup migration; ambiguous references are retained for review. The cleanup report records affected and untouched rows.

Version history and current-version selection remain CourseTrack-owned regardless of Wrike availability.
