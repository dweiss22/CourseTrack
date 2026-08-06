#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import {
  DeploymentReadinessError,
  runDeploymentReadiness,
} from "../lib/deployment-readiness.mjs";

export async function main() {
  try {
    const result = await runDeploymentReadiness();
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
