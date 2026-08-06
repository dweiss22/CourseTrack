begin;

-- Apply 202608040008 before this migration. It establishes the editable
-- projection columns and immutable workbook-source fingerprints used here.

create table if not exists public.lms_authority_settings (
  singleton boolean primary key default true check (singleton),
  authority_mode text not null default 'workbook' check (authority_mode in ('workbook', 'api')),
  connector_healthy boolean not null default false,
  successful_snapshot_at timestamptz,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);
insert into public.lms_authority_settings(singleton) values (true) on conflict (singleton) do nothing;

insert into public.verticals(slug, name, sort_order, active)
values ('unclassified', 'Unclassified', 999, true)
on conflict (slug) do update set name = excluded.name, active = true;

alter table public.lms_snapshots
  add column if not exists source_transport text not null default 'uploaded'
    check (source_transport in ('uploaded', 'lms_api'));
update public.lms_snapshots set source_transport = 'uploaded'
where provider = 'Workbook LMS export';

alter table public.content_metadata_records
  add column if not exists is_current boolean not null default false;
with ranked as (
  select id, row_number() over (partition by course_id order by created_at desc, id desc) as position
  from public.content_metadata_records where is_importable
)
update public.content_metadata_records record set is_current = (ranked.position = 1)
from ranked where ranked.id = record.id;
create unique index if not exists content_metadata_one_current_per_course_idx
  on public.content_metadata_records(course_id) where is_current;

alter table public.field_comparisons
  add column if not exists coursetrack_normalized_value jsonb,
  add column if not exists field_scope text not null default 'shared'
    check (field_scope in ('shared', 'lms_exclusive', 'metadata_only', 'app_only')),
  add column if not exists alignment_status text not null default 'Mapping required'
    check (alignment_status in ('In sync', 'Pending LMS update', 'Manually confirmed', 'Missing metadata', 'App only', 'Mapping required')),
  add column if not exists source_value_hash text,
  add column if not exists alignment_confirmed_source_hash text,
  add column if not exists alignment_confirmed_by uuid references public.profiles(id),
  add column if not exists alignment_confirmed_by_email text,
  add column if not exists alignment_confirmed_at timestamptz,
  add column if not exists alignment_confirmation_note text;
create index if not exists field_comparisons_alignment_idx
  on public.field_comparisons(alignment_status, course_id);

alter table public.accreditation_records
  alter column jurisdiction drop not null,
  add column if not exists topic_number text,
  add column if not exists source_domain text not null default 'coursetrack'
    check (source_domain in ('lms', 'coursetrack')),
  add column if not exists source_transport text not null default 'manual'
    check (source_transport in ('uploaded', 'lms_api', 'manual')),
  add column if not exists source_normalized_payload jsonb not null default '{}'::jsonb,
  add column if not exists alignment_status text not null default 'App only'
    check (alignment_status in ('In sync', 'Pending LMS update', 'Manually confirmed', 'App only')),
  add column if not exists alignment_confirmed_source_hash text,
  add column if not exists alignment_confirmed_by uuid references public.profiles(id),
  add column if not exists alignment_confirmed_by_email text,
  add column if not exists alignment_confirmed_at timestamptz,
  add column if not exists alignment_confirmation_note text;

-- The old blanket trigger prevented even app-owned status/credit edits. LMS
-- authority is now enforced by the mutation RPCs at field level.
drop trigger if exists prevent_lms_api_mutation on public.accreditation_records;

update public.accreditation_records set
  topic_number = coalesce(topic_number, source_topic_number),
  source_domain = case when source_fingerprint is not null or origin_provenance = 'lms_api' then 'lms' else 'coursetrack' end,
  source_transport = case when source_fingerprint is not null or source_system = 'Workbook LMS export' then 'uploaded'
                          when origin_provenance = 'lms_api' then 'lms_api' else 'manual' end,
  source_normalized_payload = case
    when source_fingerprint is not null or origin_provenance = 'lms_api' then jsonb_build_object(
      'organization', organization, 'jurisdiction', jurisdiction, 'approvalNumber', approval_number,
      'topicNumber', coalesce(topic_number, source_topic_number), 'effectiveDate', effective_date,
      'expirationDate', expiration_date)
    else '{}'::jsonb end,
  provenance = case when source_system = 'Workbook LMS export' then 'uploaded' else provenance end,
  origin_provenance = case when source_system = 'Workbook LMS export' then 'uploaded' else origin_provenance end,
  alignment_status = case when source_fingerprint is not null or origin_provenance = 'lms_api' then 'In sync' else 'App only' end;

