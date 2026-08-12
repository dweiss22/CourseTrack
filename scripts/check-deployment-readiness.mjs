#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import {
  DeploymentReadinessError,
  readCandidateMigrationHistory,
  runDeploymentReadiness,
} from "../lib/deployment-readiness.mjs";

function valueFor(argv, name) {
  const prefix = `${name}=`;
  const argument = argv.find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const candidateDirectory = valueFor(argv, "--candidate-dir");
    const checkedInRows = candidateDirectory
      ? await readCandidateMigrationHistory(candidateDirectory)
      : undefined;
    // Only the build preflight passes this. Verification steps in the release
    // workflows run without it and stay strict -- they execute after the
    // migrations have been applied, so a pending migration there is a real
    // failure. See runDeploymentReadiness for why production never tolerates it.
    const allowPendingMigrations = argv.includes("--allow-pending-migrations");
    const result = await runDeploymentReadiness({ checkedInRows, allowPendingMigrations });
    if (result.pendingMigrations?.length) {
      console.warn(
        `Deployment readiness passed for ${result.target} with ${result.pendingMigrations.length} migration(s) not yet applied: `
        + `${result.pendingMigrations.join(", ")}. The release workflow applies these and verifies the contract strictly.`,
      );
      return;
    }
    console.log(
      `Deployment readiness passed for ${result.target}: authentication configured, database reachable, schema contract current.`,
    );
  } catch (error) {
    const safeError = error instanceof DeploymentReadinessError
      ? error
      : new DeploymentReadinessError("Deployment readiness failed unexpectedly.");
    console.error(`Deployment readiness failed: ${safeError.message}`);
    for (const detail of safeError.details) console.error(`- ${detail}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
