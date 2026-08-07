#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export async function main() {
  const rawUrl = process.env.COURSETRACK_SMOKE_BASE_URL?.trim();
  if (!rawUrl) throw new Error("Missing required smoke-test variable COURSETRACK_SMOKE_BASE_URL.");
  const expectedCommit = process.env.COURSETRACK_SMOKE_EXPECTED_COMMIT?.trim();
  if (!expectedCommit) {
    throw new Error("Missing required smoke-test variable COURSETRACK_SMOKE_EXPECTED_COMMIT.");
  }
  const baseUrl = new URL(rawUrl);
  if (baseUrl.protocol !== "https:") throw new Error("COURSETRACK_SMOKE_BASE_URL must use HTTPS.");
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  const response = await fetch(new URL("/api/health/deployment", baseUrl), {
    signal: AbortSignal.timeout(15_000),
    redirect: "manual",
    headers: bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : undefined,
  });
  const body = await response.json().catch(() => null);
  const safeShape = body
    && typeof body.environment === "string"
    && typeof body.authenticationConfigured === "boolean"
    && typeof body.databaseReachable === "boolean"
    && typeof body.schemaContractCurrent === "boolean"
    && (typeof body.commit === "string" || body.commit === null);
  if (!safeShape || response.status !== 200 || !body.authenticationConfigured
      || !body.databaseReachable || !body.schemaContractCurrent) {
    throw new Error(`Deployment health check failed with HTTP ${response.status}.`);
  }
  if (body.commit !== expectedCommit) {
    throw new Error("Deployment health check returned a different commit than the triggering deployment.");
  }
  console.log("Deployment health smoke test passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Deployment health smoke test failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