alter table public.version_wrike_task_references
  add column if not exists wrike_published_date date;

alter table public.course_versions add column if not exists source_fingerprint text;

update public.course_versions set
  data_source = 'uploaded', source_system = 'LMS new list - master.xlsx',
  provenance = 'uploaded', origin_provenance = 'uploaded'
where lower(coalesce(created_by_email, '')) = 'coursetrack import'
   or lower(coalesce(created_by_email, '')) = 'coursetrack-import@system.local'
   or (source_system = 'CourseTrack' and origin_provenance = 'coursetrack' and
       (lower(coalesce(created_by_email, '')) in ('coursetrack import', 'coursetrack-import@system.local')
        or lower(coalesce(created_by_email, '')) like 'staging-actor-%@staging.invalid'));
update public.course_versions set source_fingerprint = encode(digest(concat_ws('|', course_id::text, version_number, publication_date::text), 'sha256'), 'hex')
where origin_provenance = 'uploaded' and source_fingerprint is null;
create index if not exists course_versions_source_fingerprint_idx
  on public.course_versions(course_id, source_fingerprint) where source_fingerprint is not null;

create table if not exists public.course_identifier_history (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  identifier_type text not null check (identifier_type in ('lms_course_id', 'course_code')),
  identifier_value text not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  source text not null,
  created_by uuid references public.profiles(id),
  unique(identifier_type, identifier_value, valid_from)
);
create index if not exists course_identifier_history_lookup_idx
  on public.course_identifier_history(identifier_type, identifier_value, valid_to);

create or replace function public.record_course_identifier_history()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.course_code is distinct from new.course_code then
    insert into public.course_identifier_history(course_id, identifier_type, identifier_value, valid_from, valid_to, source, created_by)
    values (old.id, 'course_code', old.course_code, old.created_at, now(), 'CourseTrack', new.updated_by);
    insert into public.course_identifier_history(course_id, identifier_type, identifier_value, valid_from, source, created_by)
    values (old.id, 'course_code', new.course_code, now(), 'CourseTrack', new.updated_by);
  end if;
  if old.lms_course_id is distinct from new.lms_course_id then
    if old.lms_course_id is not null then
      insert into public.course_identifier_history(course_id, identifier_type, identifier_value, valid_from, valid_to, source, created_by)
      values (old.id, 'lms_course_id', old.lms_course_id, old.created_at, now(), 'CourseTrack', new.updated_by);
    end if;
    if new.lms_course_id is not null then
      insert into public.course_identifier_history(course_id, identifier_type, identifier_value, valid_from, source, created_by)
      values (old.id, 'lms_course_id', new.lms_course_id, now(), 'CourseTrack', new.updated_by);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists record_course_identifier_history on public.courses;
create trigger record_course_identifier_history before update of course_code, lms_course_id on public.courses
for each row execute function public.record_course_identifier_history();

create or replace function public.course_projection_value(p_course public.courses, p_field_key text)
returns jsonb language sql immutable set search_path = public as $$
  select case p_field_key
    when 'courseId' then to_jsonb(p_course.course_code)
    when 'courseName' then to_jsonb(p_course.title)
    when 'contentType' then to_jsonb(p_course.delivery_format)
    when 'durationMinutes' then to_jsonb(p_course.duration_minutes)
    when 'trainingCredits' then p_course.training_credits
    when 'published' then to_jsonb(p_course.is_published)
    when 'description' then to_jsonb(p_course.description)
    when 'publishedDate' then to_jsonb(p_course.original_publish_date::text)
    when 'authoringTool' then to_jsonb(p_course.authoring_tool)
    when 'backendLink' then to_jsonb(p_course.backend_link)
    when 'frontendLink' then to_jsonb(p_course.frontend_link)
    when 'updateType' then to_jsonb(p_course.content_update_type)
    when 'contentUpdatedAt' then to_jsonb(p_course.content_updated_at::text)
    when 'notes' then to_jsonb(p_course.content_notes)
    else null end
$$;

