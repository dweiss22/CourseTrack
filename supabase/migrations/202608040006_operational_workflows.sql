begin;

-- Operational provenance is deliberately separate from immutable source
-- payloads. Existing records came from supplied workbooks; future API
-- snapshots use lms_api and cannot be edited through application workflows.
alter table public.courses
  add column if not exists provenance text not null default 'uploaded',
  add column if not exists origin_provenance text not null default 'uploaded',
  add column if not exists field_provenance jsonb not null default '{}',
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists archived_by uuid references public.profiles(id);

alter table public.course_versions
  add column if not exists provenance text not null default 'coursetrack',
  add column if not exists origin_provenance text not null default 'coursetrack',
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id);

alter table public.accreditation_records
  add column if not exists provenance text not null default 'uploaded',
  add column if not exists origin_provenance text not null default 'uploaded',
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id);

alter table public.course_flags
  add column if not exists provenance text not null default 'coursetrack',
  add column if not exists origin_provenance text not null default 'coursetrack',
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id);

alter table public.notes
  add column if not exists provenance text not null default 'coursetrack',
  add column if not exists origin_provenance text not null default 'coursetrack',
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id);

alter table public.revamp_proposals
  add column if not exists bucket_key text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists provenance text not null default 'coursetrack',
  add column if not exists origin_provenance text not null default 'coursetrack',
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;

alter table public.course_relationships
  add column if not exists provenance text not null default 'uploaded',
  add column if not exists origin_provenance text not null default 'uploaded',
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id);

alter table public.course_topics
  add column if not exists provenance text not null default 'uploaded';

alter table public.course_tags
  add column if not exists provenance text not null default 'coursetrack';

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'courses', 'course_versions', 'accreditation_records', 'course_flags',
    'notes', 'revamp_proposals', 'course_relationships'
  ] loop
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_provenance_check');
    execute format(
      'alter table public.%I add constraint %I check (provenance in (''uploaded'', ''lms_api'', ''coursetrack''))',
      table_name,
      table_name || '_provenance_check'
    );
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_origin_provenance_check');
    execute format(
      'alter table public.%I add constraint %I check (origin_provenance in (''uploaded'', ''lms_api'', ''coursetrack''))',
      table_name,
      table_name || '_origin_provenance_check'
    );
  end loop;
end;
$$;

alter table public.course_topics
  drop constraint if exists course_topics_provenance_check;
alter table public.course_topics
  add constraint course_topics_provenance_check
  check (provenance in ('uploaded', 'lms_api', 'coursetrack'));
alter table public.course_tags
  drop constraint if exists course_tags_provenance_check;
alter table public.course_tags
  add constraint course_tags_provenance_check
  check (provenance in ('uploaded', 'lms_api', 'coursetrack'));

alter table public.revamp_proposals
  drop constraint if exists revamp_proposals_bucket_key_check;
alter table public.revamp_proposals
  add constraint revamp_proposals_bucket_key_check check (
    bucket_key is null or bucket_key in ('Submitted', 'Under Review', 'Approved', 'In Progress')
  );
alter table public.revamp_proposals drop constraint if exists revamp_proposals_status_check;
alter table public.revamp_proposals add constraint revamp_proposals_status_check check (
  status in ('Draft', 'Submitted', 'Under Review', 'Approved', 'Approved for Future Cycle', 'Deferred', 'In Progress', 'Completed')
);

alter table public.revamp_proposals drop constraint if exists revamp_proposals_priority_check;
alter table public.revamp_proposals add constraint revamp_proposals_priority_check
  check (priority in ('Low', 'Medium', 'High', 'Critical', 'Monitor Only'));
alter table public.course_flags drop constraint if exists course_flags_status_check;
alter table public.course_flags add constraint course_flags_status_check
  check (status in ('Open', 'Under Review', 'In Progress', 'Blocked', 'Resolved'));
alter table public.notes drop constraint if exists notes_visibility_check;
alter table public.notes add constraint notes_visibility_check
  check (visibility in ('Team', 'Role restricted', 'Private', 'Organization'));

