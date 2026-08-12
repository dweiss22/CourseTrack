begin;

-- A course has zero or more vertical memberships. The legacy primary column is
-- retained only so an older application can be rolled back safely.
insert into public.course_verticals(course_id, vertical_id, relationship_type)
select c.id, c.primary_vertical_id, 'applicable'
from public.courses c
join public.verticals v on v.id = c.primary_vertical_id
where lower(v.slug) <> 'unclassified'
on conflict (course_id, vertical_id) do update set relationship_type = 'applicable';

delete from public.course_verticals cv
using public.verticals v
where cv.vertical_id = v.id and lower(v.slug) = 'unclassified';

update public.course_verticals set relationship_type = 'applicable'
where relationship_type <> 'applicable';

update public.verticals set active = false where lower(slug) = 'unclassified';
alter table public.courses alter column primary_vertical_id drop not null;
comment on column public.courses.primary_vertical_id is
  'Deprecated rollout compatibility column. Runtime membership is public.course_verticals.';

create or replace function public.sync_legacy_primary_vertical_membership()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.primary_vertical_id is not null and exists (
    select 1 from public.verticals v where v.id = new.primary_vertical_id and lower(v.slug) <> 'unclassified'
  ) then
    insert into public.course_verticals(course_id, vertical_id, relationship_type)
    values (new.id, new.primary_vertical_id, 'applicable')
    on conflict (course_id, vertical_id) do update set relationship_type = 'applicable';
  end if;
  return new;
end $$;

drop trigger if exists sync_legacy_primary_vertical_membership on public.courses;
create trigger sync_legacy_primary_vertical_membership
after insert or update of primary_vertical_id on public.courses
for each row execute function public.sync_legacy_primary_vertical_membership();

