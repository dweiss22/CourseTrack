begin;

-- CourseTrack operational preferences, task/callout workflows, reports, and
-- normalized Wrike discovery. This migration is intentionally additive and
-- does not remove uploaded source records or ambiguous legacy records.

create table if not exists public.user_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  preference_key text not null,
  preference_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, preference_key),
  check (length(preference_key) between 1 and 120)
);

alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_own on public.user_preferences;
create policy user_preferences_own on public.user_preferences
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at before update on public.user_preferences
for each row execute function public.set_updated_at();

create or replace function public.set_user_preference(
  p_preference_key text,
  p_preference_value jsonb,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.user_preferences%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:view');
  if p_preference_key is null or length(trim(p_preference_key)) not between 1 and 120 then
    raise exception 'Preference key is invalid.' using errcode = '22023';
  end if;
  insert into public.user_preferences(user_id, preference_key, preference_value)
  values (p_actor_id, trim(p_preference_key), coalesce(p_preference_value, '{}'::jsonb))
  on conflict (user_id, preference_key) do update
  set preference_value = excluded.preference_value, updated_at = now()
  returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.set_user_preference(text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.set_user_preference(text, jsonb, uuid, text) to service_role;

-- Canonical health cache maintenance. Application reads recompute from the
-- same constants; these triggers keep materialized import/reconciliation
-- columns consistent without treating them as independently authored truth.
create or replace function public.course_health_score(
  p_metadata_completeness numeric,
  p_unresolved_conflicts integer,
  p_import_validation_errors integer,
  p_has_current_lms_snapshot boolean
)
returns integer language sql immutable as $$
  select greatest(10, least(100,
    round(coalesce(p_metadata_completeness, 0))::integer
    - 7 * greatest(coalesce(p_unresolved_conflicts, 0), 0)
    - 15 * greatest(coalesce(p_import_validation_errors, 0), 0)
    - case when p_has_current_lms_snapshot then 0 else 10 end
  ));
$$;

create or replace function public.course_health_level(p_score integer)
returns text language sql immutable as $$
  select case when p_score >= 85 then 'Healthy' when p_score >= 70 then 'Monitor'
    when p_score >= 55 then 'Needs Review' when p_score >= 35 then 'At Risk' else 'Critical' end;
$$;

create or replace function public.set_course_health_cache()
returns trigger language plpgsql set search_path = public as $$
declare score integer;
begin
  score := public.course_health_score(
    new.metadata_completeness_score,
    (select count(*)::integer from public.field_comparisons where course_id = new.id and comparison_status = 'Conflict' and selected_source is null),
    jsonb_array_length(coalesce(new.import_validation_errors, '[]'::jsonb)),
    exists (select 1 from public.lms_snapshots where course_id = new.id and is_current)
  );
  new.health_score := score;
  new.health_status := public.course_health_level(score);
  return new;
end;
$$;

drop trigger if exists courses_health_cache on public.courses;
create trigger courses_health_cache before insert or update of metadata_completeness_score, import_validation_errors on public.courses
for each row execute function public.set_course_health_cache();

create or replace function public.refresh_related_course_health_cache()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_id uuid;
begin
  if tg_op = 'DELETE' then
    target_id := old.course_id;
  else
    target_id := new.course_id;
  end if;
  update public.courses set metadata_completeness_score = metadata_completeness_score where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists field_comparisons_refresh_health on public.field_comparisons;
create trigger field_comparisons_refresh_health after insert or update or delete on public.field_comparisons
for each row execute function public.refresh_related_course_health_cache();
drop trigger if exists lms_snapshots_refresh_health on public.lms_snapshots;
create trigger lms_snapshots_refresh_health after insert or update or delete on public.lms_snapshots
for each row execute function public.refresh_related_course_health_cache();

update public.courses set metadata_completeness_score = metadata_completeness_score;

-- Expand the existing flag table into the shared Task/Callout model. Legacy
-- flags become Callouts by default; their category, ownership, due dates, and
-- history are preserved exactly.
alter table public.course_flags
  add column if not exists record_kind text not null default 'Callout',
  add column if not exists description text not null default '',
  add column if not exists completion_notes text,
  add column if not exists completed_by uuid references public.profiles(id),
  add column if not exists completed_at timestamptz;

update public.course_flags set status = 'In Progress' where status = 'Under Review';
update public.course_flags set status = 'Resolved' where status = 'Dismissed';

alter table public.course_flags drop constraint if exists course_flags_record_kind_check;
alter table public.course_flags add constraint course_flags_record_kind_check
  check (record_kind in ('Task', 'Callout'));
alter table public.course_flags drop constraint if exists course_flags_status_check;
alter table public.course_flags add constraint course_flags_status_check
  check (status in ('Open', 'In Progress', 'Blocked', 'Completed', 'Resolved'));
alter table public.course_flags drop constraint if exists course_flags_kind_status_check;
alter table public.course_flags add constraint course_flags_kind_status_check check (
  (record_kind = 'Task' and status in ('Open', 'In Progress', 'Blocked', 'Completed')) or
  (record_kind = 'Callout' and status in ('Open', 'In Progress', 'Blocked', 'Resolved'))
);

create index if not exists course_flags_workspace_idx
  on public.course_flags(record_kind, status, priority, owner_id, due_date)
  where archived_at is null;
create index if not exists course_flags_archived_idx
  on public.course_flags(archived_at desc)
  where archived_at is not null;

create or replace function public.save_task_callout(
  p_record_id uuid,
  p_course_app_id text,
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_course_id uuid;
  previous public.course_flags%rowtype;
  changed public.course_flags%rowtype;
  target_owner uuid;
  next_kind text := p_payload->>'recordKind';
  next_status text := p_payload->>'status';
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'flags:manage');

  if next_kind not in ('Task', 'Callout') then
    raise exception 'Task/callout type is invalid.' using errcode = '22023';
  end if;
  if (next_kind = 'Task' and next_status not in ('Open', 'In Progress', 'Blocked', 'Completed'))
     or (next_kind = 'Callout' and next_status not in ('Open', 'In Progress', 'Blocked', 'Resolved')) then
    raise exception 'Status is not valid for this record type.' using errcode = '22023';
  end if;

  target_owner := nullif(p_payload->>'assigneeId', '')::uuid;
  if target_owner is not null and not exists (
    select 1 from public.profiles where id = target_owner and account_status = 'active'
  ) then
    raise exception 'Assignee is not an active CourseTrack user.' using errcode = '22023';
  end if;

  if p_record_id is null then
    select id into target_course_id from public.courses
    where app_id = p_course_app_id and archived_at is null;
    if target_course_id is null then raise exception 'Course not found.' using errcode = 'P0002'; end if;

    insert into public.course_flags(
      course_id, record_kind, type, title, description, priority, status,
      owner_id, due_date, completion_notes, completed_by, completed_at,
      resolved_by, resolved_at, provenance, origin_provenance,
      created_by, updated_by
    ) values (
      target_course_id, next_kind, p_payload->>'category', trim(p_payload->>'title'),
      coalesce(p_payload->>'description', ''), p_payload->>'priority', next_status,
      target_owner, nullif(p_payload->>'dueDate', '')::date,
      nullif(p_payload->>'completionNotes', ''),
      case when next_status = 'Completed' then p_actor_id else null end,
      case when next_status = 'Completed' then now() else null end,
      case when next_status = 'Resolved' then p_actor_id else null end,
      case when next_status = 'Resolved' then now() else null end,
      'coursetrack', 'coursetrack', p_actor_id, p_actor_id
    ) returning * into changed;
  else
    select * into previous from public.course_flags
    where id = p_record_id and archived_at is null for update;
    if previous.id is null then raise exception 'Task or callout not found.' using errcode = 'P0002'; end if;
    if previous.provenance = 'lms_api' then raise exception 'Connected LMS API records are read-only.' using errcode = '42501'; end if;
    if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then
      raise exception 'Record changed since it was loaded.' using errcode = '40001';
    end if;

    update public.course_flags set
      record_kind = next_kind,
      type = p_payload->>'category',
      title = trim(p_payload->>'title'),
      description = coalesce(p_payload->>'description', ''),
      priority = p_payload->>'priority',
      status = next_status,
      owner_id = target_owner,
      due_date = nullif(p_payload->>'dueDate', '')::date,
      completion_notes = nullif(p_payload->>'completionNotes', ''),
      completed_by = case when next_status = 'Completed' then coalesce(previous.completed_by, p_actor_id) else null end,
      completed_at = case when next_status = 'Completed' then coalesce(previous.completed_at, now()) else null end,
      resolved_by = case when next_status = 'Resolved' then coalesce(previous.resolved_by, p_actor_id) else null end,
      resolved_at = case when next_status = 'Resolved' then coalesce(previous.resolved_at, now()) else null end,
      provenance = 'coursetrack', updated_by = p_actor_id, updated_at = now()
    where id = p_record_id returning * into changed;
  end if;

  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (
    p_actor_id, lower(trim(p_actor_email)),
    case when p_record_id is null then 'task_callout.created' else 'task_callout.updated' end,
    'task_callout', changed.id::text,
    case when p_record_id is null then null else to_jsonb(previous) end,
    to_jsonb(changed), 'CourseTrack'
  );
  return to_jsonb(changed);
end;
$$;
revoke all on function public.save_task_callout(uuid, text, jsonb, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.save_task_callout(uuid, text, jsonb, timestamptz, uuid, text) to service_role;

create or replace function public.restore_task_callout(
  p_record_id uuid,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare previous public.course_flags%rowtype; changed public.course_flags%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'flags:manage');
  select * into previous from public.course_flags where id = p_record_id and archived_at is not null for update;
  if previous.id is null then raise exception 'Archived task or callout not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then
    raise exception 'Record changed since it was loaded.' using errcode = '40001';
  end if;
  update public.course_flags set archived_at = null, archived_by = null, updated_by = p_actor_id, updated_at = now()
  where id = p_record_id returning * into changed;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), 'task_callout.restored', 'task_callout', changed.id::text, to_jsonb(previous), to_jsonb(changed), 'CourseTrack');
  return to_jsonb(changed);
end;
$$;
revoke all on function public.restore_task_callout(uuid, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.restore_task_callout(uuid, timestamptz, uuid, text) to service_role;

-- Workspace-visible report definitions. The report engine remains allowlisted
-- in application code; this table stores only validated definitions.
create table if not exists public.report_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  source_template_key text,
  name text not null,
  definition jsonb not null,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) between 3 and 160)
);

