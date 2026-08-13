export const courseLibraryOptionalColumns = [
  "verticals",
  "managementClassification",
  "updateType",
  "lmsLinkStatus",
  "retrievalStatus",
  "conflictCount",
  "topicAssignments",
  "healthStatus",
  "lmsActions",
] as const;

export type CourseLibraryOptionalColumn = (typeof courseLibraryOptionalColumns)[number];

export interface CourseLibraryPreferences {
  visibleColumns: CourseLibraryOptionalColumn[];
}

export const DEFAULT_COURSE_LIBRARY_PREFERENCES: CourseLibraryPreferences = {
  visibleColumns: [
    "verticals",
    "managementClassification",
    "updateType",
    "lmsLinkStatus",
    "retrievalStatus",
    "healthStatus",
    "lmsActions",
  ],
};

export const accreditationOptionalColumns = ["organization", "jurisdiction", "status", "historyRole", "effective", "expiration", "source"] as const;
export type AccreditationOptionalColumn = (typeof accreditationOptionalColumns)[number];
export interface AccreditationTablePreferences { visibleColumns: AccreditationOptionalColumn[]; }
export const DEFAULT_ACCREDITATION_TABLE_PREFERENCES: AccreditationTablePreferences = { visibleColumns: ["organization", "jurisdiction", "status", "historyRole", "expiration"] };

export const versionsOptionalColumns = ["status", "published", "type", "authoring", "standard"] as const;
export type VersionsOptionalColumn = (typeof versionsOptionalColumns)[number];
export interface VersionsTablePreferences { visibleColumns: VersionsOptionalColumn[]; }
export const DEFAULT_VERSIONS_TABLE_PREFERENCES: VersionsTablePreferences = { visibleColumns: ["status", "published", "type", "standard"] };
