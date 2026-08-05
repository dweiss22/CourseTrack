begin;

-- The courses table is the editable CourseTrack projection. Immutable LMS truth
-- is retained in lms_snapshots, so LMS-seeded projections must be promotable to
-- manual overrides. Source child records remain protected by their own trigger.
drop trigger if exists prevent_lms_api_mutation on public.courses;

alter table public.courses
  add column if not exists projection_origin text not null default 'coursetrack_created',
  add column if not exists has_manual_overrides boolean not null default false,
  add column if not exists source_difference_count integer not null default 0,
  add column if not exists training_credits jsonb not null default '{"rawDisplay":null,"amount":null,"unit":null}'::jsonb,
  add column if not exists is_published boolean,
  add column if not exists backend_link text,
  add column if not exists frontend_link text,
  add column if not exists content_update_type text,
  add column if not exists content_updated_at date,
  add column if not exists content_notes text;

alter table public.courses drop constraint if exists courses_projection_origin_check;
alter table public.courses add constraint courses_projection_origin_check
  check (projection_origin in ('master_import', 'lms_export', 'coursetrack_created'));
alter table public.courses drop constraint if exists courses_source_difference_count_check;
alter table public.courses add constraint courses_source_difference_count_check
  check (source_difference_count >= 0);

update public.courses
set projection_origin = case
  when origin_provenance = 'lms_api' then 'lms_export'
  when origin_provenance = 'uploaded' then 'master_import'
  else 'coursetrack_created'
end,
has_manual_overrides = coalesce(field_provenance, '{}'::jsonb) @> '{"internalSummary":"coursetrack"}'::jsonb
  or coalesce(field_provenance, '{}'::jsonb) @> '{"owner":"coursetrack"}'::jsonb
  or coalesce(field_provenance, '{}'::jsonb) @> '{"nextReviewDate":"coursetrack"}'::jsonb;

alter table public.field_comparisons
  add column if not exists is_comparable boolean not null default true;

alter table public.accreditation_records
  add column if not exists source_fingerprint text,
  add column if not exists source_topic_number text,
  add column if not exists source_record_index integer,
  add column if not exists source_retrieval_run_id uuid references public.lms_retrieval_runs(id) on delete set null;

create unique index if not exists accreditation_source_fingerprint_idx
  on public.accreditation_records(course_id, source_fingerprint);

create index if not exists courses_projection_origin_idx
  on public.courses(projection_origin, has_manual_overrides);
create index if not exists courses_source_difference_count_idx
  on public.courses(source_difference_count);

