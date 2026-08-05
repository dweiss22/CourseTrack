import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

async function loadEnv(fileName) {
  try {
    const content = await readFile(fileName, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = /^([^#=]+)=(.*)$/.exec(line);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch (error) { if (error?.code !== "ENOENT") throw error; }
}

async function allRows(client, table, columns, modify) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = client.from(table).select(columns).order("id").range(from, from + 999);
    if (modify) query = modify(query);
    const { data, error } = await query;
    if (error) throw new Error(`Could not back up ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

const checksum = (rows) => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
await loadEnv(path.resolve(".env.local"));
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Preflight requires the server-only Supabase URL and secret key.");

const outputArgument = process.argv.find((value) => value.startsWith("--output="));
const relativeOutput = outputArgument?.slice("--output=".length) || `backups/course-data-preflight-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const workspace = path.resolve(".");
const output = path.resolve(relativeOutput);
if (output !== workspace && !output.startsWith(`${workspace}${path.sep}`)) throw new Error("Backup output must stay inside the repository workspace.");

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const datasets = {
  courseVersions: await allRows(client, "course_versions", "*"),
  wrikeReferences: await allRows(client, "version_wrike_task_references", "*"),
  courseOverrides: await allRows(client, "courses", "id,app_id,lms_course_id,course_code,field_provenance,has_manual_overrides,content_notes,updated_at", (query) => query.eq("has_manual_overrides", true)),
  notes: await allRows(client, "notes", "*"),
  auditRows: await allRows(client, "audit_logs", "*"),
};
const sourceCounts = {};
for (const [table, filter] of [
  ["courses", null], ["lms_snapshots", ["is_current", true]], ["content_metadata_records", null], ["accreditation_records", null],
]) {
  let query = client.from(table).select("id", { count: "exact", head: true });
  if (filter) query = query.eq(filter[0], filter[1]);
  const { count, error } = await query;
  if (error) throw new Error(`Could not count ${table}: ${error.message}`);
  sourceCounts[table] = count ?? 0;
}
const manifest = Object.fromEntries(Object.entries(datasets).map(([name, rows]) => [name, { count: rows.length, sha256: checksum(rows) }]));
const backup = { createdAt: new Date().toISOString(), supabaseHost: new URL(url).host, sourceCounts, manifest, datasets };
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(backup, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ output, sourceCounts, manifest }, null, 2)}\n`);
