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
    const result = await runDeploymentReadiness({ checkedInRows });
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
