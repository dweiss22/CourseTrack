begin;

-- Management classification has two authoritative sources: a current,
-- importable Content Metadata record or an explicit CourseTrack assignment.
-- LMS sites and LMS-owned flags are availability/source evidence only.
with authority as (
  select
    course.id,
    exists (
      select 1
      from public.content_metadata_records metadata
      where metadata.course_id = course.id
        and metadata.is_current = true
        and metadata.is_importable = true
    ) as has_metadata,
    course.management_classification as previous_classification,
    coalesce(course.field_provenance, '{}'::jsonb) as previous_provenance
  from public.courses course
)
update public.courses course
set
  management_classification = case
    when authority.has_metadata then 'Lexipol managed'
    when authority.previous_classification = 'Lexipol managed'
      and authority.previous_provenance->>'managementClassification' = 'coursetrack'
      then 'Lexipol managed'
    else 'Unclassified'
  end,
  field_provenance = case
    when authority.previous_provenance->>'managementClassification' = 'coursetrack'
      and (
        authority.previous_classification not in ('Lexipol managed', 'Unclassified')
        or (authority.has_metadata and authority.previous_classification <> 'Lexipol managed')
      )
      then authority.previous_provenance - 'managementClassification'
    else authority.previous_provenance
  end
from authority
where course.id = authority.id;

-- Retire the old four-state model everywhere it could be persisted.
update public.monitoring_classifications
set classification = 'Unclassified', updated_at = now()
where classification not in ('Lexipol managed', 'Unclassified');

alter table public.courses drop constraint if exists courses_management_classification_check;
alter table public.courses add constraint courses_management_classification_check
  check (management_classification in ('Lexipol managed', 'Unclassified'));

alter table public.monitoring_classifications
  drop constraint if exists monitoring_classifications_classification_check;
alter table public.monitoring_classifications
  add constraint monitoring_classifications_classification_check
  check (classification in ('Lexipol managed', 'Unclassified'));

-- LMS-only projections previously persisted site availability as course
-- vertical membership. Keep app-owned edits, but reset untouched LMS-derived
-- membership to Unclassified and remove its secondary assignments.
with unclassified_vertical as (
  select id from public.verticals where lower(slug) = 'unclassified' limit 1
)
update public.courses course
set primary_vertical_id = unclassified_vertical.id
from unclassified_vertical
where course.projection_origin = 'lms_export'
  and coalesce(course.field_provenance->>'primaryVertical', '') <> 'coursetrack'
  and not exists (
    select 1 from public.content_metadata_records metadata
    where metadata.course_id = course.id
      and metadata.is_current = true
      and metadata.is_importable = true
  );

delete from public.course_verticals assignment
using public.courses course
where assignment.course_id = course.id
  and assignment.relationship_type = 'secondary'
  and course.projection_origin = 'lms_export'
  and coalesce(course.field_provenance->>'secondaryVerticals', '') <> 'coursetrack'
  and not exists (
    select 1 from public.content_metadata_records metadata
    where metadata.course_id = course.id
      and metadata.is_current = true
      and metadata.is_importable = true
  );

