export const courseLibraryOptionalColumns = [
  "primaryVertical",
  "managementClassification",
  "reconciliationStatus",
  "retrievalStatus",
  "conflictCount",
  "topicAssignments",
  "healthStatus",
] as const;

export type CourseLibraryOptionalColumn = (typeof courseLibraryOptionalColumns)[number];

export interface CourseLibraryPreferences {
  visibleColumns: CourseLibraryOptionalColumn[];
}

export const DEFAULT_COURSE_LIBRARY_PREFERENCES: CourseLibraryPreferences = {
  visibleColumns: [
    "primaryVertical",
    "managementClassification",
    "reconciliationStatus",
    "retrievalStatus",
    "healthStatus",
  ],
};
