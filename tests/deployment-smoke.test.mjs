import assert from "node:assert/strict";
import test from "node:test";

import { main } from "../scripts/smoke-deployment-health.mjs";

const HEALTHY_RESPONSE = {
  environment: "staging",
  authenticationConfigured: true,
  databaseReachable: true,
  schemaContractCurrent: true,
  commit: "expected-commit",
};

async function withSmokeEnvironment(body, callback) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.COURSETRACK_SMOKE_BASE_URL;
  const originalCommit = process.env.COURSETRACK_SMOKE_EXPECTED_COMMIT;
  const originalBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  process.env.COURSETRACK_SMOKE_BASE_URL = "https://staging.example.com";
  process.env.COURSETRACK_SMOKE_EXPECTED_COMMIT = "expected-commit";
  delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  globalThis.fetch = async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.COURSETRACK_SMOKE_BASE_URL;
    else process.env.COURSETRACK_SMOKE_BASE_URL = originalUrl;
    if (originalCommit === undefined) delete process.env.COURSETRACK_SMOKE_EXPECTED_COMMIT;
    else process.env.COURSETRACK_SMOKE_EXPECTED_COMMIT = originalCommit;
    if (originalBypass === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = originalBypass;
  }
}

test("deployment health smoke accepts the exact triggering commit", { concurrency: false }, async () => {
  await withSmokeEnvironment(HEALTHY_RESPONSE, async () => {
    await assert.doesNotReject(main());
  });
});

test("deployment health smoke rejects a stale stable-domain deployment", { concurrency: false }, async () => {
  await withSmokeEnvironment({ ...HEALTHY_RESPONSE, commit: "older-commit" }, async () => {
    await assert.rejects(
      main(),
      /different commit than the triggering deployment/,
    );
  });
});
