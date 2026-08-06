import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DEPLOYMENT_MIGRATION_CONTRACT } from "../lib/deployment-migration-contract.mjs";
import {
  compareMigrationHistory,
  deploymentHealthSnapshot,
  deploymentHealthStatus,
  isHealthyDeployment,
  readCheckedInMigrationHistory,
  runDeploymentReadiness,
  validateDeploymentConfiguration,
} from "../lib/deployment-readiness.mjs";

const STAGING_REF = "stagingref123";
const PRODUCTION_REF = "productionref123";

function targetEnvironment(target = "staging", actualRef = STAGING_REF) {
  return {
    COURSETRACK_ENVIRONMENT: target,
    VERCEL_GIT_COMMIT_REF: target === "production" ? "main" : "staging",
    SUPABASE_URL: `https://${actualRef}.supabase.co`,
    SUPABASE_SECRET_KEY: "server-secret-placeholder",
    NEXT_PUBLIC_SUPABASE_URL: `https://${actualRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "browser-key-placeholder",
    COURSETRACK_SCHEMA_DATABASE_URL: `postgresql://schema_check:password@db.${actualRef}.supabase.co:5432/postgres`,
    COURSETRACK_STAGING_SUPABASE_REF: STAGING_REF,
    COURSETRACK_PRODUCTION_SUPABASE_REF: PRODUCTION_REF,
  };
}

test("migration contract exactly matches checked-in migration files", async () => {
  const rows = await readCheckedInMigrationHistory(fileURLToPath(new URL("../", import.meta.url)));
  assert.deepEqual(rows.map((row) => row.version), DEPLOYMENT_MIGRATION_CONTRACT);
});

test("environment validation accepts complete staging configuration", () => {
  const result = validateDeploymentConfiguration(targetEnvironment());
  assert.equal(result.target, "staging");
  assert.equal(result.authenticationConfigured, true);
});

test("environment validation fails clearly for absent and partial Auth pairs", () => {
  const absent = targetEnvironment();
  delete absent.NEXT_PUBLIC_SUPABASE_URL;
  delete absent.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.throws(() => validateDeploymentConfiguration(absent), /Browser Supabase authentication is not configured/);

  const partial = targetEnvironment();
  delete partial.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.throws(() => validateDeploymentConfiguration(partial), /Missing NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

test("staging and production reject each other's Supabase project", () => {
  assert.throws(
    () => validateDeploymentConfiguration(targetEnvironment("staging", PRODUCTION_REF)),
    /Staging is configured to use production/,
  );
  const production = targetEnvironment("production", STAGING_REF);
  assert.throws(
    () => validateDeploymentConfiguration(production),
    /Production is configured to use the staging branch/,
  );
});

test("server, browser, and schema-check references must match", () => {
  const environment = targetEnvironment();
  environment.NEXT_PUBLIC_SUPABASE_URL = "https://differentref.supabase.co";
  assert.throws(
    () => validateDeploymentConfiguration(environment),
    /reference different projects/,
  );
});

test("migration comparison names missing, extra, duplicated, and out-of-order versions", () => {
  const checkedIn = [
    { version: "202601010001", filename: "202601010001_first.sql" },
    { version: "202601010002", filename: "202601010002_second.sql" },
  ];
  const missing = compareMigrationHistory(checkedIn, ["202601010001"]);
  assert.match(missing.errors.join("\n"), /Missing database migration 202601010002_second.sql/);

  const extra = compareMigrationHistory(checkedIn, ["202601010001", "202601010002", "202601010003"]);
  assert.match(extra.errors.join("\n"), /202601010003 is not present/);

  const invalid = compareMigrationHistory(checkedIn, ["202601010002", "202601010001", "202601010001"]);
  assert.match(invalid.errors.join("\n"), /duplicated/);
  assert.match(invalid.errors.join("\n"), /out of order/);
});

test("readiness errors redact database connection failures", async () => {
  const checkedInRows = DEPLOYMENT_MIGRATION_CONTRACT.map((version) => ({ version, filename: `${version}_test.sql` }));
  await assert.rejects(
    () => runDeploymentReadiness({
      environment: targetEnvironment(),
      checkedInRows,
      queryMigrations: async () => { throw new Error("postgresql://user:leaked-password@db.host/database"); },
    }),
    (error) => {
      assert.match(error.message, /dedicated schema-check credential/);
      assert.doesNotMatch(error.message, /leaked-password|postgresql:/);
      return true;
    },
  );
});

test("health is ready only when auth, database, and migration contract are current", async () => {
  const healthy = await deploymentHealthSnapshot({
    environment: targetEnvironment(),
    queryMigrations: async () => [...DEPLOYMENT_MIGRATION_CONTRACT],
  });
  assert.equal(isHealthyDeployment(healthy), true);
  assert.equal(deploymentHealthStatus(healthy), 200);
  assert.deepEqual(
    Object.keys(healthy).sort(),
    ["authenticationConfigured", "commit", "databaseReachable", "environment", "schemaContractCurrent"].sort(),
  );

  const missingMigration = await deploymentHealthSnapshot({
    environment: targetEnvironment(),
    queryMigrations: async () => DEPLOYMENT_MIGRATION_CONTRACT.slice(0, -1),
  });
  assert.equal(missingMigration.databaseReachable, true);
  assert.equal(missingMigration.schemaContractCurrent, false);
  assert.equal(isHealthyDeployment(missingMigration), false);
  assert.equal(deploymentHealthStatus(missingMigration), 503);

  const unreachable = await deploymentHealthSnapshot({
    environment: targetEnvironment(),
    queryMigrations: async () => { throw new Error("unreachable"); },
  });
  assert.equal(unreachable.databaseReachable, false);
  assert.equal(isHealthyDeployment(unreachable), false);
  assert.equal(deploymentHealthStatus(unreachable), 503);
});