create or replace function public.refresh_course_comparisons(
  p_course_id uuid,
  p_edited_keys text[] default '{}'::text[]
)
returns integer language plpgsql security definer set search_path = public as $$
declare projection public.courses%rowtype; difference_count integer;
begin
  select * into projection from public.courses where id = p_course_id;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;

  update public.field_comparisons comparison set
    coursetrack_normalized_value = public.course_projection_value(projection, comparison.field_key),
    source_value_hash = md5(coalesce(comparison.lms_normalized_value::text, 'null')),
    alignment_status = case
      when comparison.field_scope = 'metadata_only' then
        case when public.comparison_values_equal(comparison.field_key, comparison.content_metadata_normalized_value, public.course_projection_value(projection, comparison.field_key)) then 'In sync' else 'App only' end
      when comparison.field_scope = 'app_only' then 'App only'
      when comparison.lms_normalized_value is null then 'App only'
      when comparison.content_metadata_normalized_value is null
        and public.comparison_values_equal(comparison.field_key, comparison.lms_normalized_value, public.course_projection_value(projection, comparison.field_key)) then 'Missing metadata'
      when public.comparison_values_equal(comparison.field_key, comparison.lms_normalized_value, public.course_projection_value(projection, comparison.field_key)) then 'In sync'
      when comparison.alignment_confirmed_at is not null
        and comparison.alignment_confirmed_source_hash = md5(coalesce(comparison.lms_normalized_value::text, 'null')) then 'Manually confirmed'
      when coalesce(projection.field_provenance->>comparison.field_key, '') = 'coursetrack' then 'Pending LMS update'
      else 'Mapping required' end,
    alignment_confirmed_by = case when comparison.alignment_confirmed_source_hash is distinct from md5(coalesce(comparison.lms_normalized_value::text, 'null')) then null else comparison.alignment_confirmed_by end,
    alignment_confirmed_by_email = case when comparison.alignment_confirmed_source_hash is distinct from md5(coalesce(comparison.lms_normalized_value::text, 'null')) then null else comparison.alignment_confirmed_by_email end,
    alignment_confirmed_at = case when comparison.alignment_confirmed_source_hash is distinct from md5(coalesce(comparison.lms_normalized_value::text, 'null')) then null else comparison.alignment_confirmed_at end,
    alignment_confirmation_note = case when comparison.alignment_confirmed_source_hash is distinct from md5(coalesce(comparison.lms_normalized_value::text, 'null')) then null else comparison.alignment_confirmation_note end,
    last_compared_at = now(), updated_at = now()
  where comparison.course_id = p_course_id and comparison.is_comparable;

  select count(*)::integer into difference_count from public.field_comparisons
  where course_id = p_course_id and is_comparable and alignment_status in ('Pending LMS update', 'Mapping required');
  update public.courses set source_difference_count = difference_count,
    source_timestamps = coalesce(source_timestamps, '{}'::jsonb) || jsonb_build_object('lastComparedAt', now())
  where id = p_course_id;
  return difference_count;
end $$;
revoke all on function public.refresh_course_comparisons(uuid, text[]) from public, anon, authenticated;
grant execute on function public.refresh_course_comparisons(uuid, text[]) to service_role;

create or replace function public.refresh_all_course_comparisons()
returns integer language plpgsql security definer
set search_path = public
set statement_timeout = '15min'
as $$
declare target record; refreshed integer := 0;
begin
  for target in select distinct course_id from public.field_comparisons loop
    perform public.refresh_course_comparisons(target.course_id, '{}'::text[]);
    refreshed := refreshed + 1;
  end loop;
  return refreshed;
end $$;
revoke all on function public.refresh_all_course_comparisons() from public, anon, authenticated;
grant execute on function public.refresh_all_course_comparisons() to service_role;

