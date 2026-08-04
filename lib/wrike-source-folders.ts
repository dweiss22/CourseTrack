/**
 * Approved top-level Wrike folders CourseTrack is allowed to read tasks
 * from. This list is intentionally code-defined (not runtime-editable) —
 * adding a folder requires a code change and an approved-folder migration update.
 * Do not query any folder outside this list (no "DO NOT USE" folders, no
 * JIRA Tickets, no Blueprints).
 */
export const WRIKE_SOURCE_FOLDERS = [
  { id: "IEACHQK7I4UOEPFL", name: "Cordico [New]" },
  { id: "IEACHQK7I4PGHAIF", name: "Custody [Maint]" },
  { id: "IEACHQK7I4QUZOFS", name: "Custody [New]" },
  { id: "IEACHQK7I45QZU3G", name: "Dispatch [New]" },
  { id: "IEACHQK7I4PGHAD7", name: "EMS [Maint]" },
  { id: "IEACHQK7I4SCO46Z", name: "EMS [New]" },
  { id: "IEACHQK7I4PGHBAC", name: "Fire [Maint]" },
  { id: "IEACHQK7I4N7GGRM", name: "Fire [New]" },
  { id: "IEACHQK7I4PGHACI", name: "Law Enforcement [Maint]" },
  { id: "IEACHQK7I4N7GGQ4", name: "Law Enforcement [New]" },
  { id: "IEACHQK7I4PGG7Z2", name: "Local Gov [Maint]" },
  { id: "IEACHQK7I4SCPAAB", name: "Local Gov [New]" },
  { id: "IEACHQK7I4N7GGRB", name: "Non-Vertical Content Projects [Maint]" },
] as const;

export type WrikeSourceFolder = (typeof WRIKE_SOURCE_FOLDERS)[number];

const APPROVED_FOLDER_IDS = new Set<string>(WRIKE_SOURCE_FOLDERS.map((folder) => folder.id));

export function isApprovedWrikeFolderId(folderId: string): boolean {
  return APPROVED_FOLDER_IDS.has(folderId);
}
