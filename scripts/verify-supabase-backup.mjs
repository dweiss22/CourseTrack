import { pathToFileURL } from "node:url";

export function newestCompletedBackup(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.backups ?? [];
  return rows
    .filter((row) => !row.status || ["COMPLETED", "completed", "SUCCEEDED", "succeeded"].includes(row.status))
    .map((row) => row.inserted_at || row.created_at || row.completed_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

export async function verifyRecentBackup(options = {}) {
  const projectRef = options.projectRef || process.env.COURSETRACK_PRODUCTION_SUPABASE_REF;
  const accessToken = options.accessToken || process.env.SUPABASE_ACCESS_TOKEN;
  const maximumAgeHours = Number(options.maximumAgeHours ?? 24);
  if (!projectRef || !accessToken) throw new Error("Production project ref and Supabase access token are required.");
  const response = await (options.fetch || fetch)(`https://api.supabase.com/v1/projects/${projectRef}/database/backups`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Supabase backup verification request failed.");
  const latest = newestCompletedBackup(await response.json());
  if (!latest) throw new Error("No completed production backup was reported.");
  const ageHours = (Date.now() - latest.getTime()) / 3_600_000;
  if (ageHours < 0 || ageHours > maximumAgeHours) throw new Error(`The newest completed production backup is older than ${maximumAgeHours} hours.`);
  return { verified: true, completedAt: latest.toISOString(), ageHours: Number(ageHours.toFixed(2)) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyRecentBackup().then((output) => {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