create or replace function public.refresh_course_management_classification(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  has_metadata boolean;
  current_classification text;
  current_provenance jsonb;
begin
  if p_course_id is null then return; end if;

  select
    course.management_classification,
    coalesce(course.field_provenance, '{}'::jsonb),
    exists (
      select 1 from public.content_metadata_records metadata
      where metadata.course_id = course.id
        and metadata.is_current = true
        and metadata.is_importable = true
    )
  into current_classification, current_provenance, has_metadata
  from public.courses course
  where course.id = p_course_id
  for update;

  if not found then return; end if;

  if has_metadata then
    update public.courses
    set
      management_classification = 'Lexipol managed',
      field_provenance = case
        when current_classification <> 'Lexipol managed'
          and current_provenance->>'managementClassification' = 'coursetrack'
          then current_provenance - 'managementClassification'
        else current_provenance
      end
    where id = p_course_id;
  else
    update public.courses
    set management_classification = case
      when current_classification = 'Lexipol managed'
        and current_provenance->>'managementClassification' = 'coursetrack'
        then 'Lexipol managed'
      else 'Unclassified'
    end
    where id = p_course_id;
  end if;
end;
$$;

revoke all on function public.refresh_course_management_classification(uuid) from public, anon, authenticated;
grant execute on function public.refresh_course_management_classification(uuid) to service_role;

create or replace function public.enforce_course_management_classification()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_metadata boolean;
begin
  select exists (
    select 1 from public.content_metadata_records metadata
    where metadata.course_id = new.id
      and metadata.is_current = true
      and metadata.is_importable = true
  ) into has_metadata;

  if has_metadata then
    if new.management_classification <> 'Lexipol managed'
      and coalesce(new.field_provenance->>'managementClassification', '') = 'coursetrack'
    then
      new.field_provenance := coalesce(new.field_provenance, '{}'::jsonb) - 'managementClassification';
    end if;
    new.management_classification := 'Lexipol managed';
  elsif new.management_classification = 'Lexipol managed'
    and coalesce(new.field_provenance->>'managementClassification', '') <> 'coursetrack'
  then
    new.management_classification := 'Unclassified';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_course_management_classification on public.courses;
create trigger enforce_course_management_classification
before insert or update of management_classification, field_provenance
on public.courses
for each row execute function public.enforce_course_management_classification();

create or replace function public.sync_course_management_from_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_course_management_classification(old.course_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.course_id is distinct from new.course_id then
    perform public.refresh_course_management_classification(old.course_id);
  end if;
  perform public.refresh_course_management_classification(new.course_id);
  return new;
end;
$$;

drop trigger if exists sync_course_management_from_metadata on public.content_metadata_records;
create trigger sync_course_management_from_metadata
after insert or delete or update of course_id, is_current, is_importable
on public.content_metadata_records
for each row execute function public.sync_course_management_from_metadata();

create or replace function public.search_course_library(
  p_search text default '', p_vertical text default '', p_lifecycle text default '', p_health text default '',
  p_classification text default 'All courses', p_work_queue text default '', p_sort text default 'title',
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
      exists(select 1 from public.content_metadata_records m where m.course_id = c.id and m.is_current and m.is_importable) as has_metadata,
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
      and (
        coalesce(p_classification, '') in ('', 'All courses')
        or (p_classification = 'Lexipol Managed' and b.management_classification = 'Lexipol managed')
        or (p_classification = 'Unclassified' and b.management_classification = 'Unclassified')
      )
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
      exists(select 1 from public.content_metadata_records m where m.course_id = c.id and m.is_current and m.is_importable) as has_metadata,
      (select count(*) from public.field_comparisons f where f.course_id = c.id and f.alignment_status in ('Pending LMS update', 'Mapping required')) as conflict_count,
      (select count(*) from public.course_flags f where f.course_id = c.id and f.archived_at is null) as flag_count
    from public.courses c join public.verticals v on v.id = c.primary_vertical_id
    where c.archived_at is null
  ), filtered as (
    select * from base where coalesce(trim(p_vertical), '') in ('', 'All verticals') or primary_vertical = p_vertical
  ), vertical_values(primary_vertical) as (
    values ('P1A'), ('FR1A'), ('C1A'), ('EMS1'), ('D1A'), ('LGU'), ('Lexipol'), ('Wellness'), ('Unclassified')
  ), health_values(health_status) as (
    values ('Healthy'), ('Monitor'), ('Needs Review'), ('At Risk'), ('Critical')
  )
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalLmsRetrieved', (select count(*) from base where has_lms),
      'lexipolManaged', (select count(*) from base where management_classification = 'Lexipol managed'),
      'unclassified', (select count(*) from base where management_classification = 'Unclassified'),
      'missingContentMetadata', (select count(*) from base where has_lms and not has_metadata),
      'missingFromLms', (select count(*) from base where not has_lms and has_metadata),
      'unresolvedConflicts', (select count(*) from base where conflict_count > 0),
      'mappingRequired', (select count(*) from base where reconciliation_status = 'Mapping required'),
      'staleLms', (select count(*) from base where retrieval_status in ('Stale Data', 'Retrieval Failed')),
      'importValidationErrors', (select coalesce(sum(validation_count), 0) from base)
    ),
    'coursesInView', (select count(*) from filtered),
    'verticalData', (select jsonb_agg(jsonb_build_object('name', vv.primary_vertical, 'courses', (select count(*) from base b where b.primary_vertical = vv.primary_vertical)) order by array_position(array['P1A','FR1A','C1A','EMS1','D1A','LGU','Lexipol','Wellness','Unclassified'], vv.primary_vertical)) from vertical_values vv),
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