update public.courses
set
  provenance = case when data_source = 'manual' then 'coursetrack' else 'uploaded' end,
  origin_provenance = case when data_source = 'manual' then 'coursetrack' else 'uploaded' end,
  data_source = case when data_source = 'manual' then 'coursetrack' else 'uploaded' end,
  source_system = case
    when source_system ilike '%mock%' or source_system ilike '%sample%' then 'Uploaded workbooks'
    else source_system
  end,
  retrieval_status = case when retrieval_status = 'Sample Data' then 'Uploaded' else retrieval_status end,
  is_sample = false;

update public.course_versions
set
  provenance = case when data_source = 'manual' then 'coursetrack' else 'uploaded' end,
  origin_provenance = case when data_source = 'manual' then 'coursetrack' else 'uploaded' end,
  data_source = case when data_source = 'manual' then 'coursetrack' else 'uploaded' end,
  source_system = case when source_system ilike '%mock%' then 'Uploaded workbooks' else source_system end;

update public.accreditation_records
set
  provenance = case when data_source = 'manual' then 'coursetrack' else 'uploaded' end,
  origin_provenance = case when data_source = 'manual' then 'coursetrack' else 'uploaded' end,
  data_source = case when data_source = 'manual' then 'coursetrack' else 'uploaded' end,
  source_system = case when source_system ilike '%mock%' then 'Uploaded workbooks' else source_system end;

update public.lms_snapshots
set provider = 'Uploaded workbook'
where provider ilike '%mock%' or provider ilike '%sample%';

update public.lms_retrieval_runs
set provider = 'Uploaded workbook', message = replace(replace(message, 'Mock LMS', 'Uploaded workbook'), 'sample', 'uploaded')
where provider ilike '%mock%' or provider ilike '%sample%';

update public.course_topics
set provenance = case when assignment_source = 'Manual' then 'coursetrack' else 'uploaded' end;
update public.course_tags set provenance = 'coursetrack';
update public.course_relationships
set provenance = case when source = 'CourseTrack' then 'coursetrack' else 'uploaded' end,
    origin_provenance = case when source = 'CourseTrack' then 'coursetrack' else 'uploaded' end;

update public.revamp_proposals
set
  bucket_key = case when status in ('Submitted', 'Under Review', 'Approved', 'In Progress') then status else null end,
  provenance = case
    when proposed_by in (select id from public.profiles where email = 'coursetrack-import@system.local') then 'uploaded'
    else 'coursetrack'
  end,
  origin_provenance = case
    when proposed_by in (select id from public.profiles where email = 'coursetrack-import@system.local') then 'uploaded'
    else 'coursetrack'
  end;

-- These rows were created exclusively by the former demonstration generator.
-- Archive them recoverably; do not delete or touch any row outside the exact fingerprint.
update public.revamp_proposals rp
set
  archived_at = coalesce(rp.archived_at, now()),
  archive_reason = 'Legacy generated planning card',
  bucket_key = null
where rp.proposed_by in (
    select id from public.profiles where email = 'coursetrack-import@system.local'
  )
  and rp.business_justification = 'Content Metadata identifies an update or revision for this course.';

-- Likewise, deactivate only references whose provider proves they were generated.
update public.version_wrike_task_references
set unlinked_at = coalesce(unlinked_at, now())
where provider_name = 'Mock Wrike' and unlinked_at is null;

