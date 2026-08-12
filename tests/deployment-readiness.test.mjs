import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEPLOYMENT_MIGRATION_CONTRACT,
  PRODUCTION_MIGRATION_BASELINE,
} from "../lib/deployment-migration-contract.mjs";
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

test("environment validation accepts the supported legacy server key", () => {
  const environment = targetEnvironment();
  delete environment.SUPABASE_SECRET_KEY;
  environment.SUPABASE_SERVICE_ROLE_KEY = "legacy-server-secret-placeholder";
  assert.equal(validateDeploymentConfiguration(environment).target, "staging");
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

test("production accepts its reviewed Supabase baseline plus explicit later migrations", () => {
  const checkedInRows = DEPLOYMENT_MIGRATION_CONTRACT.map((version) => ({
    version,
    filename: `${version}_test.sql`,
  }));
  const postBaseline = DEPLOYMENT_MIGRATION_CONTRACT.filter(
    (version) => version > PRODUCTION_MIGRATION_BASELINE.coversThrough,
  );
  const missing = compareMigrationHistory(
    checkedInRows,
    [PRODUCTION_MIGRATION_BASELINE.version],
    { baseline: PRODUCTION_MIGRATION_BASELINE },
  );
  assert.equal(missing.current, false);
  assert.match(missing.errors.join("\n"), /202608040008/);

  const production = compareMigrationHistory(
    checkedInRows,
    [...postBaseline, PRODUCTION_MIGRATION_BASELINE.version].sort(),
    { baseline: PRODUCTION_MIGRATION_BASELINE },
  );
  assert.equal(production.current, true);

  const staging = compareMigrationHistory(checkedInRows, [PRODUCTION_MIGRATION_BASELINE.version]);
  assert.equal(staging.current, false);
  assert.match(staging.errors.join("\n"), /not present under supabase\/migrations/);
});

test("production baseline still requires migrations added after the covered version", () => {
  // Deliberately far-future and synthetic: a plausible-looking version would
  // collide with the next real migration and break this test on every release.
  const nextVersion = "209912310001";
  const postBaseline = DEPLOYMENT_MIGRATION_CONTRACT.filter(
    (version) => version > PRODUCTION_MIGRATION_BASELINE.coversThrough,
  );
  const checkedInRows = [
    ...DEPLOYMENT_MIGRATION_CONTRACT.map((version) => ({ version, filename: `${version}_test.sql` })),
    { version: nextVersion, filename: `${nextVersion}_next.sql` },
  ];
  const missing = compareMigrationHistory(
    checkedInRows,
    [...postBaseline, PRODUCTION_MIGRATION_BASELINE.version].sort(),
    { baseline: PRODUCTION_MIGRATION_BASELINE },
  );
  assert.match(missing.errors.join("\n"), new RegExp(`Missing database migration ${nextVersion}_next\\.sql`));

  const current = compareMigrationHistory(
    checkedInRows,
    [...postBaseline, PRODUCTION_MIGRATION_BASELINE.version, nextVersion].sort(),
    { baseline: PRODUCTION_MIGRATION_BASELINE },
  );
  assert.equal(current.current, true);
});

test("the build preflight tolerates a not-yet-applied migration, but only outside production", async () => {
  // A git push starts the Vercel build immediately while the release workflow
  // applies the migration seconds later. Without this the build fails on a
  // discrepancy that resolves itself, and every migration needs a redeploy.
  const checkedInRows = [
    ...DEPLOYMENT_MIGRATION_CONTRACT.map((version) => ({ version, filename: `${version}_test.sql` })),
    { version: "209912310001", filename: "209912310001_pending.sql" },
  ];
  const appliedStaging = [...DEPLOYMENT_MIGRATION_CONTRACT];

  const tolerated = await runDeploymentReadiness({
    environment: targetEnvironment("staging"),
    checkedInRows,
    allowPendingMigrations: true,
    queryMigrations: async () => appliedStaging,
  });
  assert.deepEqual(tolerated.pendingMigrations, ["209912310001_pending.sql"]);
  // Reported honestly rather than claimed current.
  assert.equal(tolerated.schemaContractCurrent, false);

  // Same input without the flag still fails: workflow verification runs after
  // migrations are applied, so a pending migration there is a real failure.
  await assert.rejects(
    () => runDeploymentReadiness({
      environment: targetEnvironment("staging"),
      checkedInRows,
      queryMigrations: async () => appliedStaging,
    }),
    /migration contract is not current/,
  );

  // Production never tolerates it, even when asked.
  const postBaseline = DEPLOYMENT_MIGRATION_CONTRACT.filter(
    (version) => version > PRODUCTION_MIGRATION_BASELINE.coversThrough,
  );
  await assert.rejects(
    () => runDeploymentReadiness({
      environment: targetEnvironment("production", PRODUCTION_REF),
      checkedInRows,
      allowPendingMigrations: true,
      queryMigrations: async () => [...postBaseline, PRODUCTION_MIGRATION_BASELINE.version].sort(),
    }),
    /migration contract is not current/,
  );
});

test("the build preflight still fails on discrepancies that do not resolve themselves", async () => {
  const checkedInRows = DEPLOYMENT_MIGRATION_CONTRACT.map((version) => ({ version, filename: `${version}_test.sql` }));

  // A database holding a migration the repository does not is never tolerated:
  // unlike a pending migration, applying the repo's migrations cannot fix it.
  await assert.rejects(
    () => runDeploymentReadiness({
      environment: targetEnvironment("staging"),
      checkedInRows,
      allowPendingMigrations: true,
      queryMigrations: async () => [...DEPLOYMENT_MIGRATION_CONTRACT, "209912310002"],
    }),
    /migration contract is not current/,
  );

  // Nor is a duplicated or out-of-order applied history.
  await assert.rejects(
    () => runDeploymentReadiness({
      environment: targetEnvironment("staging"),
      checkedInRows,
      allowPendingMigrations: true,
      queryMigrations: async () => [...DEPLOYMENT_MIGRATION_CONTRACT].reverse(),
    }),
    /migration contract is not current/,
  );
});

test("only the Vercel build preflight is allowed to tolerate pending migrations", async () => {
  const { readFile } = await import("node:fs/promises");
  const root = new URL("../", import.meta.url);
  const read = (path) => readFile(new URL(path, root), "utf8");
  const packageJson = JSON.parse(await read("package.json"));

  assert.equal(packageJson.scripts["build:vercel"], "npm run check:deployment:build && npm run build:code");
  assert.match(packageJson.scripts["check:deployment:build"], /--allow-pending-migrations/);
  // The strict entry point must never carry the flag.
  assert.doesNotMatch(packageJson.scripts["check:deployment"], /--allow-pending-migrations/);

  // Workflow verification steps run after migrations are applied and stay strict.
  for (const file of [
    ".github/workflows/staging-release.yml",
    ".github/workflows/production-release.yml",
    ".github/workflows/production-preparation.yml",
  ]) {
    assert.doesNotMatch(await read(file), /--allow-pending-migrations|check:deployment:build/, `${file} must verify strictly`);
  }
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

  const productionBaseline = await deploymentHealthSnapshot({
    environment: targetEnvironment("production", PRODUCTION_REF),
    queryMigrations: async () => [
      ...DEPLOYMENT_MIGRATION_CONTRACT.filter(
        (version) => version > PRODUCTION_MIGRATION_BASELINE.coversThrough,
      ),
      PRODUCTION_MIGRATION_BASELINE.version,
    ].sort(),
  });
  assert.equal(isHealthyDeployment(productionBaseline), true);

  const unreachable = await deploymentHealthSnapshot({
    environment: targetEnvironment(),
    queryMigrations: async () => { throw new Error("unreachable"); },
  });
  assert.equal(unreachable.databaseReachable, false);
  assert.equal(isHealthyDeployment(unreachable), false);
  assert.equal(deploymentHealthStatus(unreachable), 503);
});
