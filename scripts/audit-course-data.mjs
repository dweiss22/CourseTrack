import path from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { assertTarget, assertTargetConfiguration, valueFor } from "./release-target.mjs";

const REQUIRED_COLUMNS = Object.freeze([
  "backend_link",
  "frontend_link",
  "field_provenance",
  "projection_origin",
]);

async function loadEnvFile(fileName) {
  try {
    const content = await readFile(fileName, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = /^([^#=]+)=(.*)$/.exec(line);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function numeric(row, key) {
  return Number(row?.[key] ?? 0);
}

export async function auditCourseData(options = {}) {
  const target = assertTarget(options.target);
  if (options.loadEnvironment !== false) await loadEnvFile(path.resolve(".env.local"));
  const environment = options.environment || process.env;
  const databaseUrl = options.databaseUrl
    || environment.COURSETRACK_MIGRATION_DATABASE_URL
    || environment.COURSETRACK_SCHEMA_DATABASE_URL;
  const supabaseUrl = options.supabaseUrl || environment.SUPABASE_URL || environment.NEXT_PUBLIC_SUPABASE_URL;
  if (!databaseUrl) throw new Error("A target-specific course-data audit database URL is required.");
  const identity = assertTargetConfiguration({ target, databaseUrl, supabaseUrl, environment });
  const client = options.client || new pg.Client({ connectionString: databaseUrl });
  if (!options.client) await client.connect();
  try {
    await client.query("begin read only");
    await client.query("set local statement_timeout = '60s'");
    const [countsResult, columnsResult, migrationsResult, originsResult, idsResult] = await Promise.all([
      client.query(`
        with current_metadata as (
          select distinct on (course_id)
            course_id,
            nullif(btrim(normalized_payload->>'backendLink'), '') as imported_backend,
            nullif(btrim(normalized_payload->>'frontendLink'), '') as imported_frontend
          from public.content_metadata_records
          where is_current = true and is_importable = true and course_id is not null
          order by course_id, row_number desc, id desc
        ), normalized as (
          select
            c.id,
            c.backend_link,
            c.frontend_link,
            c.field_provenance,
            m.imported_backend,
            m.imported_frontend,
            lower(regexp_replace(btrim(coalesce(c.backend_link, '')), '/+$', '')) as canonical_backend,
            lower(regexp_replace(btrim(coalesce(c.frontend_link, '')), '/+$', '')) as canonical_frontend,
            lower(regexp_replace(btrim(coalesce(m.imported_backend, '')), '/+$', '')) as source_backend,
            lower(regexp_replace(btrim(coalesce(m.imported_frontend, '')), '/+$', '')) as source_frontend
          from public.courses c
          left join current_metadata m on m.course_id = c.id
          where c.archived_at is null
        )
        select
          count(*)::integer as courses,
          count(*) filter (where imported_backend is not null)::integer as imported_backend_links,
          count(*) filter (where backend_link is not null and btrim(backend_link) <> '')::integer as backend_links,
          count(*) filter (where imported_frontend is not null)::integer as imported_frontend_links,
          count(*) filter (where frontend_link is not null and btrim(frontend_link) <> '')::integer as frontend_links,
          count(*) filter (where imported_backend is not null and nullif(btrim(backend_link), '') is null and coalesce(field_provenance->>'backendLink', '') <> 'coursetrack')::integer
            + count(*) filter (where imported_frontend is not null and nullif(btrim(frontend_link), '') is null and coalesce(field_provenance->>'frontendLink', '') <> 'coursetrack')::integer as eligible_link_fields,
          count(*) filter (where source_backend <> '' and canonical_backend <> '' and source_backend <> canonical_backend)::integer
            + count(*) filter (where source_frontend <> '' and canonical_frontend <> '' and source_frontend <> canonical_frontend)::integer as normalized_disagreements,
          (select count(*)::integer from public.lms_snapshots where is_current = true) as current_lms_snapshots,
          (select count(*)::integer from public.content_metadata_records where is_current = true) as current_metadata_records,
          (select count(*)::integer from public.accreditation_records where source_domain = 'lms' and source_transport = 'uploaded') as accreditation_sources,
          (select count(*)::integer from public.accreditation_records where source_domain = 'lms' and source_transport = 'uploaded' and topic_number is not null) as accreditation_topic_numbers
        from normalized
      `),
      client.query(`
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'courses' and column_name = any($1::text[])
        order by column_name
      `, [REQUIRED_COLUMNS]),
      client.query("select version from supabase_migrations.schema_migrations order by version"),
      client.query(`
        select projection_origin, count(*)::integer as count
        from public.courses
        where archived_at is null
        group by projection_origin
        order by projection_origin
      `),
      options.includeIds
        ? client.query(`
            with current_metadata as (
              select distinct on (course_id) course_id,
                nullif(btrim(normalized_payload->>'backendLink'), '') as imported_backend,
                nullif(btrim(normalized_payload->>'frontendLink'), '') as imported_frontend
              from public.content_metadata_records where is_current = true and is_importable = true and course_id is not null
              order by course_id, row_number desc, id desc
            )
            select c.app_id
            from public.courses c join current_metadata m on m.course_id = c.id
            where (m.imported_backend is not null and nullif(btrim(c.backend_link), '') is null)
               or (m.imported_frontend is not null and nullif(btrim(c.frontend_link), '') is null)
            order by c.app_id limit 100
          `)
        : Promise.resolve({ rows: [] }),
    ]);
    const counts = countsResult.rows[0] ?? {};
    const origins = Object.fromEntries(originsResult.rows.map((row) => [row.projection_origin ?? "unknown", numeric(row, "count")]));
    const presentColumns = columnsResult.rows.map((row) => row.column_name);
    const output = {
      target,
      projectRef: identity.projectRef,
      counts: {
        courses: numeric(counts, "courses"),
        currentLmsSnapshots: numeric(counts, "current_lms_snapshots"),
        currentMetadataRecords: numeric(counts, "current_metadata_records"),
        importedBackendLinks: numeric(counts, "imported_backend_links"),
        backendLinks: numeric(counts, "backend_links"),
        importedFrontendLinks: numeric(counts, "imported_frontend_links"),
        frontendLinks: numeric(counts, "frontend_links"),
        accreditationSources: numeric(counts, "accreditation_sources"),
        accreditationTopicNumbers: numeric(counts, "accreditation_topic_numbers"),
        eligibleLinkFields: numeric(counts, "eligible_link_fields"),
        normalizedDisagreements: numeric(counts, "normalized_disagreements"),
      },
      projectionOrigins: origins,
      requiredColumns: {
        present: presentColumns,
        missing: REQUIRED_COLUMNS.filter((column) => !presentColumns.includes(column)),
      },
      migrationLedger: migrationsResult.rows.map((row) => String(row.version)),
      ...(options.includeIds ? { affectedCourseIds: idsResult.rows.map((row) => row.app_id).filter(Boolean) } : {}),
    };
    const acceptedCounts = options.acceptedCounts;
    const failures = [];
    if (output.requiredColumns.missing.length) failures.push("required columns are missing");
    if (output.counts.eligibleLinkFields !== 0) failures.push("eligible canonical link fields remain empty");
    if (output.counts.normalizedDisagreements !== 0) failures.push("canonical and imported links disagree after normalization");
    if (options.requireFullParity && acceptedCounts) {
      for (const [key, expected] of Object.entries(acceptedCounts)) {
        const countKey = key === "accreditationSourcesMinimum" ? "accreditationSources" : key === "accreditationTopicNumbersMinimum" ? "accreditationTopicNumbers" : key;
        const actual = key === "lmsExportProjections" || key === "masterImportProjections"
          ? origins[key === "lmsExportProjections" ? "lms_export" : "master_import"] ?? 0
          : output.counts[countKey];
        const minimum = key.endsWith("Minimum");
        if (actual !== undefined && (minimum ? actual < expected : actual !== expected)) failures.push(`${key} expected ${minimum ? "at least " : ""}${expected}, received ${actual}`);
      }
    }
    await client.query("commit");
    return { ...output, accepted: failures.length === 0, failures };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    if (!options.client) await client.end();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const target = assertTarget(valueFor(argv, "--target"));
  const manifest = JSON.parse(await readFile(path.resolve("config/course-data-manifest.json"), "utf8"));
  const output = await auditCourseData({
    target,
    includeIds: argv.includes("--include-ids"),
    requireFullParity: argv.includes("--require-full-parity"),
    acceptedCounts: manifest.acceptedCounts,
  });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.accepted) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("Course-data audit failed. Verify the target-specific read-only database credential and configuration.\n");
    process.exitCode = 1;
  });
}
