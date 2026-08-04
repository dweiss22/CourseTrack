import { getSupabaseAdminClient } from "@/lib/supabase-server";
import type { TaskCalloutActor } from "@/types/course";

export async function getActiveAssignees(): Promise<TaskCalloutActor[]> {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("CourseTrack persistence is not configured.");
  const { data, error } = await client
    .from("profiles")
    .select("id,display_name,email")
    .eq("account_status", "active")
    .order("display_name");
  if (error) throw new Error(`Could not load active CourseTrack profiles: ${error.message}`);
  return (data ?? []).map((profile) => ({
    id: profile.id as string,
    displayName: (profile.display_name as string | null) || (profile.email as string),
    email: profile.email as string,
  }));
}
