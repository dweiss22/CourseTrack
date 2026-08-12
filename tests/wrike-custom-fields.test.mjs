import "../scripts/register-aliases.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

const {
  buildCustomFieldIndex,
  extractReportingYear,
  findCustomFieldValueById,
  formatCustomFieldValue,
  normalizeWrikeCustomFieldDefinitions,
  parseReportingYear,
  readRawCustomFields,
  resolveTaskCustomFields,
} = await import("../lib/wrike-custom-fields.ts");

const PLACEHOLDER_PATTERN = /unknown|unidentified|undefined|\bfield\s*[<[]?[A-Z0-9]/i;

function indexOf(...definitions) {
  return buildCustomFieldIndex(normalizeWrikeCustomFieldDefinitions(definitions));
}

test("normalizeWrikeCustomFieldDefinitions parses Wrike's {kind, data} envelope and rejects malformed records", () => {
  const parsed = normalizeWrikeCustomFieldDefinitions({
    kind: "customFields",
    data: [
      { id: "IEACW7ABJUAAAAAA", title: "Reporting Year", type: "Text" },
      { id: "IEACW7ABJUAAAAAB", title: "  Course Owner  ", type: "Text" },
      { id: "IEACW7ABJUAAAAAC", title: "", type: "Text" },
      { id: "   ", title: "Blank id", type: "Text" },
      { title: "No id at all", type: "Text" },
      { id: "IEACW7ABJUAAAAAD", type: "Text" },
      { id: 12345, title: "Numeric id", type: "Text" },
      { id: "IEACW7ABJUAAAAAE", title: "No type given" },
      null,
      "not an object",
    ],
  });
  assert.deepEqual(parsed, [
    { id: "IEACW7ABJUAAAAAA", title: "Reporting Year", type: "Text" },
    { id: "IEACW7ABJUAAAAAB", title: "Course Owner", type: "Text" },
    { id: "IEACW7ABJUAAAAAE", title: "No type given", type: "" },
  ]);
});

test("normalizeWrikeCustomFieldDefinitions accepts a bare array, deduplicates by id, and never throws", () => {
  const deduped = normalizeWrikeCustomFieldDefinitions([
    { id: "IEA1", title: "First wins", type: "Text" },
    { id: "IEA1", title: "Second loses", type: "DropDown" },
    { id: "IEA2", title: "Kept", type: "Text" },
  ]);
  assert.deepEqual(deduped.map((definition) => definition.title), ["First wins", "Kept"]);

  for (const malformed of [null, undefined, {}, "x", 7, { data: "not an array" }, { kind: "customFields" }]) {
    assert.deepEqual(normalizeWrikeCustomFieldDefinitions(malformed), []);
  }
});

test("readRawCustomFields and findCustomFieldValueById guard the stored jsonb defensively", () => {
  assert.deepEqual(readRawCustomFields([{ id: "IEA1", value: "2026" }, { id: "  ", value: "x" }, null, { value: "no id" }]), [
    { id: "IEA1", value: "2026" },
  ]);
  for (const malformed of [null, undefined, "[]", {}, 5]) {
    assert.deepEqual(readRawCustomFields(malformed), []);
  }
  assert.equal(findCustomFieldValueById([{ id: "IEA1", value: " 2026 " }], "IEA1"), "2026");
  assert.equal(findCustomFieldValueById([{ id: "IEA1", value: "   " }], "IEA1"), null);
  assert.equal(findCustomFieldValueById([{ id: "IEA1", value: "2026" }], "IEA9"), null);
  assert.equal(findCustomFieldValueById([{ id: "IEA1", value: "2026" }], "  "), null);
});

test("resolveTaskCustomFields renders only human-readable names and never leaks raw field ids", () => {
  const index = indexOf(
    { id: "IEACW7ABJUAAAAAA", title: "Reporting Year", type: "Text" },
    { id: "IEACW7ABJUAAAAAB", title: "Course Owner", type: "DropDown" },
    { id: "IEACW7ABJUAAAAAC", title: "Blank value field", type: "Text" },
    { id: "IEACW7ABJUAAAAAD", title: "Reviewers", type: "Contacts" },
    { id: "IEACW7ABJUAAAAAE", title: "Source record", type: "LinkToDatabase" },
    { id: "IEACW7ABJUAAAAAF", title: "Future type", type: "SomethingNew" },
    { id: "IEACW7ABJUAAAAAG", title: "IEACW7ABJUAAAAAG", type: "Text" },
  );
  const resolved = resolveTaskCustomFields(index, [
    { id: "IEACW7ABJUAAAAAA", value: "2026" },
    { id: "IEACW7ABJUAAAAAB", value: "Content team" },
    { id: "IEACW7ABJUAAAAAC", value: "   " },
    { id: "IEACW7ABJUAAAAAD", value: "KUAAAAAA,KUAAAAAB" },
    { id: "IEACW7ABJUAAAAAE", value: "REC-000123" },
    { id: "IEACW7ABJUAAAAAF", value: "opaque" },
    { id: "IEACW7ABJUAAAAAG", value: "self-titled" },
    { id: "IEACW7ABJUAAAAZZ", value: "never synchronized definition" },
  ]);

  assert.deepEqual(resolved, [
    { id: "IEACW7ABJUAAAAAA", name: "Reporting Year", type: "Text", value: "2026" },
    { id: "IEACW7ABJUAAAAAB", name: "Course Owner", type: "DropDown", value: "Content team" },
  ]);
  for (const field of resolved) {
    assert.notEqual(field.name, field.id, "a field name must never be the raw Wrike id");
    assert.doesNotMatch(field.name, PLACEHOLDER_PATTERN, "no placeholder names");
    assert.doesNotMatch(field.value, PLACEHOLDER_PATTERN, "no placeholder values");
    assert.ok(field.value.trim().length > 0, "blank values must be dropped");
  }
  assert.deepEqual(resolveTaskCustomFields(new Map(), [{ id: "IEA1", value: "2026" }]), []);
});

test("formatCustomFieldValue presents checkbox and date values as display text", () => {
  assert.equal(formatCustomFieldValue("Checkbox", "true"), "Yes");
  assert.equal(formatCustomFieldValue("Checkbox", "false"), "No");
  assert.equal(formatCustomFieldValue("Date", "2026-03-04T00:00:00"), "2026-03-04");
  assert.equal(formatCustomFieldValue("CalculatedDate", "2026-03-04"), "2026-03-04");
  assert.equal(formatCustomFieldValue("Text", "  spaced  "), "spaced");
  assert.equal(formatCustomFieldValue("Text", "   "), "");
});

test("parseReportingYear preserves valid years and refuses everything else", () => {
  assert.equal(parseReportingYear("2026"), "2026");
  assert.equal(parseReportingYear("  2026  "), "2026");
  assert.equal(parseReportingYear("2026-01-01T00:00:00"), "2026");
  assert.equal(parseReportingYear("FY2026"), "2026");
  assert.equal(parseReportingYear("2026 - Q1"), "2026");

  for (const invalid of ["", "   ", null, undefined, 2026, "IEACW7ABJUAAAAAA", "12345", "1899", "2101", "not a year", "20", "12026", "20261"]) {
    assert.equal(parseReportingYear(invalid), null, `${String(invalid)} should not parse as a reporting year`);
  }
});

test("extractReportingYear prefers the configured field id and matches titles case-insensitively", () => {
  const index = indexOf(
    { id: "IEA-CONFIGURED", title: "Fiscal reporting window", type: "Text" },
    { id: "IEA-TITLED", title: "  reporting YEAR  ", type: "DropDown" },
  );
  const raw = [
    { id: "IEA-CONFIGURED", value: "2026" },
    { id: "IEA-TITLED", value: "2024" },
  ];

  assert.equal(extractReportingYear({ raw, index, configuredFieldId: "IEA-CONFIGURED" }), "2026");
  assert.equal(extractReportingYear({ raw, index, configuredFieldId: "  " }), "2024");
  assert.equal(extractReportingYear({ raw, index }), "2024");
  // Configured id present but unparseable on this task -- fall back to the title match.
  assert.equal(
    extractReportingYear({ raw: [{ id: "IEA-CONFIGURED", value: "n/a" }, { id: "IEA-TITLED", value: "2027" }], index, configuredFieldId: "IEA-CONFIGURED" }),
    "2027",
  );
});

test("extractReportingYear returns null for missing, blank, malformed, and conflicting values", () => {
  const index = indexOf({ id: "IEA-TITLED", title: "Reporting Year", type: "Text" });
  assert.equal(extractReportingYear({ raw: [], index }), null, "missing");
  assert.equal(extractReportingYear({ raw: [{ id: "IEA-TITLED", value: "   " }], index }), null, "blank");
  assert.equal(extractReportingYear({ raw: [{ id: "IEA-TITLED", value: "IEACW7ABJUAAAAAA" }], index }), null, "malformed");
  assert.equal(extractReportingYear({ raw: [{ id: "IEA-OTHER", value: "2026" }], index }), null, "unknown field id");
  assert.equal(extractReportingYear({ raw: null, index }), null, "malformed jsonb");
  assert.equal(extractReportingYear({ raw: [{ id: "IEA-TITLED", value: "2026" }] }), null, "no definitions available");

  // Wrike titles are not unique across spaces: conflicting matches must not
  // guess, but matches that agree are safe.
  const colliding = indexOf(
    { id: "IEA-A", title: "Reporting Year", type: "Text" },
    { id: "IEA-B", title: "reporting year", type: "DropDown" },
  );
  assert.equal(extractReportingYear({ raw: [{ id: "IEA-A", value: "2026" }, { id: "IEA-B", value: "2024" }], index: colliding }), null);
  assert.equal(extractReportingYear({ raw: [{ id: "IEA-A", value: "2026" }, { id: "IEA-B", value: "2026" }], index: colliding }), "2026");
});

test("the custom-field catalogue is read GET-only from the configured, validated Wrike host", async () => {
  const repository = await source("db/wrike-repository.ts");
  const client = await source("lib/wrike-http-client.ts");

  assert.match(repository, /export async function listWrikeCustomFieldDefinitions/);
  assert.match(repository, /path: "\/api\/v4\/customfields"/);
  assert.match(repository, /apiHost: connection\.apiHost/, "the host must come from the stored, validated connection");
  assert.doesNotMatch(repository, /www\.wrike\.com/, "the API host must never be hardcoded");
  assert.doesNotMatch(repository, /method:\s*"(POST|PUT|PATCH|DELETE)"/, "Wrike access stays read-only");

  // Interactive fallback path: no retry storm, and a bounded wall-clock budget.
  const start = repository.indexOf("async function fetchWrikeCustomFieldDefinitions");
  assert.ok(start >= 0, "fetchWrikeCustomFieldDefinitions should exist");
  const body = repository.slice(start, repository.indexOf("\n/**", start));
  assert.match(body, /maxRetries: 0/);
  assert.match(body, /timeoutMs: 4_?000/);
  assert.match(body, /getCachedCustomFieldDefinitions/);
  assert.match(body, /normalizeWrikeCustomFieldDefinitions/);

  // The shared client still validates the host before any fetch and stays GET.
  assert.match(client, /assertValidWrikeApiHost\(input\.apiHost\)/);
  assert.match(client, /method:\s*"GET"/);
});

test("candidate enrichment cannot fail the search and keeps the Wrike call out of the route", async () => {
  const repository = await source("db/wrike-repository.ts");
  const searchRoute = await source("app/api/course-versions/[id]/wrike/search/route.ts");

  const start = repository.indexOf("async function enrichWrikeCandidatesWithCustomFields");
  assert.ok(start >= 0, "enrichWrikeCandidatesWithCustomFields should exist");
  const body = repository.slice(start, repository.indexOf("\nexport async function searchWrikeTaskIndex", start));
  assert.match(body, /catch/, "both reads must be individually isolated");
  assert.match(body, /WRIKE_REPORTING_YEAR_FIELD_ID/, "the offline tier must not depend on a Wrike call");
  assert.match(body, /extractReportingYear/);
  assert.match(body, /resolveTaskCustomFields/);

  // Discovery must keep calling Wrike from the repository, never from the route.
  assert.doesNotMatch(searchRoute, /callWrikeApi|fetch\s*\(.*wrike/i);
});

test("the internal custom-fields endpoint is authenticated, read-only, and returns no credentials", async () => {
  const route = await source("app/api/wrike/custom-fields/route.ts");
  assert.match(route, /requireApiRole\("super_admin", "admin", "content"\)/, "same permissions as Wrike task search");
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /accessToken|access_token|WRIKE_PERMANENT_TOKEN|Bearer/, "no credential ever leaves this route");
  assert.doesNotMatch(route, /callWrikeApi/, "provider access goes through the repository");
  assert.match(route, /NextResponse\.json\(\{ definitions \}\)/, "only normalized definitions are returned");
  assert.match(route, /Wrike custom fields are unavailable right now/, "errors are redacted to a fixed message");
});

test("Reporting Year is surfaced in the candidate UI without raw ids or disclosure widgets", async () => {
  const control = await source("components/wrike-task-link-control.tsx");
  const start = control.indexOf('className="wrike-candidate-list"');
  assert.ok(start >= 0, "the candidate list should exist");
  const candidateList = control.slice(start, control.indexOf("</ul>", start));

  assert.match(candidateList, /Reporting year: \{candidate\.reportingYear \?\? "not set"\}/);
  // <details>/<summary> is interactive content: invalid inside the option
  // button and it would hijack candidate selection.
  assert.doesNotMatch(candidateList, /<details|<summary/);
  assert.doesNotMatch(candidateList, /candidate\.customFields/, "unresolved custom fields must not reach the option");
  assert.doesNotMatch(control, /Unknown field|Unidentified field/i);
});

test("the custom-field catalogue is synchronized locally by the scheduled Wrike sync", async () => {
  const migration = await source("supabase/migrations/202608120001_wrike_custom_field_index.sql");
  const repository = await source("db/wrike-repository.ts");

  // Additive reference-data table following the wrike_contacts pattern.
  assert.match(migration, /create table if not exists public\.wrike_custom_field_index/);
  assert.match(migration, /field_id text primary key/);
  assert.match(migration, /alter table public\.wrike_custom_field_index enable row level security/);
  assert.match(migration, /wrike_custom_field_index_read[\s\S]*has_permission\('courses:view'\)/);
  assert.match(migration, /wrike_custom_field_index_admin_write[\s\S]*has_permission\('administration:manage'\)/);
  assert.doesNotMatch(migration, /drop table|alter table public\.wrike_(tasks|contacts|folder_index)|drop function/i);

  // The sync writes it alongside the other reference data.
  const syncStart = repository.indexOf("export async function runWrikeSync");
  const syncBody = repository.slice(syncStart, repository.indexOf("\n/**", syncStart));
  assert.match(syncBody, /path: "\/api\/v4\/customfields"/);
  assert.match(syncBody, /from\("wrike_custom_field_index"\)\.upsert/);
  assert.match(syncBody, /onConflict: "field_id"/);
  // Field titles are decoration: losing them must never fail a task sync.
  assert.match(syncBody, /path: "\/api\/v4\/customfields"[\s\S]{0,400}?\.catch\(\(\) => \[\]/);
});

test("custom-field resolution prefers the local index and only falls back to a live read", async () => {
  const repository = await source("db/wrike-repository.ts");
  const start = repository.indexOf("export async function listWrikeCustomFieldDefinitions");
  assert.ok(start >= 0, "listWrikeCustomFieldDefinitions should exist");
  const body = repository.slice(start, repository.indexOf("\n\n/**", start));

  const indexIndex = body.indexOf("readWrikeCustomFieldIndex");
  const liveIndex = body.indexOf("fetchWrikeCustomFieldDefinitions");
  assert.ok(indexIndex >= 0 && liveIndex >= 0, "both sources should be used");
  assert.ok(indexIndex < liveIndex, "the local index must be consulted before any Wrike request");
  assert.match(body, /CUSTOM_FIELD_INDEX_STALE_AFTER_MS/, "a stale local copy should trigger the fallback");
  // A stale local copy still beats no field names at all.
  assert.match(body, /live\.length > 0 \? live : indexed\.definitions/);
  assert.match(repository, /readWrikeCustomFieldIndex[\s\S]*from\("wrike_custom_field_index"\)/);
});

test("the new migration is appended to the manifest with a matching checksum", async () => {
  const manifest = JSON.parse(await source("supabase/migrations/manifest.json"));
  const entry = manifest.migrations.at(-1);
  assert.equal(entry.version, "202608120001");
  assert.equal(entry.file, "202608120001_wrike_custom_field_index.sql");

  const bytes = await readFile(new URL(`supabase/migrations/${entry.file}`, root));
  const text = bytes.toString("utf8").replace(/\r\n/g, "\n");
  const digests = new Set([
    createHash("sha256").update(bytes).digest("hex"),
    createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex"),
    createHash("sha256").update(Buffer.from(text.replace(/\n/g, "\r\n"), "utf8")).digest("hex"),
  ]);
  assert.ok(digests.has(entry.sha256), "the manifest checksum must match the migration file");

  // Append-only: reviewed history and the production baseline are untouched.
  assert.equal(manifest.productionBaseline.coversThrough, "202608040007");
  const versions = manifest.migrations.map((item) => item.version);
  assert.deepEqual(versions, [...versions].sort(), "manifest versions must be strictly increasing");
});

test("the optional Reporting Year field id is documented", async () => {
  const [envExample, docs] = await Promise.all([source(".env.example"), source("docs/wrike-setup.md")]);
  assert.match(envExample, /WRIKE_REPORTING_YEAR_FIELD_ID/);
  assert.match(docs, /WRIKE_REPORTING_YEAR_FIELD_ID/);
});