create index if not exists report_definitions_workspace_idx on public.report_definitions(archived_at, updated_at desc);
create index if not exists report_definitions_owner_idx on public.report_definitions(owner_id, archived_at);
alter table public.report_definitions enable row level security;
drop policy if exists report_definitions_read on public.report_definitions;
create policy report_definitions_read on public.report_definitions for select to authenticated
using (public.has_permission('courses:view'));
drop policy if exists report_definitions_insert on public.report_definitions;
create policy report_definitions_insert on public.report_definitions for insert to authenticated
with check (owner_id = auth.uid() and public.has_permission('courses:view'));
drop policy if exists report_definitions_update on public.report_definitions;
create policy report_definitions_update on public.report_definitions for update to authenticated
using (owner_id = auth.uid() or public.has_permission('administration:manage'))
with check (owner_id = auth.uid() or public.has_permission('administration:manage'));

drop trigger if exists report_definitions_set_updated_at on public.report_definitions;
create trigger report_definitions_set_updated_at before update on public.report_definitions
for each row execute function public.set_updated_at();

create or replace function public.save_report_definition(
  p_report_id uuid,
  p_name text,
  p_source_template_key text,
  p_definition jsonb,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare previous public.report_definitions%rowtype; changed public.report_definitions%rowtype; actor_role text;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:view');
  select role into actor_role from public.profiles where id = p_actor_id and account_status = 'active';
  if length(trim(p_name)) not between 3 and 160 then raise exception 'Report name is invalid.' using errcode = '22023'; end if;
  if p_report_id is null then
    insert into public.report_definitions(owner_id, source_template_key, name, definition, created_by, updated_by)
    values (p_actor_id, nullif(trim(p_source_template_key), ''), trim(p_name), p_definition, p_actor_id, p_actor_id)
    returning * into changed;
  else
    select * into previous from public.report_definitions where id = p_report_id and archived_at is null for update;
    if previous.id is null then raise exception 'Report not found.' using errcode = 'P0002'; end if;
    if previous.owner_id <> p_actor_id and actor_role not in ('admin', 'super_admin') then
      raise exception 'Permission denied.' using errcode = '42501';
    end if;
    if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then
      raise exception 'Record changed since it was loaded.' using errcode = '40001';
    end if;
    update public.report_definitions set name = trim(p_name), definition = p_definition,
      updated_by = p_actor_id, updated_at = now()
    where id = p_report_id returning * into changed;
  end if;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), case when p_report_id is null then 'report.created' else 'report.updated' end,
    'report_definition', changed.id::text, case when p_report_id is null then null else to_jsonb(previous) end, to_jsonb(changed), 'CourseTrack');
  return to_jsonb(changed);
