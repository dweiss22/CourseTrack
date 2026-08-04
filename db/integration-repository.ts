import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { LMS_MAPPING_REGISTRY, UPLOADED_MAPPING_REGISTRY, WRIKE_IGNORED_RAW_FIELDS, WRIKE_MAPPING_REGISTRY } from "@/lib/integration-mappings";
import type { IntegrationMappingSummary } from "@/types/integrations";

export async function getIntegrationMappingSummary(): Promise<IntegrationMappingSummary> {
  const client = getSupabaseAdminClient(); if (!client) throw new Error("CourseTrack persistence is not configured.");
  const [run, record, taskCount, contactCount, folderCount, sourceFolders, syncRun, running] = await Promise.all([
    client.from("content_metadata_import_runs").select("id,source_filename,status,column_mapping,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("content_metadata_records").select("raw_payload,mapping_warnings,validation_errors").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("wrike_tasks").select("id", { count: "exact", head: true }).eq("is_active", true),
    client.from("wrike_contacts").select("contact_id", { count: "exact", head: true }),
    client.from("wrike_folder_index").select("folder_id", { count: "exact", head: true }),
    client.from("wrike_source_folders").select("name").eq("enabled", true).order("name"),
    client.from("wrike_sync_runs").select("status,started_at,errors").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("wrike_sync_runs").select("id", { count: "exact", head: true }).eq("status", "running"),
  ]);
  for (const result of [run, record, taskCount, contactCount, folderCount, sourceFolders, syncRun, running]) if (result.error) throw new Error(`Could not load Integration Mapping: ${result.error.message}`);
  const rawFields = Object.keys((record.data?.raw_payload as Record<string, unknown> | null) ?? {});
  const mappedSources = new Set(UPLOADED_MAPPING_REGISTRY.map((mapping) => mapping.source));
  return {
    uploaded: { sourceFilename: run.data?.source_filename ?? null, importedAt: run.data?.created_at ?? null, status: run.data?.status ?? null, mappings: UPLOADED_MAPPING_REGISTRY, ignoredFields: rawFields.filter((field) => !mappedSources.has(field) && ["Notes", "Backend Link"].includes(field)), unmappedRawFields: rawFields.filter((field) => !mappedSources.has(field) && !["Notes", "Backend Link"].includes(field)), warnings: ((record.data?.mapping_warnings as unknown[]) ?? []).length, validationErrors: ((record.data?.validation_errors as unknown[]) ?? []).length, provenance: "Uploaded" },
    wrike: { mappings: WRIKE_MAPPING_REGISTRY, ignoredFields: WRIKE_IGNORED_RAW_FIELDS, approvedFolders: (sourceFolders.data ?? []).map((folder) => folder.name as string), taskCount: taskCount.count ?? 0, contactCount: contactCount.count ?? 0, folderCount: folderCount.count ?? 0, lastRunStatus: syncRun.data?.status ?? null, lastRunAt: syncRun.data?.started_at ?? null, currentRun: (running.count ?? 0) > 0, warnings: ((syncRun.data?.errors as Array<{ error?: string }> | null) ?? []).flatMap((item) => item.error ? [item.error] : []), provenance: "Read-only Wrike GET" },
    lms: { status: "Not connected", mappings: LMS_MAPPING_REGISTRY, lastRetrievedAt: null, warnings: ["Provider documentation and endpoint contracts are not configured. No mapping has been invented."], provenance: null },
  };
}
