import { readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

import {
  DEPLOYMENT_MIGRATION_CONTRACT,
  PRODUCTION_MIGRATION_BASELINE,
} from "./deployment-migration-contract.mjs";

const { Client } = pg;
const DEPLOYED_ENVIRONMENTS = new Set(["production", "staging", "preview"]);
const MIGRATION_FILE_PATTERN = /^(\d{12,14})_.+\.sql$/;

export class DeploymentReadinessError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "DeploymentReadinessError";
    this.details = details;
  }
}

function value(environment, name) {
  return environment[name]?.trim() ?? "";
}

export function resolveReadinessEnvironment(environment = process.env) {
  const explicit = value(environment, "COURSETRACK_ENVIRONMENT").toLowerCase();
  const fallback = value(environment, "VERCEL_TARGET_ENV").toLowerCase()
    || value(environment, "VERCEL_ENV").toLowerCase()
    || "development";
  const target = explicit || fallback;
  if (!["production", "staging", "preview", "development"].includes(target)) {
    throw new DeploymentReadinessError(
      `COURSETRACK_ENVIRONMENT must be production, staging, preview, or development; received ${target || "an empty value"}.`,
    );
  }
  if (value(environment, "VERCEL") === "1" && !explicit) {
    throw new DeploymentReadinessError(
      "COURSETRACK_ENVIRONMENT is required in Vercel so Preview and staging deployments cannot be confused.",
    );
  }

  const branch = value(environment, "VERCEL_GIT_COMMIT_REF");
  if (target === "staging" && branch && branch !== "staging") {
    throw new DeploymentReadinessError(
      `The staging deployment contract cannot run for Git branch ${branch}.`,
    );
  }
  if (target === "production" && branch && branch !== "main") {
    throw new DeploymentReadinessError(
      `The production deployment contract cannot run for Git branch ${branch}.`,
    );
  }
  return target;
}

function requireCompletePair(environment, first, second, label) {
  const firstValue = value(environment, first);
  const secondValue = value(environment, second);
  if (!firstValue && !secondValue) {
    throw new DeploymentReadinessError(
      `${label} is not configured. Set ${first} and ${second} together.`,
    );
  }
  if (!firstValue || !secondValue) {
    const missing = firstValue ? second : first;
    throw new DeploymentReadinessError(
      `${label} is only partially configured. Missing ${missing}; set ${first} and ${second} together.`,
    );
  }
  return [firstValue, secondValue];
}

