begin;

alter table public.courses
  add column if not exists management_classification text not null default 'Unclassified',
  add column if not exists monitoring_enabled boolean not null default true,
  add column if not exists reconciliation_status text not null default 'LMS only / missing Content Metadata',
  add column if not exists resolved_fields jsonb not null default '{}',
  add column if not exists source_timestamps jsonb not null default '{}',
  add column if not exists mapping_warnings jsonb not null default '[]',
  add column if not exists import_validation_errors jsonb not null default '[]';

alter table public.lms_snapshots
  add column if not exists raw_payload jsonb not null default '{}';

create table if not exists public.content_metadata_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  status text not null check (status in ('Preview', 'Confirmed', 'Completed', 'Completed with warnings', 'Failed')),
  column_mapping jsonb not null default '{}',
  preview_summary jsonb not null default '{}',
  row_count integer not null default 0 check (row_count >= 0),
  imported_by uuid references public.profiles(id),
  imported_by_email text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.content_metadata_records (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.content_metadata_import_runs(id) on delete cascade,
  row_number integer not null,
  course_id uuid references public.courses(id) on delete set null,
  raw_course_id jsonb,
  lms_course_id text,
  normalized_payload jsonb not null default '{}',
  raw_payload jsonb not null default '{}',
  mapping_warnings jsonb not null default '[]',
  validation_errors jsonb not null default '[]',
  is_importable boolean not null default false,
  created_at timestamptz not null default now(),
  unique (import_run_id, row_number)
);

create table if not exists public.field_comparisons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  field_key text not null,
  field_label text not null,
  lms_raw_value jsonb,
  lms_normalized_value jsonb,
  content_metadata_raw_value jsonb,
  content_metadata_normalized_value jsonb,
  resolved_value jsonb,
  selected_source text check (selected_source is null or selected_source in ('lms', 'content_metadata')),
  comparison_status text not null default 'Unresolved' check (
    comparison_status in ('Match', 'Conflict', 'LMS only', 'Content Metadata only', 'Missing from both', 'Invalid', 'Unresolved')
  ),
  resolution_reason text,
  resolved_by uuid references public.profiles(id),
  resolved_by_email text,
  resolved_at timestamptz,
  last_compared_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, field_key)
);

create table if not exists public.monitoring_classifications (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lms_course_id text not null,
  classification text not null check (
    classification in ('Lexipol managed', 'Non-Lexipol tracked', 'Non-Lexipol excluded', 'Unclassified')
  ),
  monitoring_enabled boolean not null,
  reason text,
  owner_name text,
  effective_date date,
  source text not null,
  import_run_id uuid references public.content_metadata_import_runs(id) on delete set null,
  raw_payload jsonb not null default '{}',
  classified_by uuid references public.profiles(id),
  classified_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  normalized_label text not null unique,
  display_label text not null,
  original_label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.course_topics (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  external_course_id text not null,
  assignment_source text not null check (
    assignment_source in ('LMS Public Topic', 'LMS Private Topic', 'Topics import')
  ),
  import_run_id uuid references public.content_metadata_import_runs(id) on delete set null,
  imported_at timestamptz,
  raw_value jsonb,
  created_at timestamptz not null default now(),
  unique (topic_id, external_course_id, assignment_source, import_run_id)
);

create table if not exists public.course_relationships (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('parent', 'child')),
  related_course_id uuid references public.courses(id) on delete set null,
  related_lms_course_id text not null,
  source text not null check (source in ('Content Metadata', 'CourseTrack')),
  validation_status text not null check (
    validation_status in ('Resolved', 'Missing target', 'Self reference', 'Circular')
  ),
  raw_value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_validation_errors (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.content_metadata_import_runs(id) on delete cascade,
  source_type text not null check (source_type in ('Content Metadata', 'Topics', 'Monitoring list')),
  row_number integer,
  column_name text,
  raw_value jsonb,
  error_code text not null,
  message text not null,
  severity text not null check (severity in ('Warning', 'Error', 'Blocked')),
  external_course_id text,
  created_at timestamptz not null default now()
);

create index if not exists courses_management_classification_idx
  on public.courses(management_classification, monitoring_enabled);
create index if not exists courses_reconciliation_status_idx
  on public.courses(reconciliation_status);
create index if not exists content_metadata_course_id_idx
  on public.content_metadata_records(lms_course_id);
create index if not exists content_metadata_run_idx
  on public.content_metadata_records(import_run_id, is_importable);
create index if not exists field_comparisons_conflict_idx
  on public.field_comparisons(course_id, comparison_status, selected_source);
create index if not exists monitoring_course_id_idx
  on public.monitoring_classifications(lms_course_id, effective_date desc);
create index if not exists topics_label_trgm_idx
  on public.topics using gin (display_label gin_trgm_ops);
create index if not exists course_topics_course_idx
  on public.course_topics(course_id, assignment_source);
create index if not exists course_topics_external_idx
  on public.course_topics(external_course_id);
create index if not exists course_relationships_course_idx
  on public.course_relationships(course_id, relationship_type);
create index if not exists import_validation_run_idx
  on public.import_validation_errors(import_run_id, severity);

alter table public.content_metadata_import_runs enable row level security;
alter table public.content_metadata_records enable row level security;
alter table public.field_comparisons enable row level security;
alter table public.monitoring_classifications enable row level security;
alter table public.topics enable row level security;
alter table public.course_topics enable row level security;
alter table public.course_relationships enable row level security;
alter table public.import_validation_errors enable row level security;

drop policy if exists content_import_runs_manage on public.content_metadata_import_runs;
create policy content_import_runs_manage on public.content_metadata_import_runs
for all to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));

