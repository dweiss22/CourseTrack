import { createClient } from "@supabase/supabase-js";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = argument("email")?.toLowerCase();
const displayName = argument("display-name") || email;

if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY before bootstrapping.");
if (!email) throw new Error("Provide --email for the confirmed Supabase Auth user.");

const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  global: { headers: { "X-Client-Info": "coursetrack-bootstrap" } },
});

async function findAuthUserByEmail(targetEmail) {
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list Supabase Auth users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

const authUser = await findAuthUserByEmail(email);
if (!authUser) throw new Error(`No Supabase Auth user exists for ${email}.`);
if (!authUser.email_confirmed_at) throw new Error(`The Supabase Auth email for ${email} is not confirmed.`);

const { data: existingSuperAdmin, error: holderError } = await client
  .from("profiles")
  .select("id,email")
  .eq("role", "super_admin")
  .maybeSingle();
if (holderError) {
  throw new Error(`The role migration is not ready: ${holderError.message}`);
}
if (existingSuperAdmin && existingSuperAdmin.id !== authUser.id) {
  throw new Error(`A different superadmin already exists: ${existingSuperAdmin.email}. Use the transfer workflow.`);
}

const { error: profileError } = await client.from("profiles").upsert(
  {
    id: authUser.id,
    email,
    display_name: displayName,
    role: "super_admin",
    account_status: "active",
    created_by: null,
  },
  { onConflict: "id" },
);
if (profileError) throw new Error(`Could not bootstrap the superadmin profile: ${profileError.message}`);

console.log(`Superadmin profile is active for ${email} (${authUser.id}).`);