create table if not exists public.operational_cleanup_reports (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null unique,
  generated_revamp_rows_archived integer not null,
  known_wrike_references_unlinked integer not null,
  ambiguous_revamp_rows_untouched integer not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.operational_cleanup_reports enable row level security;
drop policy if exists operational_cleanup_reports_read on public.operational_cleanup_reports;
create policy operational_cleanup_reports_read on public.operational_cleanup_reports for select
using (public.has_permission('audit:view'));
insert into public.operational_cleanup_reports(
  migration_key, generated_revamp_rows_archived, known_wrike_references_unlinked,
  ambiguous_revamp_rows_untouched, details
)
select
  '202608040006',
  (select count(*) from public.revamp_proposals rp where rp.archived_at is not null and rp.archive_reason = 'Legacy generated planning card'),
  (select count(*) from public.version_wrike_task_references where provider_name = 'Mock Wrike' and unlinked_at is not null),
  (select count(*) from public.revamp_proposals rp where
    (rp.proposed_by in (select id from public.profiles where email = 'coursetrack-import@system.local'))
    <> (rp.business_justification = 'Content Metadata identifies an update or revision for this course.')),
  jsonb_build_object(
    'revampFingerprintActor', 'coursetrack-import@system.local',
    'revampFingerprintJustification', 'Content Metadata identifies an update or revision for this course.',
    'ambiguousRowsWereModified', false
  )
on conflict (migration_key) do nothing;

with ranked as (
  select id, row_number() over (partition by bucket_key order by created_at, id) - 1 as position
  from public.revamp_proposals
  where archived_at is null and bucket_key is not null
)
update public.revamp_proposals rp
set sort_order = ranked.position
from ranked
where rp.id = ranked.id;

create unique index if not exists one_current_active_version_per_course_idx
  on public.course_versions(course_id)
  where is_current and archived_at is null;
create index if not exists revamp_bucket_order_idx
  on public.revamp_proposals(bucket_key, sort_order, id)
  where archived_at is null;
create index if not exists accreditation_active_history_idx
  on public.accreditation_records(course_id, organization, jurisdiction, effective_date desc, expiration_date desc)
  where archived_at is null;

create table if not exists public.course_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
alter table public.course_favorites enable row level security;
drop policy if exists course_favorites_own on public.course_favorites;
create policy course_favorites_own on public.course_favorites
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.assert_actor_permission(
  p_actor_id uuid,
  p_actor_email text,
  p_permission text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id
      and email = lower(trim(p_actor_email))
      and account_status = 'active'
      and public.role_grants_permission(role, p_permission)
  ) then
    raise exception 'Permission denied.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.assert_actor_permission(uuid, text, text) from public, anon, authenticated;
grant execute on function public.assert_actor_permission(uuid, text, text) to service_role;

create or replace function public.set_course_favorite(
  p_app_id text,
  p_actor_id uuid,
  p_actor_email text,
  p_favorite boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_course_id uuid;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:view');
  select id into target_course_id from public.courses where app_id = p_app_id and archived_at is null;
  if target_course_id is null then return false; end if;
  if p_favorite then
    insert into public.course_favorites(user_id, course_id)
    values (p_actor_id, target_course_id)
    on conflict do nothing;
  else
    delete from public.course_favorites where user_id = p_actor_id and course_id = target_course_id;
  end if;
  return true;
end;
$$;
revoke all on function public.set_course_favorite(text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_course_favorite(text, uuid, text, boolean) to service_role;

create or replace function public.create_course_projection(
  p_course_code text,
  p_title text,
  p_short_title text,
  p_description text,
  p_primary_vertical text,
  p_lifecycle_status text,
  p_publication_status text,
  p_actor_id uuid,
  p_actor_email text
)
returns public.courses
language plpgsql
security definer
set search_path = public
as $$
declare
  target_vertical_id uuid;
  created public.courses%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:edit-internal');
  select id into target_vertical_id from public.verticals
  where lower(slug) = lower(trim(p_primary_vertical)) or lower(name) = lower(trim(p_primary_vertical))
  order by sort_order, id limit 1;
  if target_vertical_id is null then
    raise exception 'Primary vertical was not found.' using errcode = '22023';
  end if;
  insert into public.courses(
    app_id, course_code, title, short_title, description, primary_vertical_id,
    lifecycle_status, publication_status, health_status, health_score,
    metadata_completeness_score, internal_summary, source_system, data_source,
    provenance, origin_provenance, field_provenance, retrieval_status, is_sample, updated_by
  ) values (
    'ct-' || gen_random_uuid()::text, upper(trim(p_course_code)), trim(p_title), nullif(trim(p_short_title), ''),
    trim(p_description), target_vertical_id, p_lifecycle_status, p_publication_status,
    'Needs Review', 0, 0, '', 'CourseTrack', 'coursetrack', 'coursetrack', 'coursetrack',
    '{}'::jsonb, 'Not connected', false, p_actor_id
  ) returning * into created;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), 'course.created', 'course', created.app_id, null, to_jsonb(created), 'CourseTrack');
  return created;
end;
$$;
revoke all on function public.create_course_projection(text, text, text, text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_course_projection(text, text, text, text, text, text, text, uuid, text) to service_role;

create or replace function public.update_course_projection(
  p_app_id text,
  p_internal_summary text,
  p_owner_name text,
  p_next_review_date date,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns public.courses
language plpgsql
security definer
set search_path = public
as $$
declare
  previous public.courses%rowtype;
  changed public.courses%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:edit-internal');
  select * into previous from public.courses where app_id = p_app_id and archived_at is null for update;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  if previous.provenance = 'lms_api' then raise exception 'Connected LMS API records are read-only.' using errcode = '42501'; end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then raise exception 'Course changed since it was loaded.' using errcode = '40001'; end if;
  update public.courses set internal_summary = p_internal_summary, owner_name = p_owner_name,
    next_review_date = p_next_review_date, provenance = 'coursetrack',
    field_provenance = coalesce(field_provenance, '{}'::jsonb) || jsonb_build_object('internalSummary', 'coursetrack', 'owner', 'coursetrack', 'nextReviewDate', 'coursetrack'),
    updated_by = p_actor_id, updated_at = now()
  where id = previous.id returning * into changed;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), 'course.updated', 'course', p_app_id, to_jsonb(previous), to_jsonb(changed), 'CourseTrack');
  return changed;
end;
$$;
revoke all on function public.update_course_projection(text, text, text, date, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.update_course_projection(text, text, text, date, timestamptz, uuid, text) to service_role;

create or replace function public.set_course_archived(
  p_app_id text,
  p_archived boolean,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns public.courses
language plpgsql
security definer
set search_path = public
as $$
declare
  previous public.courses%rowtype;
  changed public.courses%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:edit-internal');
  select * into previous from public.courses where app_id = p_app_id for update;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  if previous.provenance = 'lms_api' then raise exception 'Connected LMS API records are read-only.' using errcode = '42501'; end if;
  if p_expected_updated_at is not null and previous.updated_at is distinct from p_expected_updated_at then
    raise exception 'Course changed since it was loaded.' using errcode = '40001';
  end if;
  update public.courses set
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then p_actor_id else null end,
    updated_by = p_actor_id,
    provenance = 'coursetrack',
    updated_at = now()
  where id = previous.id returning * into changed;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), case when p_archived then 'course.archived' else 'course.restored' end, 'course', p_app_id, to_jsonb(previous), to_jsonb(changed), 'CourseTrack');
  return changed;
end;
$$;
revoke all on function public.set_course_archived(text, boolean, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.set_course_archived(text, boolean, timestamptz, uuid, text) to service_role;

create or replace function public.assign_course_relationship(
  p_app_id text,
  p_related_app_id text,
  p_relationship_type text,
  p_actor_id uuid,
  p_actor_email text
)
returns public.course_relationships
language plpgsql
security definer
set search_path = public
as $$
declare
  source_course public.courses%rowtype;
  target_course public.courses%rowtype;
  created public.course_relationships%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:edit-internal');
  if p_relationship_type not in ('parent', 'child') then raise exception 'Invalid relationship type.' using errcode = '22023'; end if;
  select * into source_course from public.courses where app_id = p_app_id and archived_at is null;
  select * into target_course from public.courses where app_id = p_related_app_id and archived_at is null;
  if source_course.id is null or target_course.id is null then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  if source_course.id = target_course.id then raise exception 'A course cannot relate to itself.' using errcode = '22023'; end if;
  if exists (select 1 from public.course_relationships where course_id = target_course.id and related_course_id = source_course.id and archived_at is null) then
    raise exception 'This relationship would create a circular pair.' using errcode = '22023';
  end if;
  insert into public.course_relationships(course_id, relationship_type, related_course_id, related_lms_course_id, source, validation_status, raw_value, provenance, origin_provenance, updated_by)
  values (source_course.id, p_relationship_type, target_course.id, coalesce(target_course.lms_course_id, target_course.app_id), 'CourseTrack', 'Resolved', jsonb_build_object('relatedAppId', target_course.app_id), 'coursetrack', 'coursetrack', p_actor_id)
  returning * into created;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), 'relationship.created', 'course_relationship', created.id::text, null, to_jsonb(created), 'CourseTrack');
  return created;