drop policy if exists content_records_manage on public.content_metadata_records;
create policy content_records_manage on public.content_metadata_records
for all to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));

drop policy if exists field_comparisons_read on public.field_comparisons;
create policy field_comparisons_read on public.field_comparisons
for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists field_comparisons_write on public.field_comparisons;
create policy field_comparisons_write on public.field_comparisons
for all to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));

drop policy if exists monitoring_classifications_read on public.monitoring_classifications;
create policy monitoring_classifications_read on public.monitoring_classifications
for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists monitoring_classifications_write on public.monitoring_classifications;
create policy monitoring_classifications_write on public.monitoring_classifications
for all to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));

drop policy if exists topics_read on public.topics;
create policy topics_read on public.topics
for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists course_topics_read on public.course_topics;
create policy course_topics_read on public.course_topics
for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists topics_write on public.topics;
create policy topics_write on public.topics
for all to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));
drop policy if exists course_topics_write on public.course_topics;
create policy course_topics_write on public.course_topics
for all to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));

drop policy if exists course_relationships_read on public.course_relationships;
create policy course_relationships_read on public.course_relationships
for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists course_relationships_write on public.course_relationships;
create policy course_relationships_write on public.course_relationships
for all to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));

drop policy if exists import_validation_manage on public.import_validation_errors;
create policy import_validation_manage on public.import_validation_errors
for all to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));

create or replace function public.resolve_course_field(
  p_app_id text,
  p_actor_email text,
  p_field_key text,
  p_selected_source text,
  p_resolved_value jsonb,
  p_resolution_reason text,
  p_resolved_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_course_id uuid;
  previous_values jsonb;
begin
  select id into target_course_id
  from public.courses
  where app_id = p_app_id;

  if target_course_id is null then
    return false;
  end if;

  select jsonb_build_object(
    'selectedSource', selected_source,
    'resolvedValue', resolved_value,
    'resolutionReason', resolution_reason,
    'resolvedAt', resolved_at
  ) into previous_values
  from public.field_comparisons
  where course_id = target_course_id and field_key = p_field_key;

  insert into public.field_comparisons (
    course_id,
    field_key,
    field_label,
    resolved_value,
    selected_source,
    resolution_reason,
    resolved_by_email,
    resolved_at,
    updated_at
  ) values (
    target_course_id,
    p_field_key,
    p_field_key,
    p_resolved_value,
    p_selected_source,
    p_resolution_reason,
    case when p_selected_source is null then null else p_actor_email end,
    case when p_selected_source is null then null else p_resolved_at end,
    now()
  )
  on conflict (course_id, field_key) do update set
    resolved_value = excluded.resolved_value,
    selected_source = excluded.selected_source,
    resolution_reason = excluded.resolution_reason,
    resolved_by_email = excluded.resolved_by_email,
    resolved_at = excluded.resolved_at,
    updated_at = now();

  insert into public.audit_logs (
    actor_email,
    action,
    record_type,
    record_id,
    previous_values,
    new_values,
    source,
    reason
  ) values (
    p_actor_email,
    case when p_selected_source is null then 'course.field_resolution_cleared' else 'course.field_resolution_selected' end,
    'field_comparison',
    p_app_id || ':' || p_field_key,
    previous_values,
    jsonb_build_object(
      'selectedSource', p_selected_source,
      'resolvedValue', p_resolved_value,
      'resolutionReason', p_resolution_reason,
      'resolvedAt', p_resolved_at
    ),
    'CourseTrack',
    p_resolution_reason
  );

  return true;
end;
$$;

revoke all on function public.resolve_course_field(
  text, text, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.resolve_course_field(
  text, text, text, text, jsonb, text, timestamptz
) to service_role;

commit;