create or replace function public.search_course_library_v2(
  p_search text default '', p_vertical text default '', p_lifecycle text default '', p_health text default '',
  p_classification text default 'Lexipol Managed', p_work_queue text default '', p_lms_link text default '',
  p_sort text default 'title', p_descending boolean default false, p_limit integer default 25, p_offset integer default 0
) returns table(
  id text, title text, short_title text, course_code text, lms_course_id text, description text,
  verticals text[], management_classification text, lms_link_status text, retrieval_status text,
  last_retrieved_at timestamptz, health_status text, lifecycle_status text, primary_topic text, owner_name text,
  duration_minutes integer, data_source text, next_review_date date, metadata_completeness_score integer,
  source_difference_count integer, conflict_count bigint, flag_count bigint, has_lms_snapshot boolean,
  has_content_metadata boolean, import_validation_error_count integer, tags text[], topics text[], total_count bigint
) language sql stable security definer set search_path = public as $$
  with base as (
    select c.id as database_id, c.app_id, c.title, c.short_title, c.course_code, c.lms_course_id, c.description,
      coalesce((select array_agg(case lower(v.slug)
        when 'p1a' then 'P1A' when 'fr1a' then 'FR1A' when 'c1a' then 'C1A'
        when 'ems1' then 'EMS1' when 'd1a' then 'D1A' when 'lgu' then 'LGU'
        when 'lexipol' then 'Lexipol' when 'wellness' then 'Wellness' end order by v.sort_order, v.id)
        from public.course_verticals cv join public.verticals v on v.id = cv.vertical_id
        where cv.course_id = c.id and v.active and lower(v.slug) <> 'unclassified'), '{}'::text[]) as vertical_values,
      c.management_classification, c.retrieval_status, c.last_retrieved_at, c.health_status,
      c.lifecycle_status, c.primary_topic, c.owner_name, c.duration_minutes, c.data_source,
      c.next_review_date, c.metadata_completeness_score, c.source_difference_count,
      jsonb_array_length(coalesce(c.import_validation_errors, '[]'::jsonb)) as validation_count,
      exists(select 1 from public.lms_snapshots s where s.course_id = c.id and s.is_current) as has_lms,
      exists(select 1 from public.content_metadata_records m where m.course_id = c.id and m.is_current and m.is_importable) as has_metadata,
      (select count(*) from public.field_comparisons f where f.course_id = c.id and f.alignment_status in ('Pending LMS update', 'Mapping required')) as differences,
      (select count(*) from public.course_flags f where f.course_id = c.id and f.archived_at is null) as flags,
      coalesce((select array_agg(distinct t.display_label order by t.display_label) from public.course_tags ct join public.tags t on t.id = ct.tag_id where ct.course_id = c.id), '{}'::text[]) as tag_values,
      coalesce((select array_agg(distinct t.display_label order by t.display_label) from public.course_topics ct join public.topics t on t.id = ct.topic_id where ct.course_id = c.id), '{}'::text[]) as topic_values
    from public.courses c where c.archived_at is null
  ), filtered as (
    select * from base b where
      (coalesce(trim(p_search), '') = '' or concat_ws(' ', b.title, b.short_title, b.course_code, b.lms_course_id, b.description, b.primary_topic, b.owner_name, array_to_string(b.tag_values, ' '), array_to_string(b.topic_values, ' '), array_to_string(b.vertical_values, ' ')) ilike '%' || trim(p_search) || '%')
      and (coalesce(p_vertical, '') in ('', 'All verticals')
        or (p_vertical = 'No vertical' and cardinality(b.vertical_values) = 0)
        or p_vertical = any(b.vertical_values))
      and (coalesce(p_lifecycle, '') in ('', 'All statuses') or b.lifecycle_status = p_lifecycle)
      and (coalesce(p_health, '') in ('', 'All health levels') or b.health_status = p_health)
      and (coalesce(p_classification, '') in ('', 'All courses')
        or (p_classification = 'Lexipol Managed' and b.management_classification = 'Lexipol managed')
        or (p_classification = 'Unmanaged' and b.management_classification = 'Unclassified'))
      and (coalesce(p_lms_link, '') in ('', 'All LMS links')
        or (p_lms_link = 'linked' and b.has_lms)
        or (p_lms_link = 'not_linked' and not b.has_lms))
      and (coalesce(p_work_queue, '') in ('', 'All queues')
        or (p_work_queue = 'Missing Content Metadata' and b.has_lms and not b.has_metadata)
        or (p_work_queue = 'Field conflicts' and b.differences > 0)
        or (p_work_queue = 'Invalid import records' and b.validation_count > 0)
        or (p_work_queue = 'Stale LMS data' and b.retrieval_status in ('Stale Data', 'Retrieval Failed')))
  )
  select f.app_id, f.title, f.short_title, f.course_code, f.lms_course_id, f.description,
    f.vertical_values, f.management_classification, case when f.has_lms then 'linked' else 'not_linked' end,
    f.retrieval_status, f.last_retrieved_at, f.health_status, f.lifecycle_status, f.primary_topic,
    f.owner_name, f.duration_minutes, f.data_source, f.next_review_date, f.metadata_completeness_score,
    f.source_difference_count, f.differences, f.flags, f.has_lms, f.has_metadata, f.validation_count,
    f.tag_values, f.topic_values, count(*) over()
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
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
$$;

revoke all on function public.search_course_library_v2(text,text,text,text,text,text,text,text,boolean,integer,integer) from public, anon, authenticated;
grant execute on function public.search_course_library_v2(text,text,text,text,text,text,text,text,boolean,integer,integer) to service_role;