end;
$$;
revoke all on function public.assign_course_relationship(text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.assign_course_relationship(text, text, text, uuid, text) to service_role;

create or replace function public.remove_course_relationship(
  p_relationship_id uuid,
  p_actor_id uuid,
  p_actor_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  removed public.course_relationships%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:edit-internal');
  select * into removed from public.course_relationships where id = p_relationship_id for update;
  if not found then raise exception 'Relationship not found.' using errcode = 'P0002'; end if;
  if removed.source <> 'CourseTrack' or removed.origin_provenance <> 'coursetrack' then
    raise exception 'Uploaded and LMS relationships are immutable.' using errcode = '42501';
  end if;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), 'relationship.removed', 'course_relationship', removed.id::text, to_jsonb(removed), null, 'CourseTrack');
  delete from public.course_relationships where id = removed.id;
  return true;
end;
$$;
revoke all on function public.remove_course_relationship(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.remove_course_relationship(uuid, uuid, text) to service_role;

create or replace function public.move_revamp_task(
  p_task_id uuid,
  p_bucket_key text,
  p_target_index integer,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns public.revamp_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  moving public.revamp_proposals%rowtype;
  bounded_index integer;
  original_bucket text;
  original_order integer;
begin
  if p_bucket_key not in ('Submitted', 'Under Review', 'Approved', 'In Progress') then
    raise exception 'Invalid Revamp bucket.' using errcode = '22023';
  end if;
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'revamp:propose');
  if p_bucket_key = 'Approved' then
    perform public.assert_actor_permission(p_actor_id, p_actor_email, 'revamp:approve');
  end if;

  select * into moving from public.revamp_proposals
  where id = p_task_id and archived_at is null
  for update;
  if not found then raise exception 'Revamp task not found.' using errcode = 'P0002'; end if;
  if moving.updated_at is distinct from p_expected_updated_at then
    raise exception 'Revamp task changed since it was loaded.' using errcode = '40001';
  end if;
  original_bucket := moving.bucket_key;
  original_order := moving.sort_order;

  update public.revamp_proposals set sort_order = -1 where id = p_task_id;
  with ranked as (
    select id, row_number() over (order by sort_order, id) - 1 as position
    from public.revamp_proposals
    where archived_at is null and bucket_key = moving.bucket_key and id <> p_task_id
  )
  update public.revamp_proposals rp set sort_order = ranked.position
  from ranked where rp.id = ranked.id;

  select least(greatest(p_target_index, 0), count(*))::integer into bounded_index
  from public.revamp_proposals
  where archived_at is null and bucket_key = p_bucket_key and id <> p_task_id;

  update public.revamp_proposals
  set sort_order = sort_order + 1
  where archived_at is null and bucket_key = p_bucket_key and id <> p_task_id and sort_order >= bounded_index;

  update public.revamp_proposals
  set bucket_key = p_bucket_key,
      status = p_bucket_key,
      sort_order = bounded_index,
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_task_id
  returning * into moving;

  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (
    p_actor_id, lower(trim(p_actor_email)), 'revamp.moved', 'revamp_proposal', p_task_id::text,
    jsonb_build_object('bucket', original_bucket, 'sortOrder', original_order),
    jsonb_build_object('bucket', p_bucket_key, 'sortOrder', bounded_index),
    'CourseTrack'
  );
  return moving;
end;
$$;
revoke all on function public.move_revamp_task(uuid, text, integer, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.move_revamp_task(uuid, text, integer, timestamptz, uuid, text) to service_role;

create or replace function public.save_course_version(
  p_version_id uuid,
  p_course_app_id text,
  p_version_number text,
  p_version_type text,
  p_publication_date date,
  p_version_status text,
  p_is_current boolean,
  p_release_notes text,
  p_authoring_tool text,
  p_package_standard text,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns public.course_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  previous public.course_versions%rowtype;
  changed public.course_versions%rowtype;
  target_course_id uuid;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'versions:manage');
  if p_version_id is null then
    select id into target_course_id from public.courses where app_id = p_course_app_id and archived_at is null;
    if target_course_id is null then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  else
    select * into previous from public.course_versions where id = p_version_id and archived_at is null for update;
    if not found then raise exception 'Version not found.' using errcode = 'P0002'; end if;
    if previous.provenance = 'lms_api' then raise exception 'Connected LMS API records are read-only.' using errcode = '42501'; end if;
    if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then
      raise exception 'Version changed since it was loaded.' using errcode = '40001';
    end if;
    target_course_id := previous.course_id;
  end if;
  if p_is_current then
    update public.course_versions set is_current = false, version_status = 'Superseded', updated_by = p_actor_id, updated_at = now()
    where course_id = target_course_id and archived_at is null and is_current and id is distinct from p_version_id;
  end if;
  if p_version_id is null then
    insert into public.course_versions(course_id, version_number, version_type, publication_date, version_status, is_current, release_notes, authoring_tool, package_standard, data_source, source_system, managed_by, created_by_email, provenance, origin_provenance, updated_by)
    values (target_course_id, p_version_number, p_version_type, p_publication_date, p_version_status, p_is_current, p_release_notes, p_authoring_tool, p_package_standard, 'coursetrack', 'CourseTrack', 'CourseTrack', lower(trim(p_actor_email)), 'coursetrack', 'coursetrack', p_actor_id)
    returning * into changed;
  else
    update public.course_versions set version_number = p_version_number, version_type = p_version_type,
      publication_date = p_publication_date, version_status = p_version_status, is_current = p_is_current,
      release_notes = p_release_notes, authoring_tool = p_authoring_tool, package_standard = p_package_standard,
      data_source = 'coursetrack', source_system = 'CourseTrack', provenance = 'coursetrack', updated_by = p_actor_id, updated_at = now()
    where id = p_version_id returning * into changed;
  end if;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), case when p_version_id is null then 'version.created' else 'version.updated' end, 'course_version', changed.id::text, case when p_version_id is null then null else to_jsonb(previous) end, to_jsonb(changed), 'CourseTrack');
  return changed;