end;
$$;
revoke all on function public.save_report_definition(uuid, text, text, jsonb, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.save_report_definition(uuid, text, text, jsonb, timestamptz, uuid, text) to service_role;

create or replace function public.set_report_archived(
  p_report_id uuid,
  p_archived boolean,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare previous public.report_definitions%rowtype; changed public.report_definitions%rowtype; actor_role text;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:view');
  select role into actor_role from public.profiles where id = p_actor_id and account_status = 'active';
  select * into previous from public.report_definitions where id = p_report_id for update;
  if previous.id is null then raise exception 'Report not found.' using errcode = 'P0002'; end if;
  if previous.owner_id <> p_actor_id and actor_role not in ('admin', 'super_admin') then raise exception 'Permission denied.' using errcode = '42501'; end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then raise exception 'Record changed since it was loaded.' using errcode = '40001'; end if;
  update public.report_definitions set
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then p_actor_id else null end,
    updated_by = p_actor_id, updated_at = now()
  where id = p_report_id returning * into changed;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), case when p_archived then 'report.archived' else 'report.restored' end,
    'report_definition', changed.id::text, to_jsonb(previous), to_jsonb(changed), 'CourseTrack');
  return to_jsonb(changed);
end;
$$;
revoke all on function public.set_report_archived(uuid, boolean, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.set_report_archived(uuid, boolean, timestamptz, uuid, text) to service_role;

-- Normalize the fields needed by the Wrike Task Link autocomplete while
-- retaining raw payloads. These tables are snapshots of GET responses only.
alter table public.wrike_tasks
  add column if not exists due_date date,
  add column if not exists assignee_names text[] not null default '{}',
  add column if not exists project_ids text[] not null default '{}',
  add column if not exists project_titles text[] not null default '{}',
  add column if not exists search_text text not null default '';

update public.wrike_tasks set search_text = lower(concat_ws(' ', wrike_task_id, title, array_to_string(project_titles, ' ')));

create index if not exists wrike_tasks_search_text_trgm_idx on public.wrike_tasks using gin(search_text gin_trgm_ops);
create index if not exists wrike_tasks_due_idx on public.wrike_tasks(due_date) where is_active;

create table if not exists public.wrike_contacts (
  contact_id text primary key,
  display_name text not null,
  contact_type text,
  active boolean,
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now()
);
create table if not exists public.wrike_folder_index (
  folder_id text primary key,
  title text not null,
  permalink text,
  project_status text,
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now()
);
alter table public.wrike_contacts enable row level security;
alter table public.wrike_folder_index enable row level security;
drop policy if exists wrike_contacts_read on public.wrike_contacts;
create policy wrike_contacts_read on public.wrike_contacts for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists wrike_contacts_admin_write on public.wrike_contacts;
create policy wrike_contacts_admin_write on public.wrike_contacts for all to authenticated
using (public.has_permission('administration:manage')) with check (public.has_permission('administration:manage'));
drop policy if exists wrike_folder_index_read on public.wrike_folder_index;
create policy wrike_folder_index_read on public.wrike_folder_index for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists wrike_folder_index_admin_write on public.wrike_folder_index;
create policy wrike_folder_index_admin_write on public.wrike_folder_index for all to authenticated
using (public.has_permission('administration:manage')) with check (public.has_permission('administration:manage'));

create or replace function public.search_wrike_task_candidates(
  p_query text,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  wrike_task_id text, title text, status text, permalink text,
  due_date date, assignee_names text[], project_ids text[], project_titles text[],
  last_synced_at timestamptz, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select lower(trim(regexp_replace(coalesce(p_query, ''), '[^[:alnum:]]+', ' ', 'g'))) as query
  ), tokens as (
    select value as token from normalized, lateral regexp_split_to_table(query, '\s+') as split(value) where length(value) >= 2
  ), ranked as (
    select task.*,
      case when lower(task.wrike_task_id) = (select query from normalized) then 1000 else 0 end +
      case when lower(task.title) like '%' || (select query from normalized) || '%' then 200 else 0 end +
      (select count(*) * 20 from tokens where task.search_text like '%' || token || '%') as relevance
    from public.wrike_tasks task
    where task.is_active
      and ((select count(*) from tokens) = 0 or exists (
        select 1 from tokens where task.search_text like '%' || token || '%'
      ))
  )
  select ranked.wrike_task_id, ranked.title, ranked.status, ranked.permalink,
    ranked.due_date, ranked.assignee_names, ranked.project_ids, ranked.project_titles,
    ranked.last_synced_at, count(*) over()
  from ranked
  order by ranked.relevance desc, ranked.wrike_updated_date desc nulls last, ranked.title
  limit least(greatest(p_limit, 1), 25) offset greatest(p_offset, 0);
$$;
revoke all on function public.search_wrike_task_candidates(text, integer, integer) from public, anon, authenticated;
grant execute on function public.search_wrike_task_candidates(text, integer, integer) to service_role;

alter table public.version_wrike_task_references
  add column if not exists linked_by uuid references public.profiles(id),
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists verified_by uuid references public.profiles(id),
  add column if not exists unlinked_by uuid references public.profiles(id),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists version_wrike_task_references_set_updated_at on public.version_wrike_task_references;
create trigger version_wrike_task_references_set_updated_at before update on public.version_wrike_task_references
for each row execute function public.set_updated_at();

create or replace function public.save_version_wrike_link(
  p_course_version_id uuid,
  p_task jsonb,
  p_link_method text,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare previous_row public.version_wrike_task_references%rowtype; previous jsonb; changed public.version_wrike_task_references%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'versions:manage');
  perform 1 from public.course_versions where id = p_course_version_id and archived_at is null for update;
  if not found then raise exception 'Course version not found.' using errcode = 'P0002'; end if;
  select * into previous_row from public.version_wrike_task_references v
  where course_version_id = p_course_version_id and unlinked_at is null and provider_name = 'Live Wrike' for update;
  if previous_row.id is not null then
    previous := to_jsonb(previous_row);
    if p_expected_updated_at is null or previous_row.updated_at is distinct from p_expected_updated_at then
      raise exception 'Record changed since it was loaded.' using errcode = '40001';
    end if;
  end if;
  update public.version_wrike_task_references set unlinked_at = now(), unlinked_by = p_actor_id, updated_by = p_actor_id
  where course_version_id = p_course_version_id and unlinked_at is null and provider_name = 'Live Wrike';
  insert into public.version_wrike_task_references(
    course_version_id, external_task_id, task_title, external_project_id, project_title,
    task_status, assignee_names, due_date, permalink, provider_name, retrieved_at,
    linked_by_email, linked_by, updated_by, link_method
  ) values (
    p_course_version_id, p_task->>'id', p_task->>'title', nullif(p_task->>'projectId',''), nullif(p_task->>'projectTitle',''),
    nullif(p_task->>'status',''), coalesce(array(select jsonb_array_elements_text(coalesce(p_task->'assigneeNames','[]'::jsonb))), '{}'),
    nullif(p_task->>'dueDate','')::date, nullif(p_task->>'permalink',''), 'Live Wrike', now(),
    lower(trim(p_actor_email)), p_actor_id, p_actor_id, p_link_method
  ) returning * into changed;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), case when previous is null then 'wrike_link.created' else 'wrike_link.relinked' end,
    'version_wrike_task_reference', changed.id::text, previous, to_jsonb(changed), 'CourseTrack');
  return to_jsonb(changed);
