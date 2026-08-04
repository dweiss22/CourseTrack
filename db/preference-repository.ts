import { getSupabaseAdminClient } from "@/lib/supabase-server";
import {
  courseLibraryOptionalColumns,
  DEFAULT_COURSE_LIBRARY_PREFERENCES,
  type CourseLibraryPreferences,
} from "@/types/preferences";
import type { AuthContext } from "@/lib/auth";

const KEY = "course-library";

function database() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("CourseTrack persistence is not configured.");
  return client;
}

export function normalizeCourseLibraryPreferences(value: unknown): CourseLibraryPreferences {
  if (!value || typeof value !== "object") return DEFAULT_COURSE_LIBRARY_PREFERENCES;
  const visible = (value as { visibleColumns?: unknown }).visibleColumns;
  if (!Array.isArray(visible)) return DEFAULT_COURSE_LIBRARY_PREFERENCES;
  const allowed = new Set<string>(courseLibraryOptionalColumns);
  return { visibleColumns: [...new Set(visible.filter((item): item is CourseLibraryPreferences["visibleColumns"][number] => typeof item === "string" && allowed.has(item)))] };
}

export async function getCourseLibraryPreferences(userId: string): Promise<CourseLibraryPreferences> {
  const { data, error } = await database()
    .from("user_preferences")
    .select("preference_value")
    .eq("user_id", userId)
    .eq("preference_key", KEY)
    .maybeSingle();
  if (error) throw new Error(`Could not load Course Library preferences: ${error.message}`);
  return data ? normalizeCourseLibraryPreferences(data.preference_value) : DEFAULT_COURSE_LIBRARY_PREFERENCES;
}

export async function saveCourseLibraryPreferences(
  value: CourseLibraryPreferences,
  actor: AuthContext,
): Promise<CourseLibraryPreferences> {
  const normalized = normalizeCourseLibraryPreferences(value);
  const { error } = await database().rpc("set_user_preference", {
    p_preference_key: KEY,
    p_preference_value: normalized,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
  });
  if (error) throw new Error(`Could not save Course Library preferences: ${error.message}`);
  return normalized;
}