end;
$$;
revoke all on function public.save_course_version(uuid, text, text, text, date, text, boolean, text, text, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.save_course_version(uuid, text, text, text, date, text, boolean, text, text, text, timestamptz, uuid, text) to service_role;

create or replace function public.archive_workflow_record(
  p_table_name text,
  p_record_id uuid,
  p_expected_updated_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  permission_key text;
  previous jsonb;
  changed jsonb;
begin
  permission_key := case p_table_name
    when 'revamp_proposals' then 'revamp:propose'
    when 'course_versions' then 'versions:manage'
    when 'accreditation_records' then 'accreditation:manage'
    when 'course_flags' then 'flags:manage'
    when 'notes' then 'notes:create'
    else null end;
  if permission_key is null then raise exception 'Record type cannot be archived.' using errcode = '22023'; end if;
  perform public.assert_actor_permission(p_actor_id, p_actor_email, permission_key);
  execute format('select to_jsonb(t) from public.%I t where id = $1 and archived_at is null for update', p_table_name)
  into previous using p_record_id;
  if previous is null then raise exception 'Record not found.' using errcode = 'P0002'; end if;
  if previous->>'provenance' = 'lms_api' then raise exception 'Connected LMS API records are read-only.' using errcode = '42501'; end if;
  if p_expected_updated_at is not null and (previous->>'updated_at')::timestamptz is distinct from p_expected_updated_at then
    raise exception 'Record changed since it was loaded.' using errcode = '40001';
  end if;
  if p_table_name = 'notes' and previous->>'author_id' <> p_actor_id::text and not exists (
    select 1 from public.profiles where id = p_actor_id and role in ('super_admin', 'admin') and account_status = 'active'
  ) then raise exception 'You may only archive your own notes.' using errcode = '42501'; end if;
  execute format('update public.%I set archived_at = now(), archived_by = $2, updated_by = $2, updated_at = now() where id = $1 returning to_jsonb(%I)', p_table_name, p_table_name)
  into changed using p_record_id, p_actor_id;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), p_table_name || '.archived', p_table_name, p_record_id::text, previous, changed, 'CourseTrack');
  return true;