create or replace function public.create_course_projection_v2(
  p_course_code text, p_title text, p_short_title text, p_description text, p_verticals text[],
  p_lifecycle_status text, p_publication_status text, p_actor_id uuid, p_actor_email text
) returns public.courses language plpgsql security definer set search_path = public as $$
declare changed public.courses%rowtype; target_id uuid; requested_count integer; resolved_count integer;
begin
  perform public.assert_actor_permission(p_actor_id,p_actor_email,'courses:edit-internal');
  select count(distinct value) into requested_count from unnest(coalesce(p_verticals,'{}'::text[])) requested(value);
  select count(distinct v.id) into resolved_count from unnest(coalesce(p_verticals,'{}'::text[])) requested(value)
  join public.verticals v on lower(v.slug)=lower(requested.value) or lower(v.name)=lower(requested.value)
  where v.active and lower(v.slug)<>'unclassified';
  if requested_count <> resolved_count then raise exception 'One or more verticals were not found.' using errcode='22023'; end if;
  insert into public.courses(app_id,course_code,title,short_title,description,primary_vertical_id,lifecycle_status,publication_status,
    health_status,health_score,metadata_completeness_score,internal_summary,source_system,data_source,provenance,origin_provenance,
    field_provenance,retrieval_status,is_sample,updated_by)
  values('ct-'||gen_random_uuid()::text,upper(trim(p_course_code)),trim(p_title),nullif(trim(p_short_title),''),trim(p_description),
    null,p_lifecycle_status,p_publication_status,'Needs Review',0,0,'','CourseTrack','coursetrack','coursetrack','coursetrack',
    jsonb_build_object('verticals','coursetrack'),'Not connected',false,p_actor_id)
  returning * into changed;
  target_id:=changed.id;
  insert into public.course_verticals(course_id,vertical_id,relationship_type)
  select target_id,v.id,'applicable' from unnest(coalesce(p_verticals,'{}'::text[])) requested(value)
  join public.verticals v on lower(v.slug)=lower(requested.value) or lower(v.name)=lower(requested.value)
  where v.active and lower(v.slug)<>'unclassified' on conflict do nothing;
  update public.courses set primary_vertical_id=(select vertical_id from public.course_verticals where course_id=target_id order by vertical_id limit 1),updated_at=now()
  where id=target_id returning * into changed;
  insert into public.audit_logs(actor_id,actor_email,action,record_type,record_id,previous_values,new_values,source)
  values(p_actor_id,lower(trim(p_actor_email)),'course.created','course',changed.app_id,null,to_jsonb(changed),'CourseTrack');
  return changed;
end $$;

