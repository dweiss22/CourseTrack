#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEPLOYED_BRANCHES = new Set(["main", "staging"]);

export function shouldBuildVercelBranch(branch, controlledReleases = false) {
  return !controlledReleases && DEPLOYED_BRANCHES.has(branch?.trim() ?? "");
}

export function main(environment = process.env) {
  const branch = environment.VERCEL_GIT_COMMIT_REF?.trim() || "unknown";
  const controlledReleases = environment.COURSETRACK_CONTROLLED_RELEASES?.trim().toLowerCase() === "true";
  if (shouldBuildVercelBranch(branch, controlledReleases)) {
    console.log(`Vercel build enabled for long-lived branch: ${branch}`);
    return 1;
  }

  if (controlledReleases && DEPLOYED_BRANCHES.has(branch)) {
    console.log(`Vercel Git build skipped; ${branch} is deployed by the controlled release workflow.`);
    return 0;
  }

  console.log(`Vercel build skipped for temporary branch: ${branch}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
