/**
 * Pure helpers for turning Wrike's opaque custom-field ids into human-readable
 * values. Wrike returns custom fields on a task as `[{ id, value }]` with no
 * title -- the titles only exist in the account-level catalogue served by
 * GET /api/v4/customfields.
 *
 * This module is deliberately free of server-only imports (no HTTP client, no
 * Supabase, no next/headers) so the types can be re-exported through `@/db`
 * and type-imported by client components without dragging the server graph
 * into the browser bundle. The network fetch lives in db/wrike-repository.ts
 * and the cache in lib/wrike-custom-field-cache.ts.
 */

export interface WrikeCustomFieldDefinition {
  id: string;
  title: string;
  type: string;
}

export interface WrikeResolvedCustomField {
  id: string;
  name: string;
  type: string;
  value: string;
}

export interface WrikeRawCustomField {
  id: string;
  value: string;
}

/**
 * Wrike custom-field types whose *values* are safe to render directly.
 *
 * `Contacts` and `LinkToDatabase` are deliberately excluded: their values are
 * raw Wrike ids (e.g. "KUAAAAAA"), so resolving the field name alone would
 * still leak an opaque id into the UI. Unrecognized types drop for the same
 * reason -- we only render values we know are display text.
 */
export const RENDERABLE_WRIKE_CUSTOM_FIELD_TYPES = [
  "Text",
  "DropDown",
  "Multiple",
  "Numeric",
  "Percentage",
  "Currency",
  "Duration",
  "Date",
  "Checkbox",
  "CalculatedNumeric",
  "CalculatedDate",
] as const;

const RENDERABLE_TYPE_SET = new Set<string>(
  RENDERABLE_WRIKE_CUSTOM_FIELD_TYPES.map((type) => type.toLowerCase()),
);

/**
 * Custom-field titles that carry a task's reporting year, normalized for
 * comparison. Wrike has no field literally named "Reporting Year"; the value
 * lives in the LCT reporting dropdowns as text like "2026 Courses" or
 * "2024 Report", which parseReportingYear reduces to the year.
 *
 * Matching is exact, never substring: the same account defines several
 * similarly named fields -- "LCT Reporting", "Assigned SME_LCT Reporting",
 * "Q1 Priority_LCT reporting", "Course Name_LCT Reporting" and others -- none
 * of which carry a reporting year.
 *
 * The (M) and (L) variants are mutually exclusive in practice: across 1000
 * sampled production tasks, 75 carried (M), 237 carried (L), and none carried
 * both, so the agreement rule below is never forced to arbitrate between them.
 */
const REPORTING_YEAR_TITLES = new Set([
  "reporting year",
  "[lct] reporting (m)",
  "[lct] reporting (l)",
]);
const MIN_REPORTING_YEAR = 1900;
const MAX_REPORTING_YEAR = 2100;

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCustomFieldTitle(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Reads the `custom_fields` jsonb column (or a Wrike task payload's
 * `customFields`) defensively. Anything that is not a `{ id, value }` pair with
 * a non-blank string id is dropped rather than trusted.
 */
export function readRawCustomFields(value: unknown): WrikeRawCustomField[] {
  if (!Array.isArray(value)) return [];
  const fields: WrikeRawCustomField[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const id = trimmedString((entry as { id?: unknown }).id);
    if (!id) continue;
    const raw = (entry as { value?: unknown }).value;
    fields.push({ id, value: typeof raw === "string" ? raw : "" });
  }
  return fields;
}

export function findCustomFieldValueById(value: unknown, fieldId: string): string | null {
  const wanted = fieldId.trim();
  if (!wanted) return null;
  const match = readRawCustomFields(value).find((field) => field.id === wanted);
  const trimmed = match?.value.trim() ?? "";
  return trimmed || null;
}

/**
 * Parses Wrike's standard `{ kind, data }` envelope (a bare array is also
 * accepted so callers can pass an already-unwrapped payload). Records missing a
 * usable id or title are rejected outright -- a definition with no title cannot
 * produce a human-readable name, and keeping it would only enable an
 * "Unknown field" placeholder downstream. Duplicate ids keep the first record.
 */
export function normalizeWrikeCustomFieldDefinitions(raw: unknown): WrikeCustomFieldDefinition[] {
  const records = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
      ? ((raw as { data: unknown[] }).data)
      : [];

  const seen = new Set<string>();
  const definitions: WrikeCustomFieldDefinition[] = [];
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const id = trimmedString((record as { id?: unknown }).id);
    const title = trimmedString((record as { title?: unknown }).title);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    definitions.push({ id, title, type: trimmedString((record as { type?: unknown }).type) });
  }
  return definitions;
}

