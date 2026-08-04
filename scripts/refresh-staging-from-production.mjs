import { createHmac, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { Client } = pg;
const PLACEHOLDER_DOMAIN = "staging.invalid";
const PRESERVED_TABLES = new Set(["environment_snapshot_status", "wrike_connection"]);
const CLEARED_TABLES = new Set([
  "audit_logs",
  "wrike_source_folders",
  "wrike_tasks",
  "wrike_task_source_folders",
  "wrike_sync_runs",
]);

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function projectRef(urlValue) {
  const host = new URL(urlValue).hostname;
  const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (!match) throw new Error(`Expected a Supabase project URL, received host ${host}.`);
  return match[1].toLowerCase();
}

export function databaseProjectRef(connectionString) {
  const parsed = new URL(connectionString);
  const hostMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (hostMatch) return hostMatch[1].toLowerCase();
  const decodedUser = decodeURIComponent(parsed.username);
  const userMatch = decodedUser.match(/^[^.]+\.([a-z0-9]+)$/i);
  if (userMatch) return userMatch[1].toLowerCase();
  throw new Error(
    `Could not verify the Supabase project reference in database host ${parsed.hostname}.`,
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function maskedIdentity(userId, maskingKey) {
  const digest = createHmac("sha256", maskingKey).update(userId).digest("hex").slice(0, 12);
  return {
    digest,
    email: `staging-user-${digest}@${PLACEHOLDER_DOMAIN}`,
    displayName: `Staging User ${digest.slice(0, 6).toUpperCase()}`,
  };
}

function maskedActorEmail(value, emailMap, maskingKey) {
  if (!value) return value;
  const normalized = String(value).trim().toLowerCase();
  const mapped = emailMap.get(normalized);
  if (mapped) return mapped;
  const digest = createHmac("sha256", maskingKey).update(normalized).digest("hex").slice(0, 12);
  return `staging-actor-${digest}@${PLACEHOLDER_DOMAIN}`;
}

export function sanitizeRow(table, row, context) {
  const sanitized = { ...row };
  if (table === "profiles") {
    const normalizedEmail = String(row.email).trim().toLowerCase();
    if (!context.testerEmails.has(normalizedEmail)) {
      const identity = maskedIdentity(String(row.id), context.maskingKey);
      sanitized.email = identity.email;
      sanitized.first_name = "Staging";
      sanitized.last_name = identity.digest.slice(0, 6).toUpperCase();
      sanitized.display_name = identity.displayName;
      sanitized.job_title = null;
      sanitized.department = null;
    }
  }

  for (const column of Object.keys(sanitized)) {
    if (column === "email" && table === "profiles") continue;
    if (column.endsWith("_email") || column === "actor_email") {
      sanitized[column] = maskedActorEmail(sanitized[column], context.emailMap, context.maskingKey);
    }
    if (column === "raw_payload" || column === "source_payload") sanitized[column] = {};
    if (column === "raw_value" || column === "raw_course_id") sanitized[column] = null;
  }

  if (table === "notes" && "body" in sanitized) {
    sanitized.body = "[Redacted in staging]";
  }
  if (table === "revamp_proposals" && "business_justification" in sanitized) {
    sanitized.business_justification = "[Redacted in staging]";
  }
  return sanitized;
}

async function schemaDescription(client) {
  const { rows } = await client.query(`
    select table_name, column_name, data_type, is_nullable, ordinal_position
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `);
  return rows;
}

async function migrationVersions(client) {
  const { rows } = await client.query(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  return rows.map((row) => String(row.version));
}

async function foreignKeys(client) {
  const { rows } = await client.query(`
    select
      child.relname as child_table,
      parent.relname as parent_table,
      parent_namespace.nspname as parent_schema,
      child_column.attname as child_column,
      parent_column.attname as parent_column
    from pg_constraint constraint_row
    join pg_class child on child.oid = constraint_row.conrelid
    join pg_class parent on parent.oid = constraint_row.confrelid
    join pg_namespace namespace_row on namespace_row.oid = child.relnamespace
    join pg_namespace parent_namespace on parent_namespace.oid = parent.relnamespace
    join lateral unnest(constraint_row.conkey) with ordinality child_key(attnum, ord) on true
    join lateral unnest(constraint_row.confkey) with ordinality parent_key(attnum, ord)
      on parent_key.ord = child_key.ord
    join pg_attribute child_column
      on child_column.attrelid = child.oid and child_column.attnum = child_key.attnum
    join pg_attribute parent_column
      on parent_column.attrelid = parent.oid and parent_column.attnum = parent_key.attnum
    where constraint_row.contype = 'f' and namespace_row.nspname = 'public'
    order by child.relname, constraint_row.conname, child_key.ord
  `);
  return rows;
}

export function resolveCopyOrder(tables, relationships) {
  const remaining = new Set(tables);
  const ordered = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((table) =>
      relationships
        .filter((relationship) => relationship.child_table === table)
        .every((relationship) =>
          relationship.parent_table === table || !remaining.has(relationship.parent_table),
        ),
    );
    if (ready.length === 0) {
      throw new Error(`Could not resolve foreign-key copy order for: ${[...remaining].join(", ")}.`);
    }
    ready.sort();
    for (const table of ready) {
      ordered.push(table);
      remaining.delete(table);
    }
  }
  return ordered;
}

async function readSnapshot(source, schema, copyTables, testerEmails, maskingKey, prepareProfiles) {
  await source.query("begin isolation level repeatable read read only");
  try {
    const snapshotResult = await source.query("select transaction_timestamp() as snapshot_at");
    const snapshotAt = snapshotResult.rows[0].snapshot_at.toISOString();
    const profileResult = await source.query("select * from public.profiles order by id");
    const sourceProfiles = profileResult.rows;
    const superAdmins = sourceProfiles.filter((profile) => profile.role === "super_admin");
    if (superAdmins.length !== 1 || !testerEmails.has(String(superAdmins[0].email).toLowerCase())) {
      throw new Error("The sole production superadmin must be included in STAGING_TESTER_EMAILS.");
    }
    const emailMap = new Map(
      sourceProfiles.map((profile) => {
        const normalizedEmail = String(profile.email).toLowerCase();
        return [
          normalizedEmail,
          testerEmails.has(normalizedEmail)
            ? normalizedEmail
            : maskedIdentity(profile.id, maskingKey).email,
        ];
      }),
    );
    const context = { testerEmails, maskingKey, emailMap };
    await prepareProfiles(sourceProfiles);
    const rowsByTable = new Map();
    for (const table of copyTables) {
      const columns = schema
        .filter((column) => column.table_name === table)
        .map((column) => quoteIdentifier(column.column_name))
        .join(", ");
      const result = await source.query(`select ${columns} from public.${quoteIdentifier(table)}`);
      rowsByTable.set(table, result.rows.map((row) => sanitizeRow(table, row, context)));
    }
    await source.query("commit");
    return { snapshotAt, rowsByTable, sourceProfiles };
  } catch (error) {
    await source.query("rollback");
    throw error;
  }
}

async function listAllAuthUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list staging Auth users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function prepareAuthUsers(adminClient, sourceProfiles, testerEmails, maskingKey) {
  const existingUsers = await listAllAuthUsers(adminClient);
  const byId = new Map(existingUsers.map((user) => [user.id, user]));

  for (const profile of sourceProfiles) {
    const normalizedEmail = String(profile.email).trim().toLowerCase();
    const existing = byId.get(profile.id);
    if (testerEmails.has(normalizedEmail)) {
      if (!existing || existing.email?.toLowerCase() !== normalizedEmail) {
        throw new Error(
          `Approved staging tester ${normalizedEmail} must already exist in staging Auth with production UUID ${profile.id}.`,
        );
      }
      continue;
    }
    if (!existing) {
      const identity = maskedIdentity(profile.id, maskingKey);
      const { error } = await adminClient.auth.admin.createUser({
        id: profile.id,
        email: identity.email,
        password: randomBytes(48).toString("base64url"),
        email_confirm: true,
        ban_duration: "876000h",
        user_metadata: { coursetrack_staging_placeholder: true },
      });
      if (error) throw new Error(`Could not create staging Auth placeholder ${profile.id}: ${error.message}`);
    }
  }
}

async function finalizeAuthUsers(adminClient, sourceProfiles, testerEmails, maskingKey) {
  const sourceIds = new Set(sourceProfiles.map((profile) => profile.id));
  const users = await listAllAuthUsers(adminClient);
  for (const user of users) {
    const normalizedEmail = user.email?.toLowerCase() ?? "";
    if (!sourceIds.has(user.id)) {
      if (normalizedEmail.endsWith(`@${PLACEHOLDER_DOMAIN}`)) {
        const { error } = await adminClient.auth.admin.deleteUser(user.id);
        if (error) throw new Error(`Could not remove obsolete Auth placeholder ${user.id}: ${error.message}`);
      }
      continue;
    }
    const sourceProfile = sourceProfiles.find((profile) => profile.id === user.id);
    if (testerEmails.has(String(sourceProfile.email).toLowerCase())) continue;
    const identity = maskedIdentity(user.id, maskingKey);
    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      email: identity.email,
      ban_duration: "876000h",
      user_metadata: { coursetrack_staging_placeholder: true },
    });
    if (error) throw new Error(`Could not secure staging Auth placeholder ${user.id}: ${error.message}`);
  }
}

async function insertRows(client, table, rows) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const batchSize = Math.max(1, Math.floor(30000 / columns.length));
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = batch.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await client.query(
      `insert into public.${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(",")}) values ${tuples.join(",")}`,
      values,
    );
  }
}