end;
$$;
revoke all on function public.archive_workflow_record(text, uuid, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.archive_workflow_record(text, uuid, timestamptz, uuid, text) to service_role;

create or replace function public.save_workflow_entity(
  p_entity text,
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
  permission_key text;
  target_course_id uuid;
  previous jsonb;
  changed jsonb;
  board_order integer;
begin
  permission_key := case p_entity
    when 'accreditation' then 'accreditation:manage'
    when 'flag' then 'flags:manage'
    when 'note' then 'notes:create'
    when 'revamp' then 'revamp:propose'
    else null end;
  if permission_key is null then raise exception 'Unsupported workflow entity.' using errcode = '22023'; end if;
  perform public.assert_actor_permission(p_actor_id, p_actor_email, permission_key);

  if p_record_id is null then
    select id into target_course_id from public.courses where app_id = p_course_app_id and archived_at is null;
    if target_course_id is null then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  else
    if p_entity = 'accreditation' then select to_jsonb(t) into previous from public.accreditation_records t where id = p_record_id and archived_at is null for update;
    elsif p_entity = 'flag' then select to_jsonb(t) into previous from public.course_flags t where id = p_record_id and archived_at is null for update;
    elsif p_entity = 'note' then select to_jsonb(t) into previous from public.notes t where id = p_record_id and archived_at is null for update;
    else select to_jsonb(t) into previous from public.revamp_proposals t where id = p_record_id and archived_at is null for update;
    end if;
    if previous is null then raise exception 'Record not found.' using errcode = 'P0002'; end if;
    if previous->>'provenance' = 'lms_api' then raise exception 'Connected LMS API records are read-only.' using errcode = '42501'; end if;
    if p_expected_updated_at is null or (previous->>'updated_at')::timestamptz is distinct from p_expected_updated_at then
      raise exception 'Record changed since it was loaded.' using errcode = '40001';
    end if;
    target_course_id := (previous->>'course_id')::uuid;
  end if;

  if p_entity = 'accreditation' then
    if p_record_id is null then
      insert into public.accreditation_records(course_id, organization, jurisdiction, status, approval_number, credit_hours, effective_date, expiration_date, data_source, source_system, provenance, origin_provenance, updated_by)
      values (target_course_id, p_payload->>'organization', p_payload->>'jurisdiction', p_payload->>'status', nullif(p_payload->>'approvalNumber', ''), coalesce((p_payload->>'creditHours')::numeric, 0), (p_payload->>'effectiveDate')::date, (p_payload->>'expirationDate')::date, 'coursetrack', 'CourseTrack', 'coursetrack', 'coursetrack', p_actor_id)
      returning to_jsonb(accreditation_records) into changed;
    else
      update public.accreditation_records set organization = p_payload->>'organization', jurisdiction = p_payload->>'jurisdiction', status = p_payload->>'status', approval_number = nullif(p_payload->>'approvalNumber', ''), credit_hours = coalesce((p_payload->>'creditHours')::numeric, 0), effective_date = (p_payload->>'effectiveDate')::date, expiration_date = (p_payload->>'expirationDate')::date, data_source = 'coursetrack', source_system = 'CourseTrack', provenance = 'coursetrack', updated_by = p_actor_id, updated_at = now() where id = p_record_id returning to_jsonb(accreditation_records) into changed;
    end if;
  elsif p_entity = 'flag' then
    if p_record_id is null then
      insert into public.course_flags(course_id, type, title, priority, status, due_date, provenance, origin_provenance, created_by, updated_by)
      values (target_course_id, p_payload->>'type', p_payload->>'title', p_payload->>'priority', p_payload->>'status', (p_payload->>'dueDate')::date, 'coursetrack', 'coursetrack', p_actor_id, p_actor_id)
      returning to_jsonb(course_flags) into changed;
    else
      update public.course_flags set type = p_payload->>'type', title = p_payload->>'title', priority = p_payload->>'priority', status = p_payload->>'status', due_date = (p_payload->>'dueDate')::date, provenance = 'coursetrack', updated_by = p_actor_id, updated_at = now() where id = p_record_id returning to_jsonb(course_flags) into changed;
    end if;
  elsif p_entity = 'note' then
    if p_record_id is null then
      insert into public.notes(course_id, note_type, visibility, body, author_id, provenance, origin_provenance, updated_by)
      values (target_course_id, p_payload->>'type', p_payload->>'visibility', p_payload->>'body', p_actor_id, 'coursetrack', 'coursetrack', p_actor_id)
      returning to_jsonb(notes) into changed;
    else
      if previous->>'author_id' <> p_actor_id::text and not exists (select 1 from public.profiles where id = p_actor_id and role in ('super_admin', 'admin') and account_status = 'active') then raise exception 'You may only edit your own notes.' using errcode = '42501'; end if;
      update public.notes set note_type = p_payload->>'type', visibility = p_payload->>'visibility', body = p_payload->>'body', provenance = 'coursetrack', updated_by = p_actor_id, updated_at = now() where id = p_record_id returning to_jsonb(notes) into changed;
    end if;
  else
    if p_record_id is null then
      if p_payload->>'bucket' = 'Approved' then perform public.assert_actor_permission(p_actor_id, p_actor_email, 'revamp:approve'); end if;
      perform pg_advisory_xact_lock(hashtext('revamp:' || (p_payload->>'bucket')));
      select count(*)::integer into board_order from public.revamp_proposals where bucket_key = p_payload->>'bucket' and archived_at is null;
      insert into public.revamp_proposals(course_id, title, status, bucket_key, sort_order, priority, score, target_publication_date, business_justification, proposed_by, provenance, origin_provenance, updated_by)
      values (target_course_id, p_payload->>'title', p_payload->>'bucket', p_payload->>'bucket', board_order, p_payload->>'priority', (p_payload->>'score')::integer, (p_payload->>'targetPublicationDate')::date, p_payload->>'businessJustification', p_actor_id, 'coursetrack', 'coursetrack', p_actor_id)
      returning to_jsonb(revamp_proposals) into changed;
    else
      update public.revamp_proposals set title = p_payload->>'title', priority = p_payload->>'priority', score = (p_payload->>'score')::integer, target_publication_date = (p_payload->>'targetPublicationDate')::date, business_justification = p_payload->>'businessJustification', provenance = 'coursetrack', updated_by = p_actor_id, updated_at = now() where id = p_record_id returning to_jsonb(revamp_proposals) into changed;
    end if;
  end if;

  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), p_entity || case when p_record_id is null then '.created' else '.updated' end, p_entity, changed->>'id', previous, changed, 'CourseTrack');
  return changed;
end;
$$;
revoke all on function public.save_workflow_entity(text, uuid, text, jsonb, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.save_workflow_entity(text, uuid, text, jsonb, timestamptz, uuid, text) to service_role;

-- Direct authenticated access is still defended even though application writes
-- use server-side RPCs. API-originated projections are immutable.
create or replace function public.prevent_lms_api_projection_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.provenance = 'lms_api' then
    raise exception 'Connected LMS API records are read-only.' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'courses', 'course_versions', 'accreditation_records', 'course_flags',
    'notes', 'revamp_proposals', 'course_relationships'
  ] loop
    execute format('drop trigger if exists prevent_lms_api_mutation on public.%I', table_name);
    execute format(
      'create trigger prevent_lms_api_mutation before update or delete on public.%I for each row execute function public.prevent_lms_api_projection_mutation()',
      table_name
    );
  end loop;
end;
$$;

commit;