create or replace function public.confirm_data_alignment(
  p_record_type text, p_record_id text, p_note text, p_expected_updated_at timestamptz,
  p_actor_id uuid, p_actor_email text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare previous jsonb; changed jsonb; mode text;
begin
  select authority_mode into mode from public.lms_authority_settings where singleton;
  if mode <> 'workbook' then raise exception 'Manual alignment is unavailable while the LMS API is authoritative.' using errcode = '42501'; end if;
  if p_record_type = 'field_comparison' then
    perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:edit-internal');
    select to_jsonb(t) into previous from public.field_comparisons t where id = p_record_id::uuid for update;
    if previous is null then raise exception 'Comparison not found.' using errcode = 'P0002'; end if;
    if (previous->>'updated_at')::timestamptz is distinct from p_expected_updated_at then raise exception 'Comparison changed since it was loaded.' using errcode = '40001'; end if;
    update public.field_comparisons set alignment_status = 'Manually confirmed',
      alignment_confirmed_source_hash = md5(coalesce(lms_normalized_value::text, 'null')),
      alignment_confirmed_by = p_actor_id, alignment_confirmed_by_email = lower(trim(p_actor_email)),
      alignment_confirmed_at = now(), alignment_confirmation_note = nullif(trim(p_note), ''), updated_at = now()
    where id = p_record_id::uuid returning to_jsonb(field_comparisons) into changed;
    perform public.refresh_course_comparisons((previous->>'course_id')::uuid, '{}'::text[]);
  elsif p_record_type = 'accreditation' then
    perform public.assert_actor_permission(p_actor_id, p_actor_email, 'accreditation:manage');
    select to_jsonb(t) into previous from public.accreditation_records t where id = p_record_id::uuid and archived_at is null for update;
    if previous is null then raise exception 'Accreditation not found.' using errcode = 'P0002'; end if;
    if (previous->>'updated_at')::timestamptz is distinct from p_expected_updated_at then raise exception 'Accreditation changed since it was loaded.' using errcode = '40001'; end if;
    update public.accreditation_records set alignment_status = 'Manually confirmed',
      alignment_confirmed_source_hash = md5(source_normalized_payload::text), alignment_confirmed_by = p_actor_id,
      alignment_confirmed_by_email = lower(trim(p_actor_email)), alignment_confirmed_at = now(),
      alignment_confirmation_note = nullif(trim(p_note), ''), updated_at = now()
    where id = p_record_id::uuid returning to_jsonb(accreditation_records) into changed;
  else raise exception 'Unsupported alignment record type.' using errcode = '22023'; end if;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source, reason)
  values (p_actor_id, lower(trim(p_actor_email)), p_record_type || '.alignment_confirmed', p_record_type, p_record_id, previous, changed, 'CourseTrack', p_note);
  return changed;
end $$;
revoke all on function public.confirm_data_alignment(text, text, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_data_alignment(text, text, text, timestamptz, uuid, text) to service_role;

create or replace function public.restore_managed_record(
  p_table_name text, p_record_id uuid, p_expected_updated_at timestamptz, p_actor_id uuid, p_actor_email text
) returns boolean language plpgsql security definer set search_path = public as $$
declare previous jsonb; changed jsonb;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'administration:manage');
  if p_table_name not in ('course_versions', 'accreditation_records') then raise exception 'Record type cannot be restored.' using errcode = '22023'; end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1 and archived_at is not null for update', p_table_name) into previous using p_record_id;
  if previous is null then raise exception 'Archived record not found.' using errcode = 'P0002'; end if;
  if (previous->>'updated_at')::timestamptz is distinct from p_expected_updated_at then raise exception 'Record changed since it was loaded.' using errcode = '40001'; end if;
  execute format('update public.%I set archived_at = null, archived_by = null, updated_by = $2, updated_at = now() where id = $1 returning to_jsonb(%I)', p_table_name, p_table_name) into changed using p_record_id, p_actor_id;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), p_table_name || '.restored', p_table_name, p_record_id::text, previous, changed, 'CourseTrack');
  return true;