export function buildCustomFieldIndex(
  definitions: WrikeCustomFieldDefinition[],
): Map<string, WrikeCustomFieldDefinition> {
  return new Map(definitions.map((definition) => [definition.id, definition]));
}

export function isRenderableCustomFieldType(type: string): boolean {
  return RENDERABLE_TYPE_SET.has(type.trim().toLowerCase());
}

/**
 * Presents a stored value as display text. Wrike sends checkbox values as
 * "true"/"false" and date values as full timestamps; everything else is already
 * the displayed string (dropdown labels included).
 */
export function formatCustomFieldValue(type: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalizedType = type.trim().toLowerCase();
  if (normalizedType === "checkbox") {
    if (trimmed.toLowerCase() === "true") return "Yes";
    if (trimmed.toLowerCase() === "false") return "No";
    return trimmed;
  }
  if (normalizedType === "date" || normalizedType === "calculateddate") {
    return /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)?.[1] ?? trimmed;
  }
  return trimmed;
}

/**
 * Joins a task's raw custom fields to the account catalogue. Anything that
 * cannot be presented safely is dropped: unknown ids, definitions with no
 * usable title, non-renderable types, and blank values. The result never
 * contains a raw field id as a name and never contains a placeholder.
 */
export function resolveTaskCustomFields(
  index: Map<string, WrikeCustomFieldDefinition>,
  raw: unknown,
): WrikeResolvedCustomField[] {
  const resolved: WrikeResolvedCustomField[] = [];
  for (const field of readRawCustomFields(raw)) {
    const definition = index.get(field.id);
    if (!definition) continue;
    const name = definition.title.trim();
    if (!name || name === field.id) continue;
    if (!isRenderableCustomFieldType(definition.type)) continue;
    const value = formatCustomFieldValue(definition.type, field.value);
    if (!value) continue;
    resolved.push({ id: field.id, name, type: definition.type, value });
  }
  return resolved;
}

/**
 * Conservatively reads a four-digit year out of a custom-field value. Handles
 * plain text ("2026"), date fields ("2026-01-01T00:00:00") and dropdown labels
 * ("FY2026", "2026 - Q1"). Never falls back to the raw value -- returning an
 * unparsed string here is exactly how an opaque id would reach the UI.
 */
export function parseReportingYear(value: unknown): string | null {
  const trimmed = trimmedString(value);
  if (!trimmed) return null;

  const candidate =
    /^(\d{4})$/.exec(trimmed)?.[1] ??
    /^(\d{4})-\d{2}-\d{2}/.exec(trimmed)?.[1] ??
    // Digit lookaround rather than \b: "FY2026" must match (the boundary is a
    // letter, not a word break) while "12026" and "20261" must not.
    /(?<![0-9])((?:19|20)\d{2})(?![0-9])/.exec(trimmed)?.[1] ??
    null;
  if (!candidate) return null;

  const year = Number(candidate);
  if (year < MIN_REPORTING_YEAR || year > MAX_REPORTING_YEAR) return null;
  return candidate;
}

/**
 * Resolves the Reporting Year for one task.
 *
 * Tier A: an explicitly configured field id (WRIKE_REPORTING_YEAR_FIELD_ID),
 * mirroring the existing WRIKE_VERSION_PUBLISHED_DATE_FIELD_ID mechanism. This
 * reads the already-synchronized jsonb and needs no Wrike call at all.
 *
 * Tier B: definitions whose title normalizes to "reporting year". Titles are
 * not unique across Wrike spaces, so when several matching fields carry
 * conflicting values on the same task we return null -- showing the wrong year
 * is worse than showing none.
 */
export function extractReportingYear(input: {
  raw: unknown;
  index?: Map<string, WrikeCustomFieldDefinition>;
  configuredFieldId?: string | null;
}): string | null {
  const configuredFieldId = (input.configuredFieldId ?? "").trim();
  if (configuredFieldId) {
    const configured = parseReportingYear(findCustomFieldValueById(input.raw, configuredFieldId));
    if (configured) return configured;
  }

  const index = input.index;
  if (!index) return null;

  const years = new Set<string>();
  for (const field of readRawCustomFields(input.raw)) {
    const definition = index.get(field.id);
    if (!definition) continue;
    if (!REPORTING_YEAR_TITLES.has(normalizeCustomFieldTitle(definition.title))) continue;
    const year = parseReportingYear(field.value);
    if (year) years.add(year);
  }
  if (years.size !== 1) return null;
  return [...years][0] ?? null;
}
