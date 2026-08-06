import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

// lib/auth.ts statically imports next/navigation and next/server, which
// can't be resolved outside the Next.js/vinext runtime under plain
// `node --test` (confirmed: direct dynamic import fails to resolve the
// package's conditional exports). Following this repo's existing
// contract-testing convention (see tests/wrike-linking.test.mjs), these
// guards are verified by inspecting the source rather than executing it.

test("APPLICATION_ROLES is exactly the four exclusive roles", async () => {
  // Lives in lib/roles.ts, not lib/auth.ts -- split out so client components
  // can import the role list/type without pulling in lib/auth.ts's
  // server-only Supabase clients (lib/supabase-ssr.ts imports next/headers,
  // which Next.js rejects from a client bundle).
  const source = await readFile(new URL("lib/roles.ts", root), "utf8");
  assert.match(
    source,
    /APPLICATION_ROLES = \["super_admin", "admin", "accreditation", "content"\] as const/,
  );
  const authSource = await readFile(new URL("lib/auth.ts", root), "utf8");
  assert.match(authSource, /from "@\/lib\/roles"/);
});

test("getAuthContext never trusts a role from anywhere but the profiles row, and requires an active account", async () => {
  const source = await readFile(new URL("lib/auth.ts", root), "utf8");
  const start = source.indexOf("export async function getAuthContext");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);
  assert.match(body, /auth\.getUser\(\)/, "must use the server-verified getUser(), not getSession()");
  assert.doesNotMatch(body, /getSession\(\)/);
  assert.match(body, /account_status\s*!==\s*"active"/);
  assert.match(body, /from\("profiles"\)/);
});

test("page guards redirect; API guards return a typed result instead of throwing", async () => {
  const source = await readFile(new URL("lib/auth.ts", root), "utf8");
  assert.match(source, /export async function requireUser\(\)/);
  assert.match(source, /export async function requirePageRole\(/);
  assert.match(source, /export async function requireAdmin\(\)/);
  assert.match(source, /export async function requireSuperAdmin\(\)/);
  assert.match(source, /requirePageRole\("super_admin", "admin"\)/);
  assert.match(source, /requirePageRole\("super_admin"\)/);

  assert.match(source, /export type ApiAuthResult = \{ context: AuthContext \} \| \{ error: NextResponse \}/);
  assert.match(source, /export async function requireApiUser\(\)/);
  assert.match(source, /export async function requireApiRole\(/);
  assert.match(source, /export async function requireApiAdmin\(\)/);
  assert.match(source, /export async function requireApiSuperAdmin\(\)/);
  assert.match(source, /status: 401/);
  assert.match(source, /status: 403/);
});

test("landingPathForRole sends accreditation and content to their own areas", async () => {
  const source = await readFile(new URL("lib/auth.ts", root), "utf8");
  const start = source.indexOf("export function landingPathForRole");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);
  assert.match(body, /case "accreditation":\s*\n\s*return "\/accreditation"/);
  assert.match(body, /case "content":\s*\n\s*return "\/versions"/);
});

test("every Wrike and course API route checks the real authenticated role, not a hardcoded demo role", async () => {
  const routeFiles = [
    "app/api/wrike/connect/route.ts",
    "app/api/wrike/disconnect/route.ts",
    "app/api/wrike/health/route.ts",
    "app/api/wrike/sync/route.ts",
    "app/api/wrike/sync/status/route.ts",
    "app/api/course-versions/[id]/wrike/link/route.ts",
    "app/api/course-versions/[id]/wrike/search/route.ts",
    "app/api/course-versions/[id]/wrike/verify/route.ts",
    "app/api/courses/[id]/route.ts",
    "app/api/courses/[id]/tags/route.ts",
    "app/api/courses/[id]/topics/route.ts",
    "app/api/courses/[id]/resolution/route.ts",
    "app/api/tags/[id]/courses/route.ts",
    "app/api/topics/[id]/courses/route.ts",
    "app/api/lms/retrieve/route.ts",
    "app/api/admin/users/route.ts",
    "app/api/admin/users/[id]/route.ts",
    "app/api/admin/users/[id]/resend/route.ts",
    "app/api/admin/users/transfer-superadmin/route.ts",
    "app/api/profile/route.ts",
    "app/api/wrike/synced-tasks/route.ts",
  ];
  const sources = await Promise.all(routeFiles.map((file) => readFile(new URL(file, root), "utf8")));
  for (const [index, source] of sources.entries()) {
    assert.match(source, /require(Api\w+)/, `${routeFiles[index]} should call a lib/auth.ts guard`);
    assert.doesNotMatch(source, /getChatGPTUser|demoUser/i, `${routeFiles[index]} must not reference the retired fake-auth path`);
  }
});

test("login verifies application membership after Supabase accepts the password", async () => {
  const login = await readFile(new URL("components/auth/login-form.tsx", root), "utf8");
  const browserClient = await readFile(new URL("lib/supabase-browser.ts", root), "utf8");
  const runtimeConfig = await readFile(new URL("app/api/auth/config/route.ts", root), "utf8");
  const access = await readFile(new URL("app/api/auth/access/route.ts", root), "utf8");
  assert.match(login, /signInWithPassword/);
  assert.match(login, /await createSupabaseBrowserClient\(\)/);
  assert.match(login, /fetch\("\/api\/auth\/access"/);
  assert.match(login, /supabase\.auth\.signOut\(\)/);
  assert.match(browserClient, /fetch\("\/api\/auth\/config"/);
  assert.doesNotMatch(browserClient, /process\.env/);
  assert.match(runtimeConfig, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(runtimeConfig, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(runtimeConfig, /Cache-Control/);
  assert.match(access, /membership_missing/);
  assert.match(access, /account_disabled/);
  assert.match(access, /auth_schema_not_ready/);
  assert.match(access, /landingPathForRole/);
});

test("auth callback accepts both PKCE codes and one-time recovery token hashes", async () => {
  const source = await readFile(new URL("app/auth/callback/route.ts", root), "utf8");
  assert.match(source, /exchangeCodeForSession\(code\)/);
  assert.match(source, /type === "recovery"/);
  assert.match(source, /verifyOtp\(\{ token_hash: tokenHash, type: "recovery" \}\)/);
});