export function supabaseApiProjectRef(rawUrl, variableName) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new DeploymentReadinessError(`${variableName} must be a valid HTTPS Supabase project URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new DeploymentReadinessError(`${variableName} must use HTTPS.`);
  }
  const match = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (!match) {
    throw new DeploymentReadinessError(
      `${variableName} must use the standard <project-ref>.supabase.co host so the target can be verified.`,
    );
  }
  return match[1].toLowerCase();
}

export function databaseProjectRef(connectionString) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new DeploymentReadinessError("COURSETRACK_SCHEMA_DATABASE_URL must be a valid Postgres connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new DeploymentReadinessError("COURSETRACK_SCHEMA_DATABASE_URL must use the postgres protocol.");
  }
  const hostMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (hostMatch) return hostMatch[1].toLowerCase();
  const userMatch = decodeURIComponent(parsed.username).match(/^[^.]+\.([a-z0-9]+)$/i);
  if (userMatch) return userMatch[1].toLowerCase();
  throw new DeploymentReadinessError(
    "COURSETRACK_SCHEMA_DATABASE_URL must identify its Supabase project in the direct host or pooler user name.",
  );
}

function requireReference(environment, name) {
  const reference = value(environment, name).toLowerCase();
  if (!/^[a-z0-9]+$/.test(reference)) {
    throw new DeploymentReadinessError(`${name} must contain a Supabase project reference.`);
  }
  return reference;
}

export function validateDeploymentConfiguration(environment = process.env) {
  const target = resolveReadinessEnvironment(environment);
  const serverUrl = value(environment, "SUPABASE_URL");
  const serverKey = value(environment, "SUPABASE_SECRET_KEY")
    || value(environment, "SUPABASE_SERVICE_ROLE_KEY");
  if (!serverUrl && !serverKey) {
    throw new DeploymentReadinessError(
      "Server-side Supabase access is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY (or the supported legacy SUPABASE_SERVICE_ROLE_KEY) together.",
    );
  }
  if (!serverUrl || !serverKey) {
    throw new DeploymentReadinessError(
      `Server-side Supabase access is only partially configured. Missing ${serverUrl ? "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_URL"}.`,
    );
  }
  const [browserUrl] = requireCompletePair(
    environment,
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "Browser Supabase authentication",
  );
  const databaseUrl = value(environment, "COURSETRACK_SCHEMA_DATABASE_URL");
  if (!databaseUrl) {
    throw new DeploymentReadinessError(
      "Missing COURSETRACK_SCHEMA_DATABASE_URL. Configure the dedicated read-only schema-check credential.",
    );
  }

  const serverRef = supabaseApiProjectRef(serverUrl, "SUPABASE_URL");
  const browserRef = supabaseApiProjectRef(browserUrl, "NEXT_PUBLIC_SUPABASE_URL");
  const databaseRef = databaseProjectRef(databaseUrl);
  if (new Set([serverRef, browserRef, databaseRef]).size !== 1) {
    throw new DeploymentReadinessError(
      "Supabase server, browser Auth, and schema-check variables reference different projects.",
    );
  }

  if (DEPLOYED_ENVIRONMENTS.has(target)) {
    const productionRef = requireReference(environment, "COURSETRACK_PRODUCTION_SUPABASE_REF");
    const stagingRef = requireReference(environment, "COURSETRACK_STAGING_SUPABASE_REF");
    if (productionRef === stagingRef) {
      throw new DeploymentReadinessError(
        "Production and staging Supabase project references must be different.",
      );
    }
    if (target === "staging" && serverRef !== stagingRef) {
      const destination = serverRef === productionRef ? "production" : "an unapproved project";
      throw new DeploymentReadinessError(`Staging is configured to use ${destination}; expected the persistent staging branch.`);
    }
    if (target === "production" && serverRef !== productionRef) {
      const destination = serverRef === stagingRef ? "the staging branch" : "an unapproved project";
      throw new DeploymentReadinessError(`Production is configured to use ${destination}; expected the production project.`);
    }
    if (target === "preview") {
      const previewRef = requireReference(environment, "COURSETRACK_PREVIEW_SUPABASE_REF");
      if (serverRef === productionRef || serverRef === stagingRef || serverRef !== previewRef) {
        throw new DeploymentReadinessError(
          "Feature Preview must use its approved isolated Supabase project, never production or persistent staging.",
        );
      }
    }
  }

  return {
    target,
    databaseUrl,
    authenticationConfigured: true,
  };
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of values) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }
  return [...duplicates].sort();
}

function isStrictlyIncreasing(values) {
  return values.every((item, index) => index === 0 || values[index - 1].localeCompare(item) < 0);
}

export function compareMigrationHistory(checkedInRows, appliedVersions, options = {}) {
  const checkedInVersions = checkedInRows.map((row) => row.version);
  const errors = [];
  for (const version of duplicateValues(checkedInVersions)) {
    errors.push(`Checked-in migration version ${version} is duplicated.`);
  }
  for (const version of duplicateValues(appliedVersions)) {
    errors.push(`Database migration version ${version} is duplicated.`);
  }
  if (!isStrictlyIncreasing(checkedInVersions)) {
    errors.push("Checked-in migrations are out of order.");
  }
  if (!isStrictlyIncreasing(appliedVersions)) {
    errors.push("Database migration history is out of order.");
  }

  const baseline = options.baseline ?? null;
  const baselineApplied = baseline && appliedVersions.includes(baseline.version);
  let requiredRows = checkedInRows;
  if (baselineApplied) {
    const coveredIndex = checkedInVersions.indexOf(baseline.coversThrough);
    if (coveredIndex === -1) {
      errors.push(
        `Migration baseline ${baseline.version} covers unknown checked-in version ${baseline.coversThrough}.`,
      );
      requiredRows = [];
    } else {
      requiredRows = checkedInRows.slice(coveredIndex + 1);
    }
  }

  const applied = new Set(appliedVersions);
  const accepted = new Set(requiredRows.map((row) => row.version));
  if (baselineApplied) accepted.add(baseline.version);
  for (const row of requiredRows) {
    if (!applied.has(row.version)) {
      errors.push(`Missing database migration ${row.filename}.`);
    }
  }
  for (const version of appliedVersions) {
    if (!accepted.has(version)) {
      errors.push(`Database migration ${version} is not present under supabase/migrations.`);
    }
  }
  return { current: errors.length === 0, errors };
}

export async function readCandidateMigrationHistory(rootDirectory) {
  const directory = path.join(rootDirectory, "supabase", "migrations");
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
  return filenames.map((filename) => {
    const match = filename.match(MIGRATION_FILE_PATTERN);
    if (!match) {
      throw new DeploymentReadinessError(
        `Migration filename ${filename} must begin with a 12-14 digit version and an underscore.`,
      );
    }
    return { version: match[1], filename };
  });
}

export async function readCheckedInMigrationHistory(rootDirectory = process.cwd()) {
  const rows = await readCandidateMigrationHistory(rootDirectory);
  const contract = compareMigrationHistory(
    DEPLOYMENT_MIGRATION_CONTRACT.map((version) => ({ version, filename: `${version}_contract.sql` })),
    rows.map((row) => row.version),
  );
  if (!contract.current) {
    throw new DeploymentReadinessError(
      "The deployed migration contract does not match checked-in migration files.",
      contract.errors,
    );
  }
  return rows;
}

export async function queryAppliedMigrations(databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
    ssl: { rejectUnauthorized: false },
    application_name: "coursetrack-schema-check",
  });
  try {
    await client.connect();
    const result = await client.query(
      "select version from supabase_migrations.schema_migrations order by version asc",
    );
    return result.rows.map((row) => String(row.version));
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function runDeploymentReadiness(options = {}) {
  const environment = options.environment ?? process.env;
  const checkedInRows = options.checkedInRows
    ?? await readCheckedInMigrationHistory(options.rootDirectory ?? process.cwd());
  const configuration = validateDeploymentConfiguration(environment);
  let appliedVersions;
  try {
    appliedVersions = options.queryMigrations
      ? await options.queryMigrations(configuration.databaseUrl)
      : await queryAppliedMigrations(configuration.databaseUrl);
  } catch {
    throw new DeploymentReadinessError(
      "The target database could not be reached with the dedicated schema-check credential.",
    );
  }
  const schema = compareMigrationHistory(checkedInRows, appliedVersions, {
    baseline: configuration.target === "production" ? PRODUCTION_MIGRATION_BASELINE : null,
  });
  if (!schema.current) {
    throw new DeploymentReadinessError("The target database migration contract is not current.", schema.errors);
  }
  return {
    target: configuration.target,
    authenticationConfigured: true,
    databaseReachable: true,
    schemaContractCurrent: true,
  };
}

export async function deploymentHealthSnapshot(options = {}) {
  const environment = options.environment ?? process.env;
  let target = "development";
  try {
    target = resolveReadinessEnvironment(environment);
  } catch {
    // A malformed environment is unhealthy and is intentionally reported
    // only as the safe fallback label below.
  }
  const snapshot = {
    environment: target,
    authenticationConfigured: false,
    databaseReachable: false,
    schemaContractCurrent: false,
    commit: value(environment, "VERCEL_GIT_COMMIT_SHA") || value(environment, "GITHUB_SHA") || null,
  };
  try {
    const configuration = validateDeploymentConfiguration(environment);
    snapshot.authenticationConfigured = configuration.authenticationConfigured;
    let applied;
    try {
      applied = options.queryMigrations
        ? await options.queryMigrations(configuration.databaseUrl)
        : await queryAppliedMigrations(configuration.databaseUrl);
      snapshot.databaseReachable = true;
    } catch {
      return snapshot;
    }
    snapshot.schemaContractCurrent = compareMigrationHistory(
      DEPLOYMENT_MIGRATION_CONTRACT.map((version) => ({ version, filename: `${version}.sql` })),
      applied,
      { baseline: configuration.target === "production" ? PRODUCTION_MIGRATION_BASELINE : null },
    ).current;
  } catch {
    return snapshot;
  }
  return snapshot;
}

export function isHealthyDeployment(snapshot) {
  return snapshot.authenticationConfigured
    && snapshot.databaseReachable
    && snapshot.schemaContractCurrent;
}

export function deploymentHealthStatus(snapshot) {
  return isHealthyDeployment(snapshot) ? 200 : 503;
}