create or replace function public.comparison_values_equal(
  p_field_key text,
  p_lms_value jsonb,
  p_course_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  lms_text text;
  course_text text;
begin
  if p_lms_value is null or p_course_value is null then
    return p_lms_value is null and p_course_value is null;
  end if;
  if p_field_key = 'trainingCredits' then
    return coalesce(p_lms_value->>'amount', '') = coalesce(p_course_value->>'amount', '')
      and lower(coalesce(p_lms_value->>'unit', '')) = lower(coalesce(p_course_value->>'unit', ''));
  end if;
  if p_field_key in ('durationMinutes', 'published') then
    return p_lms_value = p_course_value;
  end if;
  lms_text := regexp_replace(lower(trim(coalesce(p_lms_value #>> '{}', ''))), '\s+', ' ', 'g');
  course_text := regexp_replace(lower(trim(coalesce(p_course_value #>> '{}', ''))), '\s+', ' ', 'g');
  if p_field_key = 'publishedDate' then
    lms_text := left(lms_text, 10);
    course_text := left(course_text, 10);
  end if;
  return lms_text = course_text;
end;
$$;

create or replace function public.refresh_course_comparisons(
  p_course_id uuid,
  p_edited_keys text[] default '{}'::text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  projection public.courses%rowtype;
  difference_count integer;
begin
  select * into projection from public.courses where id = p_course_id;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;

  update public.field_comparisons comparison
  set content_metadata_normalized_value = case comparison.field_key
      when 'courseName' then to_jsonb(projection.title)
      when 'contentType' then to_jsonb(projection.delivery_format)
      when 'durationMinutes' then to_jsonb(projection.duration_minutes)
      when 'trainingCredits' then projection.training_credits
      when 'published' then to_jsonb(projection.is_published)
      when 'description' then to_jsonb(projection.description)
      when 'publishedDate' then to_jsonb(projection.original_publish_date::text)
      else comparison.content_metadata_normalized_value
    end,
      comparison_status = case
        when public.comparison_values_equal(comparison.field_key, comparison.lms_normalized_value, case comparison.field_key
          when 'courseName' then to_jsonb(projection.title)
          when 'contentType' then to_jsonb(projection.delivery_format)
          when 'durationMinutes' then to_jsonb(projection.duration_minutes)
          when 'trainingCredits' then projection.training_credits
          when 'published' then to_jsonb(projection.is_published)
          when 'description' then to_jsonb(projection.description)
          when 'publishedDate' then to_jsonb(projection.original_publish_date::text)
          else comparison.content_metadata_normalized_value
        end)
          then 'Match'
        else 'Conflict'
      end,
      resolved_value = case when comparison.field_key = any(p_edited_keys) then null else comparison.resolved_value end,
      selected_source = case when comparison.field_key = any(p_edited_keys) then null else comparison.selected_source end,
      resolution_reason = case when comparison.field_key = any(p_edited_keys) then null else comparison.resolution_reason end,
      resolved_by = case when comparison.field_key = any(p_edited_keys) then null else comparison.resolved_by end,
      resolved_by_email = case when comparison.field_key = any(p_edited_keys) then null else comparison.resolved_by_email end,
      resolved_at = case when comparison.field_key = any(p_edited_keys) then null else comparison.resolved_at end,
      last_compared_at = now(),
      updated_at = now()
  where comparison.course_id = p_course_id and comparison.is_comparable;

  select count(*)::integer into difference_count
  from public.field_comparisons
  where course_id = p_course_id and is_comparable and comparison_status = 'Conflict';

  update public.courses
  set source_difference_count = difference_count,
      source_timestamps = coalesce(source_timestamps, '{}'::jsonb) || jsonb_build_object('lastComparedAt', now())
  where id = p_course_id;
  return difference_count;
end;
$$;
revoke all on function public.refresh_course_comparisons(uuid, text[]) from public, anon, authenticated;
grant execute on function public.refresh_course_comparisons(uuid, text[]) to service_role;

create or replace function public.update_course_projection_v2(
  p_app_id text,
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
  previous public.courses%rowtype;
  changed public.courses%rowtype;
  primary_vertical uuid;
  secondary_slug text;
  edited_keys text[] := '{}'::text[];
  audit_previous jsonb;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:edit-internal');
  select * into previous from public.courses where app_id = p_app_id and archived_at is null for update;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then
    raise exception 'Course changed since it was loaded.' using errcode = '40001';
  end if;
  select id into primary_vertical from public.verticals
  where lower(slug) = lower(p_payload->>'primaryVertical') or lower(name) = lower(p_payload->>'primaryVertical')
  order by sort_order, id limit 1;
  if primary_vertical is null then raise exception 'Primary vertical was not found.' using errcode = '22023'; end if;

  audit_previous := to_jsonb(previous);
  if previous.course_code is distinct from p_payload->>'courseCode' then edited_keys := array_append(edited_keys, 'courseCode'); end if;
  if previous.title is distinct from p_payload->>'title' then edited_keys := array_append(edited_keys, 'courseName'); end if;
  if previous.short_title is distinct from nullif(p_payload->>'shortTitle', '') then edited_keys := array_append(edited_keys, 'shortTitle'); end if;
  if previous.description is distinct from p_payload->>'description' then edited_keys := array_append(edited_keys, 'description'); end if;
  if previous.learning_audience is distinct from nullif(p_payload->>'learningAudience', '') then edited_keys := array_append(edited_keys, 'learningAudience'); end if;
  if previous.primary_vertical_id is distinct from primary_vertical then edited_keys := array_append(edited_keys, 'primaryVertical'); end if;
  if coalesce((
      select array_agg(lower(vertical.slug) order by lower(vertical.slug))
      from public.course_verticals assignment
      join public.verticals vertical on vertical.id = assignment.vertical_id
      where assignment.course_id = previous.id and assignment.relationship_type = 'secondary'
    ), '{}'::text[]) is distinct from coalesce((
      select array_agg(lower(requested.value) order by lower(requested.value))
      from jsonb_array_elements_text(coalesce(p_payload->'secondaryVerticals', '[]'::jsonb)) as requested(value)
    ), '{}'::text[])
    then edited_keys := array_append(edited_keys, 'secondaryVerticals');
  end if;
  if previous.primary_topic is distinct from nullif(p_payload->>'primaryTopic', '') then edited_keys := array_append(edited_keys, 'primaryTopic'); end if;
  if previous.management_classification is distinct from p_payload->>'managementClassification' then edited_keys := array_append(edited_keys, 'managementClassification'); end if;
  if previous.monitoring_enabled is distinct from (p_payload->>'monitoringEnabled')::boolean then edited_keys := array_append(edited_keys, 'monitoringEnabled'); end if;
  if previous.lifecycle_status is distinct from p_payload->>'lifecycleStatus' then edited_keys := array_append(edited_keys, 'lifecycleStatus'); end if;
  if previous.publication_status is distinct from p_payload->>'publicationStatus' then edited_keys := array_append(edited_keys, 'publicationStatus'); end if;
  if previous.delivery_format is distinct from nullif(p_payload->>'contentType', '') then edited_keys := array_append(edited_keys, 'contentType'); end if;
  if previous.duration_minutes is distinct from (p_payload->>'durationMinutes')::integer then edited_keys := array_append(edited_keys, 'durationMinutes'); end if;
  if previous.training_credits is distinct from coalesce(p_payload->'trainingCredits', previous.training_credits) then edited_keys := array_append(edited_keys, 'trainingCredits'); end if;
  if previous.is_published is distinct from (p_payload->>'published')::boolean then edited_keys := array_append(edited_keys, 'published'); end if;
  if previous.authoring_tool is distinct from nullif(p_payload->>'authoringTool', '') then edited_keys := array_append(edited_keys, 'authoringTool'); end if;
  if previous.state_code is distinct from nullif(p_payload->>'stateCode', '') then edited_keys := array_append(edited_keys, 'stateCode'); end if;
  if previous.owner_name is distinct from nullif(p_payload->>'owner', '') then edited_keys := array_append(edited_keys, 'owner'); end if;
  if previous.instructional_designer_name is distinct from nullif(p_payload->>'instructionalDesigner', '') then edited_keys := array_append(edited_keys, 'instructionalDesigner'); end if;
  if previous.original_publish_date is distinct from nullif(p_payload->>'publishedDate', '')::date then edited_keys := array_append(edited_keys, 'publishedDate'); end if;
  if previous.last_major_revision_date is distinct from nullif(p_payload->>'lastMajorRevisionDate', '')::date then edited_keys := array_append(edited_keys, 'lastMajorRevisionDate'); end if;
  if previous.next_review_date is distinct from nullif(p_payload->>'nextReviewDate', '')::date then edited_keys := array_append(edited_keys, 'nextReviewDate'); end if;
  if previous.backend_link is distinct from nullif(p_payload->>'backendLink', '') then edited_keys := array_append(edited_keys, 'backendLink'); end if;
  if previous.frontend_link is distinct from nullif(p_payload->>'frontendLink', '') then edited_keys := array_append(edited_keys, 'frontendLink'); end if;
  if previous.content_update_type is distinct from nullif(p_payload->>'updateType', '') then edited_keys := array_append(edited_keys, 'updateType'); end if;
  if previous.content_updated_at is distinct from nullif(p_payload->>'contentUpdatedAt', '')::date then edited_keys := array_append(edited_keys, 'contentUpdatedAt'); end if;
  if previous.content_notes is distinct from nullif(p_payload->>'contentNotes', '') then edited_keys := array_append(edited_keys, 'contentNotes'); end if;
  if previous.internal_summary is distinct from p_payload->>'internalSummary' then edited_keys := array_append(edited_keys, 'internalSummary'); end if;

  update public.courses set
    course_code = upper(trim(p_payload->>'courseCode')),
    title = trim(p_payload->>'title'),
    short_title = nullif(trim(p_payload->>'shortTitle'), ''),
    description = trim(p_payload->>'description'),
    learning_audience = nullif(trim(p_payload->>'learningAudience'), ''),
    primary_vertical_id = primary_vertical,
    primary_topic = nullif(trim(p_payload->>'primaryTopic'), ''),
    management_classification = p_payload->>'managementClassification',
    monitoring_enabled = (p_payload->>'monitoringEnabled')::boolean,
    lifecycle_status = p_payload->>'lifecycleStatus',
    publication_status = p_payload->>'publicationStatus',
    delivery_format = nullif(trim(p_payload->>'contentType'), ''),
    duration_minutes = (p_payload->>'durationMinutes')::integer,
    training_credits = coalesce(p_payload->'trainingCredits', training_credits),
    is_published = (p_payload->>'published')::boolean,
    authoring_tool = nullif(trim(p_payload->>'authoringTool'), ''),
    state_code = nullif(trim(p_payload->>'stateCode'), ''),
    owner_name = nullif(trim(p_payload->>'owner'), ''),
    instructional_designer_name = nullif(trim(p_payload->>'instructionalDesigner'), ''),
    original_publish_date = nullif(p_payload->>'publishedDate', '')::date,
    last_major_revision_date = nullif(p_payload->>'lastMajorRevisionDate', '')::date,
    next_review_date = nullif(p_payload->>'nextReviewDate', '')::date,
    backend_link = nullif(trim(p_payload->>'backendLink'), ''),
    frontend_link = nullif(trim(p_payload->>'frontendLink'), ''),
    content_update_type = nullif(trim(p_payload->>'updateType'), ''),
    content_updated_at = nullif(p_payload->>'contentUpdatedAt', '')::date,
    content_notes = nullif(trim(p_payload->>'contentNotes'), ''),
    internal_summary = trim(p_payload->>'internalSummary'),
    provenance = case when cardinality(edited_keys) > 0 then 'coursetrack' else provenance end,
    has_manual_overrides = has_manual_overrides or cardinality(edited_keys) > 0,
    field_provenance = coalesce(field_provenance, '{}'::jsonb) ||
      coalesce((select jsonb_object_agg(edited.key, 'coursetrack') from unnest(edited_keys) as edited(key)), '{}'::jsonb),
    updated_by = p_actor_id,
    updated_at = now()
  where id = previous.id returning * into changed;

  delete from public.course_verticals where course_id = previous.id and relationship_type = 'secondary';
  for secondary_slug in select jsonb_array_elements_text(coalesce(p_payload->'secondaryVerticals', '[]'::jsonb)) loop
    insert into public.course_verticals(course_id, vertical_id, relationship_type)
    select previous.id, id, 'secondary' from public.verticals
    where (lower(slug) = lower(secondary_slug) or lower(name) = lower(secondary_slug)) and id <> primary_vertical
    on conflict do nothing;
  end loop;

  perform public.refresh_course_comparisons(previous.id, edited_keys);
  select * into changed from public.courses where id = previous.id;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)), 'course.updated', 'course', p_app_id, audit_previous, to_jsonb(changed), 'CourseTrack');
  return jsonb_build_object('updatedAt', changed.updated_at, 'editedKeys', to_jsonb(edited_keys), 'sourceDifferenceCount', changed.source_difference_count);
end;
$$;
revoke all on function public.update_course_projection_v2(text, jsonb, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.update_course_projection_v2(text, jsonb, timestamptz, uuid, text) to service_role;

create or replace function public.delete_workflow_record_permanently(
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
  previous jsonb;
  previous_bucket text;
  permission_key text;
begin
  permission_key := case p_table_name
    when 'course_flags' then 'flags:manage'
    when 'revamp_proposals' then 'revamp:propose'
    else null
  end;
  if permission_key is null then raise exception 'Record type cannot be permanently deleted.' using errcode = '22023'; end if;
  perform public.assert_actor_permission(p_actor_id, p_actor_email, permission_key);
  execute format('select to_jsonb(t) from public.%I t where id = $1 for update', p_table_name)
    into previous using p_record_id;
  if previous is null then raise exception 'Record not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or (previous->>'updated_at')::timestamptz is distinct from p_expected_updated_at then
    raise exception 'Record changed since it was loaded.' using errcode = '40001';
  end if;
  previous_bucket := previous->>'bucket_key';
  execute format('delete from public.%I where id = $1', p_table_name) using p_record_id;
  if p_table_name = 'revamp_proposals' and previous_bucket is not null then
    with ranked as (
      select id, row_number() over (order by sort_order, id) - 1 as position
      from public.revamp_proposals where archived_at is null and bucket_key = previous_bucket
    )
    update public.revamp_proposals item set sort_order = ranked.position
    from ranked where item.id = ranked.id;
  end if;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source)
  values (p_actor_id, lower(trim(p_actor_email)),
    case when p_table_name = 'course_flags' then 'task_callout.deleted' else 'revamp.deleted' end,
    p_table_name, p_record_id::text, previous, null, 'CourseTrack');
  return true;
end;
$$;
revoke all on function public.delete_workflow_record_permanently(text, uuid, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_workflow_record_permanently(text, uuid, timestamptz, uuid, text) to service_role;

-- Selecting "Use LMS" changes the editable projection while preserving the
-- immutable snapshot. Keeping CourseTrack only acknowledges the discrepancy.
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
declare
  target_course_id uuid;
  previous public.field_comparisons%rowtype;
  changed public.field_comparisons%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:edit-internal');
  select id into target_course_id from public.courses where app_id = p_app_id and archived_at is null;
  if target_course_id is null then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  select * into previous from public.field_comparisons where course_id = target_course_id and field_key = p_field_key for update;
  if previous.id is null then raise exception 'Source-comparison field not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then raise exception 'Record changed since it was loaded.' using errcode = '40001'; end if;
  if p_selected_source is not null and p_selected_source not in ('lms', 'content_metadata') then raise exception 'Resolution source is invalid.' using errcode = '22023'; end if;

  if p_selected_source = 'lms' then
    if p_field_key not in ('courseId', 'courseName', 'contentType', 'durationMinutes', 'trainingCredits', 'published', 'description', 'publishedDate') then
      raise exception 'This LMS field cannot be copied into the CourseTrack projection.' using errcode = '22023';
    end if;
    update public.courses set
      course_code = case when p_field_key = 'courseId' then previous.lms_normalized_value #>> '{}' else course_code end,
      title = case when p_field_key = 'courseName' then previous.lms_normalized_value #>> '{}' else title end,
      delivery_format = case when p_field_key = 'contentType' then previous.lms_normalized_value #>> '{}' else delivery_format end,
      duration_minutes = case when p_field_key = 'durationMinutes' then (previous.lms_normalized_value #>> '{}')::integer else duration_minutes end,
      training_credits = case when p_field_key = 'trainingCredits' then previous.lms_normalized_value else training_credits end,
      is_published = case when p_field_key = 'published' then (previous.lms_normalized_value #>> '{}')::boolean else is_published end,
      description = case when p_field_key = 'description' then coalesce(previous.lms_normalized_value #>> '{}', '') else description end,
      original_publish_date = case when p_field_key = 'publishedDate' then (previous.lms_normalized_value #>> '{}')::date else original_publish_date end,
      field_provenance = jsonb_set(coalesce(field_provenance, '{}'::jsonb), array[p_field_key], '"lms"'::jsonb, true),
      updated_by = p_actor_id,
      updated_at = now()
    where id = target_course_id;
    perform public.refresh_course_comparisons(target_course_id, '{}'::text[]);
  end if;

  update public.field_comparisons set
    resolved_value = case
      when p_selected_source = 'lms' then previous.lms_normalized_value
      when p_selected_source = 'content_metadata' then content_metadata_normalized_value
      else null
    end,
    selected_source = p_selected_source,
    resolution_reason = p_resolution_reason,
    resolved_by = case when p_selected_source is null then null else p_actor_id end,
    resolved_by_email = case when p_selected_source is null then null else lower(trim(p_actor_email)) end,
    resolved_at = case when p_selected_source is null then null else now() end,
    updated_at = now()
  where id = previous.id returning * into changed;
  insert into public.audit_logs(actor_id, actor_email, action, record_type, record_id, previous_values, new_values, source, reason)
  values (p_actor_id, lower(trim(p_actor_email)),
    case when p_selected_source is null then 'course.field_resolution_cleared' when p_selected_source = 'lms' then 'course.lms_value_applied' else 'course.field_resolution_selected' end,
    'field_comparison', p_app_id || ':' || p_field_key, to_jsonb(previous), to_jsonb(changed), 'CourseTrack', p_resolution_reason);
  return to_jsonb(changed);
end;
$$;
revoke all on function public.resolve_course_field_v2(text, text, text, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_course_field_v2(text, text, text, text, timestamptz, uuid, text) to service_role;

-- Keep the health trigger compatible with bigint counts produced by count(*).
create or replace function public.set_course_health_cache()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  score integer;
begin
  score := public.course_health_score(
    new.metadata_completeness_score,
    (select count(*)::integer from public.field_comparisons where course_id = new.id and comparison_status = 'Conflict' and selected_source is null),
    jsonb_array_length(coalesce(new.import_validation_errors, '[]'::jsonb)),
    exists (select 1 from public.lms_snapshots where course_id = new.id and is_current)
  );
  new.health_score := score;
  new.health_status := public.course_health_status(score);
  return new;
end;
$$;

commit;
