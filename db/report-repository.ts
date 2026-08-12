import { getSupabaseAdminClient } from "@/lib/supabase-server";
import type { AuthContext } from "@/lib/auth";
import { migrateLegacyReportDefinition, prebuiltDefinition, REPORT_TEMPLATES, validateReportDefinition } from "@/lib/report-engine";
import type { ReportDefinition } from "@/types/reports";

type Row = Record<string, unknown>;

function database() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("CourseTrack persistence is not configured.");
  return client;
}

function mapSaved(row: Row, ownerName: string | null): ReportDefinition {
  const definition = row.definition as Omit<ReportDefinition, "id" | "name" | "ownerId" | "ownerName" | "sourceTemplateId" | "immutable" | "createdAt" | "updatedAt" | "archivedAt">;
  const migrated = migrateLegacyReportDefinition(definition);
  const validated = validateReportDefinition({ name: String(row.name), sourceTemplateId: row.source_template_key ? String(row.source_template_key) : null, dataset: migrated.dataset, columns: migrated.columns, filters: migrated.filters, sort: migrated.sort, group: migrated.group });
  return {
    id: String(row.id), name: String(row.name), ownerId: String(row.owner_id), ownerName,
    sourceTemplateId: row.source_template_key ? String(row.source_template_key) : null,
    dataset: validated.dataset, columns: validated.columns, filters: validated.filters,
    sort: validated.sort, group: validated.group, immutable: false,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

async function savedDefinitions(includeArchived = false): Promise<ReportDefinition[]> {
  const client = database();
  let query = client.from("report_definitions").select("id,owner_id,source_template_key,name,definition,created_at,updated_at,archived_at").order("updated_at", { ascending: false });
  if (!includeArchived) query = query.is("archived_at", null);
  const [{ data, error }, profiles] = await Promise.all([query, client.from("profiles").select("id,display_name,email")]);
  if (error) throw new Error(`Could not load reports: ${error.message}`);
  if (profiles.error) throw new Error(`Could not load report owners: ${profiles.error.message}`);
  const names = new Map((profiles.data ?? []).map((profile) => [String(profile.id), String(profile.display_name || profile.email)]));
  return (data ?? []).map((row) => mapSaved(row as Row, names.get(String(row.owner_id)) ?? null));
}

export async function listReports(includeArchived = false): Promise<ReportDefinition[]> {
  return [...REPORT_TEMPLATES.map(prebuiltDefinition), ...(await savedDefinitions(includeArchived))];
}

export async function getReportDefinition(id: string, includeArchived = false): Promise<ReportDefinition | null> {
  const template = REPORT_TEMPLATES.find((item) => item.id === id);
  if (template) return prebuiltDefinition(template);
  const saved = await savedDefinitions(includeArchived);
  return saved.find((item) => item.id === id) ?? null;
}

export async function saveReport(input: {
  id?: string; name: string; sourceTemplateId?: string | null; dataset: ReportDefinition["dataset"];
  columns: string[]; filters: ReportDefinition["filters"]; sort: ReportDefinition["sort"];
  group: ReportDefinition["group"]; expectedUpdatedAt?: string; actor: AuthContext;
}): Promise<ReportDefinition> {
  const validated = validateReportDefinition({ name: input.name, sourceTemplateId: input.sourceTemplateId, dataset: input.dataset, columns: input.columns, filters: input.filters, sort: input.sort, group: input.group, expectedUpdatedAt: input.expectedUpdatedAt });
  const { data, error } = await database().rpc("save_report_definition", {
    p_report_id: input.id ?? null, p_name: validated.name,
    p_source_template_key: input.id ? null : validated.sourceTemplateId ?? null,
    p_definition: { dataset: validated.dataset, columns: validated.columns, filters: validated.filters, sort: validated.sort, group: validated.group },
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_actor_id: input.actor.userId, p_actor_email: input.actor.email,
  });
  if (error) throw new Error(`Could not save the report: ${error.message}`);
  return mapSaved(data as Row, input.actor.displayName);
}

export async function duplicateReport(source: ReportDefinition, name: string, actor: AuthContext) {
  return saveReport({ name, sourceTemplateId: source.sourceTemplateId ?? (source.immutable ? source.id : null), dataset: source.dataset, columns: source.columns, filters: source.filters, sort: source.sort, group: source.group, actor });
}

export async function setReportArchived(input: { id: string; archived: boolean; expectedUpdatedAt: string; actor: AuthContext }) {
  const { data, error } = await database().rpc("set_report_archived", { p_report_id: input.id, p_archived: input.archived, p_expected_updated_at: input.expectedUpdatedAt, p_actor_id: input.actor.userId, p_actor_email: input.actor.email });
  if (error) throw new Error(`Could not ${input.archived ? "archive" : "restore"} the report: ${error.message}`);
  return mapSaved(data as Row, input.actor.displayName);
}