revoke all on function public.create_course_projection_v2(text,text,text,text,text[],text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.create_course_projection_v2(text,text,text,text,text[],text,text,uuid,text) to service_role;

create or replace function public.update_course_projection_v3(
  p_app_id text, p_payload jsonb, p_expected_updated_at timestamptz, p_actor_id uuid, p_actor_email text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare requested jsonb := coalesce(p_payload->'verticals','[]'::jsonb); previous public.courses%rowtype; changed public.courses%rowtype;
  requested_count integer; resolved_count integer; edited_keys text[] := '{}'::text[]; audit_previous jsonb;
begin
  perform public.assert_actor_permission(p_actor_id,p_actor_email,'courses:edit-internal');
  if jsonb_typeof(requested) <> 'array' then raise exception 'Verticals must be an array.' using errcode = '22023'; end if;
  select * into previous from public.courses where app_id=p_app_id and archived_at is null for update;
  if not found then raise exception 'Course not found.' using errcode='P0002'; end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then raise exception 'Course changed since it was loaded.' using errcode='40001'; end if;
  select count(distinct value) into requested_count from jsonb_array_elements_text(requested);
  select count(distinct v.id) into resolved_count from jsonb_array_elements_text(requested) requested_vertical(value)
  join public.verticals v on lower(v.slug)=lower(requested_vertical.value) or lower(v.name)=lower(requested_vertical.value)
  where v.active and lower(v.slug)<>'unclassified';
  if requested_count <> resolved_count then raise exception 'One or more verticals were not found.' using errcode='22023'; end if;
  if coalesce((select array_agg(lower(v.slug) order by lower(v.slug)) from public.course_verticals cv join public.verticals v on v.id=cv.vertical_id where cv.course_id=previous.id),'{}'::text[])
    is distinct from coalesce((select array_agg(lower(value) order by lower(value)) from jsonb_array_elements_text(requested)),'{}'::text[])
    then edited_keys:=array_append(edited_keys,'verticals'); end if;
  if previous.course_code is distinct from upper(trim(p_payload->>'courseCode')) then edited_keys:=array_append(edited_keys,'courseCode'); end if;
  if previous.title is distinct from trim(p_payload->>'title') then edited_keys:=array_append(edited_keys,'courseName'); end if;
  if previous.short_title is distinct from nullif(trim(p_payload->>'shortTitle'),'') then edited_keys:=array_append(edited_keys,'shortTitle'); end if;
  if previous.description is distinct from trim(p_payload->>'description') then edited_keys:=array_append(edited_keys,'description'); end if;
  if previous.learning_audience is distinct from nullif(trim(p_payload->>'learningAudience'),'') then edited_keys:=array_append(edited_keys,'learningAudience'); end if;
  if previous.primary_topic is distinct from nullif(trim(p_payload->>'primaryTopic'),'') then edited_keys:=array_append(edited_keys,'primaryTopic'); end if;
  if previous.management_classification is distinct from p_payload->>'managementClassification' then edited_keys:=array_append(edited_keys,'managementClassification'); end if;
  if previous.monitoring_enabled is distinct from (p_payload->>'monitoringEnabled')::boolean then edited_keys:=array_append(edited_keys,'monitoringEnabled'); end if;
  if previous.lifecycle_status is distinct from p_payload->>'lifecycleStatus' then edited_keys:=array_append(edited_keys,'lifecycleStatus'); end if;
  if previous.publication_status is distinct from p_payload->>'publicationStatus' then edited_keys:=array_append(edited_keys,'publicationStatus'); end if;
  if previous.delivery_format is distinct from nullif(trim(p_payload->>'contentType'),'') then edited_keys:=array_append(edited_keys,'contentType'); end if;
  if previous.duration_minutes is distinct from (p_payload->>'durationMinutes')::integer then edited_keys:=array_append(edited_keys,'durationMinutes'); end if;
  if previous.training_credits is distinct from coalesce(p_payload->'trainingCredits',previous.training_credits) then edited_keys:=array_append(edited_keys,'trainingCredits'); end if;
  if previous.is_published is distinct from (p_payload->>'published')::boolean then edited_keys:=array_append(edited_keys,'published'); end if;
  if previous.authoring_tool is distinct from nullif(trim(p_payload->>'authoringTool'),'') then edited_keys:=array_append(edited_keys,'authoringTool'); end if;
  if previous.state_code is distinct from nullif(trim(p_payload->>'stateCode'),'') then edited_keys:=array_append(edited_keys,'stateCode'); end if;
  if previous.owner_name is distinct from nullif(trim(p_payload->>'owner'),'') then edited_keys:=array_append(edited_keys,'owner'); end if;
  if previous.instructional_designer_name is distinct from nullif(trim(p_payload->>'instructionalDesigner'),'') then edited_keys:=array_append(edited_keys,'instructionalDesigner'); end if;
  if previous.original_publish_date is distinct from nullif(p_payload->>'publishedDate','')::date then edited_keys:=array_append(edited_keys,'publishedDate'); end if;
  if previous.last_major_revision_date is distinct from nullif(p_payload->>'lastMajorRevisionDate','')::date then edited_keys:=array_append(edited_keys,'lastMajorRevisionDate'); end if;
  if previous.next_review_date is distinct from nullif(p_payload->>'nextReviewDate','')::date then edited_keys:=array_append(edited_keys,'nextReviewDate'); end if;
  if previous.backend_link is distinct from nullif(trim(p_payload->>'backendLink'),'') then edited_keys:=array_append(edited_keys,'backendLink'); end if;
  if previous.frontend_link is distinct from nullif(trim(p_payload->>'frontendLink'),'') then edited_keys:=array_append(edited_keys,'frontendLink'); end if;
  if previous.content_update_type is distinct from nullif(trim(p_payload->>'updateType'),'') then edited_keys:=array_append(edited_keys,'updateType'); end if;
  if previous.content_updated_at is distinct from nullif(p_payload->>'contentUpdatedAt','')::date then edited_keys:=array_append(edited_keys,'contentUpdatedAt'); end if;
  if previous.content_notes is distinct from nullif(trim(p_payload->>'contentNotes'),'') then edited_keys:=array_append(edited_keys,'contentNotes'); end if;
  if previous.internal_summary is distinct from trim(p_payload->>'internalSummary') then edited_keys:=array_append(edited_keys,'internalSummary'); end if;
  audit_previous:=to_jsonb(previous);
  update public.courses set course_code=upper(trim(p_payload->>'courseCode')),title=trim(p_payload->>'title'),short_title=nullif(trim(p_payload->>'shortTitle'),''),
    description=trim(p_payload->>'description'),learning_audience=nullif(trim(p_payload->>'learningAudience'),''),primary_topic=nullif(trim(p_payload->>'primaryTopic'),''),
    management_classification=p_payload->>'managementClassification',monitoring_enabled=(p_payload->>'monitoringEnabled')::boolean,lifecycle_status=p_payload->>'lifecycleStatus',
    publication_status=p_payload->>'publicationStatus',delivery_format=nullif(trim(p_payload->>'contentType'),''),duration_minutes=(p_payload->>'durationMinutes')::integer,
    training_credits=coalesce(p_payload->'trainingCredits',training_credits),is_published=(p_payload->>'published')::boolean,authoring_tool=nullif(trim(p_payload->>'authoringTool'),''),
    state_code=nullif(trim(p_payload->>'stateCode'),''),owner_name=nullif(trim(p_payload->>'owner'),''),instructional_designer_name=nullif(trim(p_payload->>'instructionalDesigner'),''),
    original_publish_date=nullif(p_payload->>'publishedDate','')::date,last_major_revision_date=nullif(p_payload->>'lastMajorRevisionDate','')::date,next_review_date=nullif(p_payload->>'nextReviewDate','')::date,
    backend_link=nullif(trim(p_payload->>'backendLink'),''),frontend_link=nullif(trim(p_payload->>'frontendLink'),''),content_update_type=nullif(trim(p_payload->>'updateType'),''),
    content_updated_at=nullif(p_payload->>'contentUpdatedAt','')::date,content_notes=nullif(trim(p_payload->>'contentNotes'),''),internal_summary=trim(p_payload->>'internalSummary'),
    provenance=case when cardinality(edited_keys)>0 then 'coursetrack' else provenance end,has_manual_overrides=has_manual_overrides or cardinality(edited_keys)>0,
    field_provenance=coalesce(field_provenance,'{}'::jsonb)||coalesce((select jsonb_object_agg(key,'coursetrack') from unnest(edited_keys) edited(key)),'{}'::jsonb),
    updated_by=p_actor_id,updated_at=now() where id=previous.id returning * into changed;
  delete from public.course_verticals where course_id = previous.id;
  insert into public.course_verticals(course_id, vertical_id, relationship_type)
  select previous.id, v.id, 'applicable' from jsonb_array_elements_text(requested) requested_vertical(value)
  join public.verticals v on lower(v.slug) = lower(requested_vertical.value) or lower(v.name) = lower(requested_vertical.value)
  where v.active and lower(v.slug) <> 'unclassified' on conflict do nothing;
  update public.courses set primary_vertical_id=(select vertical_id from public.course_verticals where course_id=previous.id order by vertical_id limit 1) where id=previous.id;
  perform public.refresh_course_comparisons(previous.id,edited_keys);
  select * into changed from public.courses where id=previous.id;
  insert into public.audit_logs(actor_id,actor_email,action,record_type,record_id,previous_values,new_values,source)
  values(p_actor_id,lower(trim(p_actor_email)),'course.updated','course',p_app_id,audit_previous,to_jsonb(changed),'CourseTrack');
  return jsonb_build_object('updatedAt',changed.updated_at,'editedKeys',to_jsonb(edited_keys),'sourceDifferenceCount',changed.source_difference_count);
end $$;

revoke all on function public.update_course_projection_v3(text,jsonb,timestamptz,uuid,text) from public, anon, authenticated;
grant execute on function public.update_course_projection_v3(text,jsonb,timestamptz,uuid,text) to service_role;

create or replace function public.update_course_field_v1(
  p_app_id text, p_field text, p_value jsonb, p_expected_updated_at timestamptz, p_actor_id uuid, p_actor_email text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare previous public.courses%rowtype; changed public.courses%rowtype; requested_count integer; saved_count integer; edited_key text;
begin
  perform public.assert_actor_permission(p_actor_id, p_actor_email, 'courses:edit-internal');
  if p_field not in ('courseCode','title','shortTitle','description','learningAudience','verticals','primaryTopic','managementClassification','monitoringEnabled','lifecycleStatus','publicationStatus','contentType','durationMinutes','trainingCredits','published','authoringTool','stateCode','owner','instructionalDesigner','publishedDate','lastMajorRevisionDate','nextReviewDate','backendLink','frontendLink','updateType','contentUpdatedAt','contentNotes','internalSummary') then
    raise exception 'Field is not editable.' using errcode = '22023';
  end if;
  select * into previous from public.courses where app_id = p_app_id and archived_at is null for update;
  if not found then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or previous.updated_at is distinct from p_expected_updated_at then raise exception 'Course changed since it was loaded.' using errcode = '40001'; end if;

  if p_field = 'verticals' then
    if jsonb_typeof(p_value) <> 'array' then raise exception 'Verticals must be an array.' using errcode = '22023'; end if;
    delete from public.course_verticals where course_id = previous.id;
    insert into public.course_verticals(course_id, vertical_id, relationship_type)
    select previous.id, v.id, 'applicable' from jsonb_array_elements_text(p_value) requested(value)
    join public.verticals v on lower(v.slug) = lower(requested.value) or lower(v.name) = lower(requested.value)
    where v.active and lower(v.slug) <> 'unclassified' on conflict do nothing;
    select count(distinct value) into requested_count from jsonb_array_elements_text(p_value);
    select count(*) into saved_count from public.course_verticals where course_id = previous.id;
    if requested_count <> saved_count then raise exception 'One or more verticals were not found.' using errcode = '22023'; end if;
    update public.courses set primary_vertical_id = (select vertical_id from public.course_verticals where course_id = previous.id order by vertical_id limit 1),
      provenance = 'coursetrack', has_manual_overrides = true,
      field_provenance = jsonb_set(coalesce(field_provenance, '{}'::jsonb), array[p_field], '"coursetrack"'::jsonb, true),
      updated_by = p_actor_id, updated_at = now() where id = previous.id returning * into changed;
  else
    update public.courses set
      course_code = case when p_field='courseCode' then upper(trim(p_value #>> '{}')) else course_code end,
      title = case when p_field='title' then trim(p_value #>> '{}') else title end,
      short_title = case when p_field='shortTitle' then nullif(trim(p_value #>> '{}'),'') else short_title end,
      description = case when p_field='description' then coalesce(p_value #>> '{}','') else description end,
      learning_audience = case when p_field='learningAudience' then nullif(trim(p_value #>> '{}'),'') else learning_audience end,
      primary_topic = case when p_field='primaryTopic' then nullif(trim(p_value #>> '{}'),'') else primary_topic end,
      management_classification = case when p_field='managementClassification' then p_value #>> '{}' else management_classification end,
      monitoring_enabled = case when p_field='monitoringEnabled' then (p_value #>> '{}')::boolean else monitoring_enabled end,
      lifecycle_status = case when p_field='lifecycleStatus' then p_value #>> '{}' else lifecycle_status end,
      publication_status = case when p_field='publicationStatus' then p_value #>> '{}' else publication_status end,
      delivery_format = case when p_field='contentType' then nullif(trim(p_value #>> '{}'),'') else delivery_format end,
      duration_minutes = case when p_field='durationMinutes' then nullif(p_value #>> '{}','')::integer else duration_minutes end,
      training_credits = case when p_field='trainingCredits' then p_value else training_credits end,
      is_published = case when p_field='published' then nullif(p_value #>> '{}','')::boolean else is_published end,
      authoring_tool = case when p_field='authoringTool' then nullif(trim(p_value #>> '{}'),'') else authoring_tool end,
      state_code = case when p_field='stateCode' then nullif(trim(p_value #>> '{}'),'') else state_code end,
      owner_name = case when p_field='owner' then nullif(trim(p_value #>> '{}'),'') else owner_name end,
      instructional_designer_name = case when p_field='instructionalDesigner' then nullif(trim(p_value #>> '{}'),'') else instructional_designer_name end,
      original_publish_date = case when p_field='publishedDate' then nullif(p_value #>> '{}','')::date else original_publish_date end,
      last_major_revision_date = case when p_field='lastMajorRevisionDate' then nullif(p_value #>> '{}','')::date else last_major_revision_date end,
      next_review_date = case when p_field='nextReviewDate' then nullif(p_value #>> '{}','')::date else next_review_date end,
      backend_link = case when p_field='backendLink' then nullif(trim(p_value #>> '{}'),'') else backend_link end,
      frontend_link = case when p_field='frontendLink' then nullif(trim(p_value #>> '{}'),'') else frontend_link end,
      content_update_type = case when p_field='updateType' then nullif(trim(p_value #>> '{}'),'') else content_update_type end,
      content_updated_at = case when p_field='contentUpdatedAt' then nullif(p_value #>> '{}','')::date else content_updated_at end,
      content_notes = case when p_field='contentNotes' then nullif(trim(p_value #>> '{}'),'') else content_notes end,
      internal_summary = case when p_field='internalSummary' then coalesce(p_value #>> '{}','') else internal_summary end,
      provenance = 'coursetrack', has_manual_overrides = true,
      field_provenance = jsonb_set(coalesce(field_provenance, '{}'::jsonb), array[p_field], '"coursetrack"'::jsonb, true),
      updated_by = p_actor_id, updated_at = now()
    where id = previous.id returning * into changed;
  end if;
  edited_key := case p_field when 'title' then 'courseName' when 'contentType' then 'contentType' else p_field end;
  perform public.refresh_course_comparisons(previous.id, array[edited_key]);
  select * into changed from public.courses where id = previous.id;
  insert into public.audit_logs(actor_id,actor_email,action,record_type,record_id,previous_values,new_values,source)
  values(p_actor_id,lower(trim(p_actor_email)),'course.field_updated','course',p_app_id,to_jsonb(previous),to_jsonb(changed),'CourseTrack');
  return jsonb_build_object('updatedAt',changed.updated_at,'sourceDifferenceCount',changed.source_difference_count);
end $$;

revoke all on function public.update_course_field_v1(text,text,jsonb,timestamptz,uuid,text) from public, anon, authenticated;
grant execute on function public.update_course_field_v1(text,text,jsonb,timestamptz,uuid,text) to service_role;

create or replace function public.get_dashboard_snapshot_v2()
returns jsonb language sql stable security definer set search_path = public as $$
  with memberships as (
    select cv.course_id, array_agg(case lower(v.slug)
      when 'p1a' then 'P1A' when 'fr1a' then 'FR1A' when 'c1a' then 'C1A' when 'ems1' then 'EMS1'
      when 'd1a' then 'D1A' when 'lgu' then 'LGU' when 'lexipol' then 'Lexipol' when 'wellness' then 'Wellness' end order by v.sort_order) as verticals
    from public.course_verticals cv join public.verticals v on v.id=cv.vertical_id
    where v.active and lower(v.slug)<>'unclassified' group by cv.course_id
  ), base as (
    select c.id,c.app_id,c.title,coalesce(m.verticals,'{}'::text[]) verticals,c.management_classification,c.health_status,
      c.next_review_date,c.owner_name,c.metadata_completeness_score,c.retrieval_status,
      jsonb_array_length(coalesce(c.import_validation_errors,'[]'::jsonb)) validation_count,
      exists(select 1 from public.lms_snapshots s where s.course_id=c.id and s.is_current) has_lms,
      exists(select 1 from public.content_metadata_records md where md.course_id=c.id and md.is_current and md.is_importable) has_metadata,
      (select count(*) from public.field_comparisons f where f.course_id=c.id and f.alignment_status='Pending LMS update') conflict_count,
      (select count(*) from public.field_comparisons f where f.course_id=c.id and f.alignment_status='Mapping required') mapping_count,
      (select count(*) from public.course_flags f where f.course_id=c.id and f.archived_at is null) flag_count
    from public.courses c left join memberships m on m.course_id=c.id where c.archived_at is null
  ), managed as (select * from base where management_classification='Lexipol managed'),
  vertical_values(name,position) as (values ('P1A',1),('FR1A',2),('C1A',3),('EMS1',4),('D1A',5),('LGU',6),('Lexipol',7),('Wellness',8)),
  health_values(name,position) as (values ('Healthy',1),('Monitor',2),('Needs Review',3),('At Risk',4),('Critical',5))
  select jsonb_build_object(
    'metrics',jsonb_build_object(
      'totalLmsRetrieved',(select count(*) from base where has_lms),
      'lexipolManaged',(select count(*) from managed),
      'unmanaged',(select count(*) from base where management_classification='Unclassified'),
      'verticalUnclassified',(select count(*) from managed where cardinality(verticals)=0),
      'missingContentMetadata',(select count(*) from managed where has_lms and not has_metadata),
      'notLmsLinked',(select count(*) from managed where not has_lms),
      'unresolvedConflicts',(select count(*) from managed where conflict_count>0),
      'mappingRequired',(select count(*) from managed where mapping_count>0),
      'staleLms',(select count(*) from managed where retrieval_status in ('Stale Data','Retrieval Failed')),
      'importValidationErrors',(select coalesce(sum(validation_count),0) from managed)),
    'coursesInView',(select count(*) from managed),
    'verticalMemberships',(select coalesce(sum(cardinality(verticals)),0) from managed),
    'verticalData',(select jsonb_agg(jsonb_build_object('name',vv.name,'courses',(select count(*) from managed m where vv.name=any(m.verticals))) order by vv.position) from vertical_values vv),
    'healthData',(select jsonb_agg(jsonb_build_object('name',hv.name,'value',(select count(*) from managed m where m.health_status=hv.name)) order by hv.position) from health_values hv),
    'reviewQueue',coalesce((select jsonb_agg(to_jsonb(q)) from (select app_id id,title,verticals,owner_name owner,next_review_date "nextReviewDate",health_status "healthStatus",flag_count "flagCount",metadata_completeness_score "metadataCompletenessScore" from managed where next_review_date is not null order by next_review_date,app_id limit 5) q),'[]'::jsonb),
    'riskQueue',coalesce((select jsonb_agg(to_jsonb(q)) from (select app_id id,title,verticals,owner_name owner,next_review_date "nextReviewDate",health_status "healthStatus",flag_count "flagCount",metadata_completeness_score "metadataCompletenessScore" from managed where health_status in ('Critical','At Risk') order by case health_status when 'Critical' then 0 else 1 end,flag_count desc,app_id limit 5) q),'[]'::jsonb)
  )
$$;

revoke all on function public.get_dashboard_snapshot_v2() from public, anon, authenticated;
grant execute on function public.get_dashboard_snapshot_v2() to service_role;

create or replace function public.delete_archived_accreditation(
  p_record_id uuid, p_expected_updated_at timestamptz, p_actor_id uuid, p_actor_email text
) returns boolean language plpgsql security definer set search_path = public as $$
declare previous public.accreditation_records%rowtype;
begin
  perform public.assert_actor_permission(p_actor_id,p_actor_email,'accreditation:manage');
  select * into previous from public.accreditation_records where id=p_record_id for update;
  if not found then raise exception 'Accreditation not found.' using errcode='P0002'; end if;
  if previous.updated_at is distinct from p_expected_updated_at then raise exception 'Accreditation changed since it was loaded.' using errcode='40001'; end if;
  if previous.archived_at is null then raise exception 'Only archived accreditation records can be deleted.' using errcode='22023'; end if;
  if previous.source_domain <> 'coursetrack' then raise exception 'LMS accreditation evidence cannot be deleted.' using errcode='42501'; end if;
  delete from public.accreditation_records where id=p_record_id;
  insert into public.audit_logs(actor_id,actor_email,action,record_type,record_id,previous_values,new_values,source,reason)
  values(p_actor_id,lower(trim(p_actor_email)),'accreditation.deleted','accreditation',p_record_id::text,to_jsonb(previous),null,'CourseTrack','Permanent deletion of an archived mistaken entry');
  return true;
end $$;

revoke all on function public.delete_archived_accreditation(uuid,timestamptz,uuid,text) from public, anon, authenticated;
grant execute on function public.delete_archived_accreditation(uuid,timestamptz,uuid,text) to service_role;

commit;