end $$;
revoke all on function public.restore_managed_record(text, uuid, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.restore_managed_record(text, uuid, timestamptz, uuid, text) to service_role;

create or replace function public.archive_managed_record(
  p_table_name text, p_record_id uuid, p_expected_updated_at timestamptz, p_actor_id uuid, p_actor_email text
) returns boolean language plpgsql security definer set search_path = public as $$
declare previous jsonb; changed jsonb; mode text; permission_key text;
begin
  permission_key := case p_table_name when 'course_versions' then 'versions:manage' when 'accreditation_records' then 'accreditation:manage' else null end;
  if permission_key is null then raise exception 'Record type cannot be archived.' using errcode = '22023'; end if;
  perform public.assert_actor_permission(p_actor_id, p_actor_email, permission_key);
  select authority_mode into mode from public.lms_authority_settings where singleton;
  execute format('select to_jsonb(t) from public.%I t where id = $1 and archived_at is null for update', p_table_name) into previous using p_record_id;
  if previous is null then raise exception 'Record not found.' using errcode = 'P0002'; end if;
  if (previous->>'updated_at')::timestamptz is distinct from p_expected_updated_at then raise exception 'Record changed since it was loaded.' using errcode = '40001'; end if;
  if p_table_name = 'course_versions' and coalesce((previous->>'is_current')::boolean, false) then raise exception 'Select another current version before archiving this version.' using errcode = '22023'; end if;
  if p_table_name = 'accreditation_records' and mode = 'api' and previous->>'source_domain' = 'lms' then raise exception 'LMS accreditation records cannot be archived while the API is authoritative.' using errcode = '42501'; end if;
  execute format('update public.%I set archived_at = now(), archived_by = $2, updated_by = $2, updated_at = now()%s where id = $1 returning to_jsonb(%I)',
    p_table_name,
    case when p_table_name = 'accreditation_records' and previous->>'source_domain' = 'lms' then ", alignment_status = 'Pending LMS update'" else '' end,
    p_table_name) into changed using p_record_id, p_actor_id;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), p_table_name || '.archived', p_table_name, p_record_id::text, previous, changed, 'CourseTrack');
  return true;
end $$;
revoke all on function public.archive_managed_record(text, uuid, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.archive_managed_record(text, uuid, timestamptz, uuid, text) to service_role;

-- Workbook source records are editable projections; imported evidence remains
-- immutable in source_normalized_payload. API authority locks only LMS-owned
-- fields while still allowing app-owned status and credit hours.
create or replace function public.save_accreditation_v2(
  p_record_id uuid, p_course_app_id text, p_payload jsonb, p_expected_updated_at timestamptz,
  p_actor_id uuid, p_actor_email text
) returns public.accreditation_records language plpgsql security definer set search_path = public as $$
declare previous public.accreditation_records%rowtype; changed public.accreditation_records%rowtype; target_course_id uuid; mode text; source_changed boolean;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'accreditation:manage');
  select authority_mode into mode from public.lms_authority_settings where singleton;
  if p_record_id is null then
    if nullif(trim(p_payload->>'organization'), '') is null or nullif(trim(p_payload->>'jurisdiction'), '') is null then
      raise exception 'Issuing body and jurisdiction are required for application-created accreditation records.' using errcode = '22023';
    end if;
    select id into target_course_id from public.courses where app_id = p_course_app_id and archived_at is null;
    if target_course_id is null then raise exception 'Course not found.' using errcode = 'P0002'; end if;
    insert into public.accreditation_records(course_id, organization, jurisdiction, status, approval_number, topic_number, credit_hours, effective_date, expiration_date, data_source, source_system, provenance, origin_provenance, source_domain, source_transport, alignment_status, updated_by)
    values (target_course_id, trim(p_payload->>'organization'), trim(p_payload->>'jurisdiction'), p_payload->>'status', nullif(trim(p_payload->>'approvalNumber'), ''), nullif(trim(p_payload->>'topicNumber'), ''), coalesce((p_payload->>'creditHours')::numeric, 0), nullif(p_payload->>'effectiveDate', '')::date, nullif(p_payload->>'expirationDate', '')::date, 'coursetrack', 'CourseTrack', 'coursetrack', 'coursetrack', 'coursetrack', 'manual', 'App only', p_actor_id)
    returning * into changed;
  else
    select * into previous from public.accreditation_records where id = p_record_id and archived_at is null for update;
    if not found then raise exception 'Accreditation not found.' using errcode = 'P0002'; end if;
    if previous.updated_at is distinct from p_expected_updated_at then raise exception 'Accreditation changed since it was loaded.' using errcode = '40001'; end if;
    source_changed := previous.organization is distinct from nullif(trim(p_payload->>'organization'), '')
      or previous.jurisdiction is distinct from nullif(trim(p_payload->>'jurisdiction'), '')
      or previous.approval_number is distinct from nullif(trim(p_payload->>'approvalNumber'), '')
      or previous.topic_number is distinct from nullif(trim(p_payload->>'topicNumber'), '')
      or previous.effective_date is distinct from nullif(p_payload->>'effectiveDate', '')::date
      or previous.expiration_date is distinct from nullif(p_payload->>'expirationDate', '')::date;
    if mode = 'api' and previous.source_domain = 'lms' and source_changed then raise exception 'LMS accreditation source fields are read-only while the API is authoritative.' using errcode = '42501'; end if;
    update public.accreditation_records set
      organization = nullif(trim(p_payload->>'organization'), ''), jurisdiction = nullif(trim(p_payload->>'jurisdiction'), ''),
      status = p_payload->>'status', approval_number = nullif(trim(p_payload->>'approvalNumber'), ''),
      topic_number = nullif(trim(p_payload->>'topicNumber'), ''), credit_hours = coalesce((p_payload->>'creditHours')::numeric, 0),
      effective_date = nullif(p_payload->>'effectiveDate', '')::date, expiration_date = nullif(p_payload->>'expirationDate', '')::date,
      provenance = 'coursetrack', alignment_status = case when source_domain = 'lms' and source_changed then 'Pending LMS update' else alignment_status end,
      alignment_confirmed_by = case when source_changed then null else alignment_confirmed_by end,
      alignment_confirmed_by_email = case when source_changed then null else alignment_confirmed_by_email end,
      alignment_confirmed_at = case when source_changed then null else alignment_confirmed_at end,
      alignment_confirmation_note = case when source_changed then null else alignment_confirmation_note end,
      updated_by = p_actor_id, updated_at = now()
    where id = p_record_id returning * into changed;
  end if;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), case when p_record_id is null then 'accreditation.created' else 'accreditation.updated' end, 'accreditation', changed.id::text, case when p_record_id is null then null else to_jsonb(previous) end, to_jsonb(changed), 'CourseTrack');
  return changed;
