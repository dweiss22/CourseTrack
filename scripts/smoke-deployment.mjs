#!/usr/bin/env node
import { pathToFileURL } from "node:url";

function required(name) {
  const result = process.env[name]?.trim();
  if (!result) throw new Error(`Missing required smoke-test variable ${name}.`);
  return result;
}

async function fetchWithTimeout(url, init = {}) {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  const headers = new Headers(init.headers);
  if (bypassSecret) headers.set("x-vercel-protection-bypass", bypassSecret);
  return fetch(url, { ...init, headers, signal: AbortSignal.timeout(15_000), redirect: "manual" });
}

async function assertReadyHealth(baseUrl) {
  const response = await fetchWithTimeout(new URL("/api/health/deployment", baseUrl));
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
}

async function assertAuthenticatedRoute(baseUrl, route, cookie) {
  const response = await fetchWithTimeout(new URL(route, baseUrl), {
    headers: { Cookie: cookie, Accept: "text/html" },
  });
  const body = await response.text();
  if (response.status !== 200) throw new Error(`${route} returned HTTP ${response.status}.`);
  if (/This page couldn.t load|CourseTrack authentication is not configured|Sign in to CourseTrack/i.test(body)) {
    throw new Error(`${route} returned an application error or unauthenticated page.`);
  }
}

export async function main() {
  const baseUrl = new URL(required("COURSETRACK_SMOKE_BASE_URL"));
  if (baseUrl.protocol !== "https:") throw new Error("COURSETRACK_SMOKE_BASE_URL must use HTTPS.");
  const cookie = required("COURSETRACK_SMOKE_SESSION_COOKIE");
  const courseId = required("COURSETRACK_SMOKE_COURSE_ID");
  await assertReadyHealth(baseUrl);
  const routes = [
    "/",
    "/courses",
    `/courses/${encodeURIComponent(courseId)}`,
    `/courses/${encodeURIComponent(courseId)}?tab=data-comparison`,
    "/versions",
    "/accreditation",
  ];
  for (const route of routes) await assertAuthenticatedRoute(baseUrl, route, cookie);
  console.log(`Deployment smoke test passed for ${routes.length} authenticated routes and the health endpoint.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Deployment smoke test failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