async function validateForeignKeys(client, relationships, resetTables) {
  for (const relationship of relationships) {
    if (
      !resetTables.has(relationship.child_table) ||
      relationship.parent_schema !== "public" ||
      relationship.parent_table === relationship.child_table
    ) continue;
    const result = await client.query(`
      select count(*)::integer as invalid_count
      from public.${quoteIdentifier(relationship.child_table)} child_row
      left join public.${quoteIdentifier(relationship.parent_table)} parent_row
        on child_row.${quoteIdentifier(relationship.child_column)} = parent_row.${quoteIdentifier(relationship.parent_column)}
      where child_row.${quoteIdentifier(relationship.child_column)} is not null
        and parent_row.${quoteIdentifier(relationship.parent_column)} is null
    `);
    if (result.rows[0].invalid_count !== 0) {
      throw new Error(
        `Foreign-key validation failed for ${relationship.child_table}.${relationship.child_column}.`,
      );
    }
  }
}

async function replaceStagingData(target, copyOrder, clearedTables, snapshot, relationships, sourceRef) {
  const resetTables = new Set([...copyOrder, ...clearedTables]);
  const resetList = [...resetTables].map((table) => `public.${quoteIdentifier(table)}`).join(", ");
  await target.query("begin");
  try {
    await target.query("set local lock_timeout = '15s'");
    await target.query("set local statement_timeout = '15min'");
    await target.query("set local session_replication_role = replica");
    if (resetList) await target.query(`truncate table ${resetList} restart identity`);
    for (const table of copyOrder) {
      await insertRows(target, table, snapshot.rowsByTable.get(table) ?? []);
    }
    await target.query("set local session_replication_role = origin");
    await validateForeignKeys(target, relationships, resetTables);

    const rowCounts = Object.fromEntries(
      copyOrder.map((table) => [table, snapshot.rowsByTable.get(table)?.length ?? 0]),
    );
    await target.query(
      `insert into public.environment_snapshot_status
        (singleton, refreshed_at, source_snapshot_at, source_project_ref, row_counts)
       values (true, now(), $1, $2, $3::jsonb)
       on conflict (singleton) do update set
         refreshed_at = excluded.refreshed_at,
         source_snapshot_at = excluded.source_snapshot_at,
         source_project_ref = excluded.source_project_ref,
         row_counts = excluded.row_counts`,
      [snapshot.snapshotAt, sourceRef, JSON.stringify(rowCounts)],
    );
    await target.query("commit");
    return rowCounts;
  } catch (error) {
    await target.query("rollback");
    throw error;
  }
}