end;
$$;
revoke all on function public.save_version_wrike_link(uuid, jsonb, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.save_version_wrike_link(uuid, jsonb, text, timestamptz, uuid, text) to service_role;

create or replace function public.verify_version_wrike_link(
  p_reference_id uuid,
  p_task jsonb,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare previous public.version_wrike_task_references%rowtype; changed public.version_wrike_task_references%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'versions:manage');
  select * into previous from public.version_wrike_task_references where id = p_reference_id and unlinked_at is null for update;
  if previous.id is null then raise exception 'Active Wrike link not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then raise exception 'Record changed since it was loaded.' using errcode = '40001'; end if;
  update public.version_wrike_task_references set task_title = p_task->>'title', permalink = nullif(p_task->>'permalink',''),
    task_status = nullif(p_task->>'status',''), assignee_names = coalesce(array(select jsonb_array_elements_text(coalesce(p_task->'assigneeNames','[]'::jsonb))), '{}'),
    due_date = nullif(p_task->>'dueDate','')::date, project_title = nullif(p_task->>'projectTitle',''),
    last_verified_at = now(), verified_by = p_actor_id, updated_by = p_actor_id
  where id = p_reference_id returning * into changed;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), 'wrike_link.verified', 'version_wrike_task_reference', changed.id::text, to_jsonb(previous), to_jsonb(changed), 'CourseTrack');
  return to_jsonb(changed);