end $$;
revoke all on function public.save_accreditation_v2(uuid, text, jsonb, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.save_accreditation_v2(uuid, text, jsonb, timestamptz, uuid, text) to service_role;

create or replace function public.set_lms_authority_mode(
  p_mode text, p_connector_healthy boolean, p_successful_snapshot_at timestamptz,
  p_actor_id uuid, p_actor_email text
) returns text language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'administration:manage');
  if p_mode not in ('workbook', 'api') then raise exception 'Invalid LMS authority mode.' using errcode = '22023'; end if;
  if p_mode = 'api' and (not p_connector_healthy or p_successful_snapshot_at is null) then raise exception 'A healthy connector and successful API snapshot are required.' using errcode = '22023'; end if;
  update public.lms_authority_settings set authority_mode = p_mode, connector_healthy = p_connector_healthy,
    successful_snapshot_at = p_successful_snapshot_at, changed_by = p_actor_id, changed_at = now() where singleton;
  return p_mode;
end $$;
revoke all on function public.set_lms_authority_mode(text, boolean, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.set_lms_authority_mode(text, boolean, timestamptz, uuid, text) to service_role;

create or replace function public.search_course_library(
  p_search text default '', p_vertical text default '', p_lifecycle text default '', p_health text default '',
  p_classification text default 'Included portfolio', p_work_queue text default '', p_sort text default 'title',
  p_descending boolean default false, p_limit integer default 25, p_offset integer default 0
) returns table(
  id text, title text, short_title text, course_code text, lms_course_id text, description text,
  primary_vertical text, management_classification text, reconciliation_status text, retrieval_status text,
  last_retrieved_at timestamptz, health_status text, lifecycle_status text, primary_topic text, owner_name text,
  duration_minutes integer, data_source text, next_review_date date, metadata_completeness_score integer,
  source_difference_count integer, conflict_count bigint, flag_count bigint, has_lms_snapshot boolean,
  has_content_metadata boolean, import_validation_error_count integer, tags text[], topics text[], total_count bigint
) language sql stable security definer set search_path = public as $$
  with base as (
    select c.app_id, c.title, c.short_title, c.course_code, c.lms_course_id, c.description,
      v.slug as vertical_slug, c.management_classification, c.reconciliation_status, c.retrieval_status,
      c.last_retrieved_at, c.health_status, c.lifecycle_status, c.primary_topic, c.owner_name,
      c.duration_minutes, c.data_source, c.next_review_date, c.metadata_completeness_score,
      c.source_difference_count, jsonb_array_length(coalesce(c.import_validation_errors, '[]'::jsonb)) as validation_count,
      exists(select 1 from public.lms_snapshots s where s.course_id = c.id and s.is_current) as has_lms,
      exists(select 1 from public.content_metadata_records m where m.course_id = c.id and m.is_current) as has_metadata,
      (select count(*) from public.field_comparisons f where f.course_id = c.id and f.alignment_status in ('Pending LMS update', 'Mapping required')) as differences,
      (select count(*) from public.course_flags f where f.course_id = c.id and f.archived_at is null) as flags,
      coalesce((select array_agg(distinct t.display_label order by t.display_label) from public.course_tags ct join public.tags t on t.id = ct.tag_id where ct.course_id = c.id), '{}'::text[]) as tag_values,
      coalesce((select array_agg(distinct t.display_label order by t.display_label) from public.course_topics ct join public.topics t on t.id = ct.topic_id where ct.course_id = c.id), '{}'::text[]) as topic_values
    from public.courses c join public.verticals v on v.id = c.primary_vertical_id
    where c.archived_at is null
  ), filtered as (
    select * from base b where
      (coalesce(trim(p_search), '') = '' or concat_ws(' ', b.title, b.short_title, b.course_code, b.lms_course_id, b.description, b.primary_topic, b.owner_name, array_to_string(b.tag_values, ' '), array_to_string(b.topic_values, ' ')) ilike '%' || trim(p_search) || '%')
      and (coalesce(p_vertical, '') in ('', 'All verticals') or lower(b.vertical_slug) = lower(p_vertical))
      and (coalesce(p_lifecycle, '') in ('', 'All statuses') or b.lifecycle_status = p_lifecycle)
      and (coalesce(p_health, '') in ('', 'All health levels') or b.health_status = p_health)
      and (coalesce(p_classification, '') in ('', 'All classifications') or (p_classification = 'Included portfolio' and b.management_classification <> 'Non-Lexipol excluded') or b.management_classification = p_classification)
      and (coalesce(p_work_queue, '') in ('', 'All queues')
        or (p_work_queue = 'Missing Content Metadata' and b.has_lms and not b.has_metadata)
        or (p_work_queue = 'Missing from LMS' and not b.has_lms and b.has_metadata)
        or (p_work_queue = 'Field conflicts' and b.differences > 0)
        or (p_work_queue = 'Mapping required' and b.reconciliation_status = 'Mapping required')
        or (p_work_queue = 'Invalid import records' and b.validation_count > 0)
        or (p_work_queue = 'Stale LMS data' and b.retrieval_status in ('Stale Data', 'Retrieval Failed')))
  )
  select f.app_id, f.title, f.short_title, f.course_code, f.lms_course_id, f.description,
    case f.vertical_slug when 'p1a' then 'P1A' when 'fr1a' then 'FR1A' when 'c1a' then 'C1A' when 'ems1' then 'EMS1' when 'd1a' then 'D1A' when 'lgu' then 'LGU' when 'lexipol' then 'Lexipol' when 'wellness' then 'Wellness' else 'Unclassified' end,
    f.management_classification, f.reconciliation_status, f.retrieval_status, f.last_retrieved_at,
    f.health_status, f.lifecycle_status, f.primary_topic, f.owner_name, f.duration_minutes, f.data_source,
    f.next_review_date, f.metadata_completeness_score, f.source_difference_count, f.differences, f.flags,
    f.has_lms, f.has_metadata, f.validation_count, f.tag_values, f.topic_values, count(*) over()
  from filtered f
  order by
    case when not p_descending and p_sort = 'durationMinutes' then f.duration_minutes end asc nulls last,
    case when p_descending and p_sort = 'durationMinutes' then f.duration_minutes end desc nulls last,
    case when not p_descending and p_sort = 'courseCode' then f.course_code end asc,
    case when p_descending and p_sort = 'courseCode' then f.course_code end desc,
    case when not p_descending and p_sort = 'healthStatus' then f.health_status end asc,
    case when p_descending and p_sort = 'healthStatus' then f.health_status end desc,
    case when p_descending then f.title end desc,
    f.title asc, f.app_id asc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;
revoke all on function public.search_course_library(text, text, text, text, text, text, text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.search_course_library(text, text, text, text, text, text, text, boolean, integer, integer) to service_role;

create or replace function public.get_dashboard_snapshot(
  p_vertical text default '', p_include_excluded boolean default false
) returns jsonb language sql stable security definer set search_path = public as $$
  with base as (
    select c.id, c.app_id, c.title,
      case v.slug when 'p1a' then 'P1A' when 'fr1a' then 'FR1A' when 'c1a' then 'C1A' when 'ems1' then 'EMS1' when 'd1a' then 'D1A' when 'lgu' then 'LGU' when 'lexipol' then 'Lexipol' when 'wellness' then 'Wellness' else 'Unclassified' end as primary_vertical,
      c.management_classification, c.health_status, c.next_review_date, c.owner_name,
      c.metadata_completeness_score, c.reconciliation_status, c.retrieval_status,
      jsonb_array_length(coalesce(c.import_validation_errors, '[]'::jsonb)) as validation_count,
      exists(select 1 from public.lms_snapshots s where s.course_id = c.id and s.is_current) as has_lms,
      exists(select 1 from public.content_metadata_records m where m.course_id = c.id and m.is_current) as has_metadata,
      (select count(*) from public.field_comparisons f where f.course_id = c.id and f.alignment_status in ('Pending LMS update', 'Mapping required')) as conflict_count,
      (select count(*) from public.course_flags f where f.course_id = c.id and f.archived_at is null) as flag_count
    from public.courses c join public.verticals v on v.id = c.primary_vertical_id
    where c.archived_at is null
  ), portfolio as (
    select * from base where p_include_excluded or management_classification <> 'Non-Lexipol excluded'
  ), filtered as (
    select * from portfolio where coalesce(trim(p_vertical), '') in ('', 'All verticals') or primary_vertical = p_vertical
  ), vertical_values(primary_vertical) as (
    values ('P1A'), ('FR1A'), ('C1A'), ('EMS1'), ('D1A'), ('LGU'), ('Lexipol'), ('Wellness'), ('Unclassified')
  ), health_values(health_status) as (
    values ('Healthy'), ('Monitor'), ('Needs Review'), ('At Risk'), ('Critical')
  )
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalLmsRetrieved', (select count(*) from base where has_lms),
      'lexipolManaged', (select count(*) from portfolio where management_classification = 'Lexipol managed'),
      'nonLexipolTracked', (select count(*) from portfolio where management_classification = 'Non-Lexipol tracked'),
      'unclassified', (select count(*) from portfolio where management_classification = 'Unclassified'),
      'missingContentMetadata', (select count(*) from portfolio where has_lms and not has_metadata),
      'missingFromLms', (select count(*) from portfolio where not has_lms and has_metadata),
      'unresolvedConflicts', (select count(*) from portfolio where conflict_count > 0),
      'mappingRequired', (select count(*) from portfolio where reconciliation_status = 'Mapping required'),
      'staleLms', (select count(*) from portfolio where retrieval_status in ('Stale Data', 'Retrieval Failed')),
      'importValidationErrors', (select coalesce(sum(validation_count), 0) from portfolio)
    ),
    'coursesInView', (select count(*) from filtered),
    'verticalData', (select jsonb_agg(jsonb_build_object('name', vv.primary_vertical, 'courses', (select count(*) from portfolio p where p.primary_vertical = vv.primary_vertical)) order by array_position(array['P1A','FR1A','C1A','EMS1','D1A','LGU','Lexipol','Wellness','Unclassified'], vv.primary_vertical)) from vertical_values vv),
    'healthData', (select jsonb_agg(jsonb_build_object('name', hv.health_status, 'value', (select count(*) from filtered f where f.health_status = hv.health_status))) from health_values hv),
    'reviewQueue', coalesce((select jsonb_agg(to_jsonb(q)) from (
      select app_id as id, title, primary_vertical as "primaryVertical", owner_name as owner,
        next_review_date as "nextReviewDate", health_status as "healthStatus", flag_count as "flagCount",
        metadata_completeness_score as "metadataCompletenessScore"
      from filtered where next_review_date is not null order by next_review_date, app_id limit 5
    ) q), '[]'::jsonb),
    'riskQueue', coalesce((select jsonb_agg(to_jsonb(q)) from (
      select app_id as id, title, primary_vertical as "primaryVertical", owner_name as owner,
        next_review_date as "nextReviewDate", health_status as "healthStatus", flag_count as "flagCount",
        metadata_completeness_score as "metadataCompletenessScore"
      from filtered where health_status in ('Critical', 'At Risk')
      order by case health_status when 'Critical' then 0 else 1 end, flag_count desc, app_id limit 5
    ) q), '[]'::jsonb)
  )
$$;
revoke all on function public.get_dashboard_snapshot(text, boolean) from public, anon, authenticated;
grant execute on function public.get_dashboard_snapshot(text, boolean) to service_role;

commit;