async function main() {
  if (requiredEnvironment("COURSETRACK_ENVIRONMENT").toLowerCase() !== "staging") {
    throw new Error("COURSETRACK_ENVIRONMENT must be exactly staging for a refresh.");
  }
  const productionUrl = requiredEnvironment("PRODUCTION_SUPABASE_URL");
  const stagingUrl = requiredEnvironment("STAGING_SUPABASE_URL");
  const sourceRef = projectRef(productionUrl);
  const targetRef = projectRef(stagingUrl);
  if (sourceRef === targetRef) throw new Error("Production and staging Supabase projects must be different.");

  const sourceDatabaseUrl = requiredEnvironment("PRODUCTION_DATABASE_URL");
  const targetDatabaseUrl = requiredEnvironment("STAGING_DATABASE_URL");
  if (sourceDatabaseUrl === targetDatabaseUrl) throw new Error("Production and staging database URLs must differ.");
  if (databaseProjectRef(sourceDatabaseUrl) !== sourceRef) {
    throw new Error("PRODUCTION_DATABASE_URL does not belong to PRODUCTION_SUPABASE_URL.");
  }
  if (databaseProjectRef(targetDatabaseUrl) !== targetRef) {
    throw new Error("STAGING_DATABASE_URL does not belong to STAGING_SUPABASE_URL.");
  }

  const maskingKey = requiredEnvironment("STAGING_MASKING_KEY");
  if (maskingKey.length < 32) throw new Error("STAGING_MASKING_KEY must contain at least 32 characters.");
  const testerEmails = new Set(
    requiredEnvironment("STAGING_TESTER_EMAILS")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  const source = new Client({ connectionString: sourceDatabaseUrl });
  const target = new Client({ connectionString: targetDatabaseUrl });
  const authAdmin = createClient(stagingUrl, requiredEnvironment("STAGING_SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  await Promise.all([source.connect(), target.connect()]);
  try {
    const [sourceSchema, targetSchema, relationships, sourceMigrations, targetMigrations] = await Promise.all([
      schemaDescription(source),
      schemaDescription(target),
      foreignKeys(source),
      migrationVersions(source),
      migrationVersions(target),
    ]);
    if (JSON.stringify(sourceMigrations) !== JSON.stringify(targetMigrations)) {
      throw new Error("Production and staging migration versions differ. Apply the same migrations before refreshing.");
    }
    if (JSON.stringify(sourceSchema) !== JSON.stringify(targetSchema)) {
      throw new Error("Production and staging public schemas differ. Apply the same migrations before refreshing.");
    }

    const allTables = [...new Set(sourceSchema.map((column) => column.table_name))];
    const copyTables = allTables.filter(
      (table) => !PRESERVED_TABLES.has(table) && !CLEARED_TABLES.has(table),
    );
    const copyOrder = resolveCopyOrder(copyTables, relationships);

    const snapshot = await readSnapshot(
      source,
      sourceSchema,
      copyOrder,
      testerEmails,
      maskingKey,
      (profiles) => prepareAuthUsers(authAdmin, profiles, testerEmails, maskingKey),
    );
    const rowCounts = await replaceStagingData(
      target,
      copyOrder,
      CLEARED_TABLES,
      snapshot,
      relationships,
      sourceRef,
    );
    await finalizeAuthUsers(authAdmin, snapshot.sourceProfiles, testerEmails, maskingKey);

    console.log(`Staging refresh completed from ${sourceRef} at ${snapshot.snapshotAt}.`);
    console.log(`Copied ${Object.values(rowCounts).reduce((sum, count) => sum + count, 0)} rows across ${copyOrder.length} tables.`);
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Staging refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