end;
$$;
revoke all on function public.verify_version_wrike_link(uuid, jsonb, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.verify_version_wrike_link(uuid, jsonb, timestamptz, uuid, text) to service_role;

create or replace function public.unlink_version_wrike_link(
  p_reference_id uuid,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare previous public.version_wrike_task_references%rowtype; changed public.version_wrike_task_references%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'versions:manage');
  select * into previous from public.version_wrike_task_references where id = p_reference_id and unlinked_at is null for update;
  if previous.id is null then raise exception 'Active Wrike link not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then raise exception 'Record changed since it was loaded.' using errcode = '40001'; end if;
  update public.version_wrike_task_references set unlinked_at = now(), unlinked_by = p_actor_id, updated_by = p_actor_id
  where id = p_reference_id returning * into changed;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), 'wrike_link.unlinked', 'version_wrike_task_reference', changed.id::text, to_jsonb(previous), to_jsonb(changed), 'CourseTrack');
  return true;
end;
$$;
revoke all on function public.unlink_version_wrike_link(uuid, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.unlink_version_wrike_link(uuid, timestamptz, uuid, text) to service_role;

create or replace function public.resolve_course_field_v2(
  p_app_id text,
  p_field_key text,
  p_selected_source text,
  p_resolution_reason text,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare target_course_id uuid; previous public.field_comparisons%rowtype; changed public.field_comparisons%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:edit-internal');
  select id into target_course_id from public.courses where app_id = p_app_id and archived_at is null;
  if target_course_id is null then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  select * into previous from public.field_comparisons where course_id = target_course_id and field_key = p_field_key for update;
  if previous.id is null then raise exception 'Source-comparison field not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then raise exception 'Record changed since it was loaded.' using errcode = '40001'; end if;
  if p_selected_source is not null and p_selected_source not in ('lms', 'content_metadata') then raise exception 'Resolution source is invalid.' using errcode = '22023'; end if;
  update public.field_comparisons set resolved_value = case
      when p_selected_source = 'lms' then previous.lms_normalized_value
      when p_selected_source = 'content_metadata' then previous.content_metadata_normalized_value
      else null
    end,
    selected_source = p_selected_source,
    resolution_reason = p_resolution_reason, resolved_by_email = case when p_selected_source is null then null else lower(trim(p_actor_email)) end,
    resolved_at = case when p_selected_source is null then null else now() end, updated_at = now()
  where id = previous.id returning * into changed;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source, reason)
  values (p_actor_id, lower(trim(p_actor_email)), case when p_selected_source is null then 'course.field_resolution_cleared' else 'course.field_resolution_selected' end,
    'field_comparison', p_app_id || ':' || p_field_key, to_jsonb(previous), to_jsonb(changed), 'CourseTrack', p_resolution_reason);
  return to_jsonb(changed);
end;
$$;
revoke all on function public.resolve_course_field_v2(text, text, text, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_course_field_v2(text, text, text, text, timestamptz, uuid, text) to service_role;

commit;
