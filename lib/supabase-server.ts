import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseConfiguration = {
  url: string;
  secretKey: string;
};

let cachedClient: SupabaseClient | null = null;
let cachedConfigurationKey: string | null = null;

function readConfiguration(): SupabaseConfiguration | null {
  const dataMode = (
    process.env.COURSETRACK_DATA_MODE ?? "supabase"
  ).toLowerCase();
  if (dataMode !== "supabase") {
    throw new Error(
      'COURSETRACK_DATA_MODE must be "supabase".',
    );
  }

  const url = (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  ).trim();
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  ).trim();

  if (!url && !secretKey) return null;
  if (!url || !secretKey) {
    throw new Error(
      "Supabase is only partially configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) together.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL must be a valid HTTPS URL.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }

  return { url: parsedUrl.toString().replace(/\/$/, ""), secretKey };
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  const configuration = readConfiguration();
  if (!configuration) return null;

  const configurationKey = `${configuration.url}\u0000${configuration.secretKey}`;
  if (cachedClient && cachedConfigurationKey === configurationKey) {
    return cachedClient;
  }

  cachedClient = createClient(configuration.url, configuration.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "coursetrack-server",
      },
    },
  });
  cachedConfigurationKey = configurationKey;
  return cachedClient;
}
