begin;

-- 202608130004 pushed simple filters into `candidate` but still ran all 7
-- correlated per-row subqueries (vertical membership, LMS/metadata
-- existence, flag/comparison counts, tag/topic aggregation) for every
-- candidate row before sorting/paginating. With ~18.5k rows in production
-- and the default classification filter matching nearly all of them, that
-- is still tens of thousands of subplan executions per request and kept
-- exceeding statement_timeout (57014) even with the right indexes in place.
--
-- This migration pushes the remaining filters (LMS link status, work queue)
-- into `candidate` as well -- via EXISTS probes or, for the import-error
-- work queue, a direct check against courses.import_validation_errors --
-- so nothing left in `filtered` depends on the expensive per-row
-- aggregates. That lets sorting, `count(*) over()`, and LIMIT/OFFSET happen
-- on the cheap, indexed `candidate` set, and the 7 correlated subqueries
-- only run for the at-most-200 rows actually being returned on this page.
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
  with candidate as (
    -- Every predicate here reads only public.courses (plus small EXISTS
    -- probes into the join tables), so filtering + sorting + pagination
    -- stays a single indexable scan and never depends on the per-row
    -- aggregates computed below.
    select c.*, jsonb_array_length(coalesce(c.import_validation_errors, '[]'::jsonb)) as validation_count
    from public.courses c
    where c.archived_at is null
      and (coalesce(p_lifecycle, '') in ('', 'All statuses') or c.lifecycle_status = p_lifecycle)
      and (coalesce(p_health, '') in ('', 'All health levels') or c.health_status = p_health)
      and (coalesce(p_classification, '') in ('', 'All courses')
        or (p_classification = 'Lexipol Managed' and c.management_classification = 'Lexipol managed')
        or (p_classification = 'Unmanaged' and c.management_classification = 'Unclassified'))
      and (coalesce(p_work_queue, '') <> 'Stale LMS data'
        or c.retrieval_status in ('Stale Data', 'Retrieval Failed'))
      and (coalesce(p_work_queue, '') <> 'Invalid import records'
        or jsonb_array_length(coalesce(c.import_validation_errors, '[]'::jsonb)) > 0)
      and (coalesce(p_work_queue, '') <> 'Field conflicts' or exists (
            select 1 from public.field_comparisons f
            where f.course_id = c.id and f.alignment_status in ('Pending LMS update', 'Mapping required')))
      and (coalesce(p_work_queue, '') <> 'Missing Content Metadata' or (
            exists (select 1 from public.lms_snapshots s where s.course_id = c.id and s.is_current)
            and not exists (select 1 from public.content_metadata_records m
                  where m.course_id = c.id and m.is_current and m.is_importable)))
      and (coalesce(p_lms_link, '') in ('', 'All LMS links')
        or (p_lms_link = 'linked' and exists (select 1 from public.lms_snapshots s where s.course_id = c.id and s.is_current))
        or (p_lms_link = 'not_linked' and not exists (select 1 from public.lms_snapshots s where s.course_id = c.id and s.is_current)))
      and (coalesce(p_vertical, '') in ('', 'All verticals')
        or (p_vertical = 'No vertical' and not exists (
              select 1 from public.course_verticals cv join public.verticals v on v.id = cv.vertical_id
              where cv.course_id = c.id and v.active and lower(v.slug) <> 'unclassified'))
        or exists (
              select 1 from public.course_verticals cv join public.verticals v on v.id = cv.vertical_id
              where cv.course_id = c.id and v.active
                and case lower(v.slug)
                  when 'p1a' then 'P1A' when 'fr1a' then 'FR1A' when 'c1a' then 'C1A'
                  when 'ems1' then 'EMS1' when 'd1a' then 'D1A' when 'lgu' then 'LGU'
                  when 'lexipol' then 'Lexipol' when 'wellness' then 'Wellness' end = p_vertical))
      and (coalesce(trim(p_search), '') = '' or (
        (coalesce(c.title, '') || ' ' || coalesce(c.short_title, '') || ' ' || coalesce(c.course_code, '') || ' ' ||
         coalesce(c.lms_course_id, '') || ' ' || coalesce(c.description, '') || ' ' || coalesce(c.primary_topic, '') || ' ' ||
         coalesce(c.owner_name, ''))
          ilike '%' || trim(p_search) || '%'
        or exists (
              select 1 from public.course_tags ct join public.tags t on t.id = ct.tag_id
              where ct.course_id = c.id and t.display_label ilike '%' || trim(p_search) || '%')
        or exists (
              select 1 from public.course_topics ct join public.topics t on t.id = ct.topic_id
              where ct.course_id = c.id and t.display_label ilike '%' || trim(p_search) || '%')
      ))
  ), page as (
    -- Sorting, total_count, and pagination happen here, over `candidate`
    -- alone -- no per-row aggregates yet, so this scales with the number of
    -- matching rows, not with an extra 7x join-table fan-out per row.
    select c.*, count(*) over() as total_count
    from candidate c
    order by
      case when not p_descending and p_sort = 'durationMinutes' then c.duration_minutes end asc nulls last,
      case when p_descending and p_sort = 'durationMinutes' then c.duration_minutes end desc nulls last,
      case when not p_descending and p_sort = 'courseCode' then c.course_code end asc,
      case when p_descending and p_sort = 'courseCode' then c.course_code end desc,
      case when not p_descending and p_sort = 'healthStatus' then c.health_status end asc,
      case when p_descending and p_sort = 'healthStatus' then c.health_status end desc,
      case when p_descending then c.title end desc,
      c.title asc, c.app_id asc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  )
  -- The expensive per-row aggregates now run only for this page (at most
  -- 200 rows), regardless of how many rows matched the filters overall.
  select p.app_id, p.title, p.short_title, p.course_code, p.lms_course_id, p.description,
    coalesce((select array_agg(case lower(v.slug)
      when 'p1a' then 'P1A' when 'fr1a' then 'FR1A' when 'c1a' then 'C1A'
      when 'ems1' then 'EMS1' when 'd1a' then 'D1A' when 'lgu' then 'LGU'
      when 'lexipol' then 'Lexipol' when 'wellness' then 'Wellness' end order by v.sort_order, v.id)
      from public.course_verticals cv join public.verticals v on v.id = cv.vertical_id
      where cv.course_id = p.id and v.active and lower(v.slug) <> 'unclassified'), '{}'::text[]),
    p.management_classification,
    case when exists(select 1 from public.lms_snapshots s where s.course_id = p.id and s.is_current) then 'linked' else 'not_linked' end,
    p.retrieval_status, p.last_retrieved_at, p.health_status, p.lifecycle_status, p.primary_topic,
    p.owner_name, p.duration_minutes, p.data_source, p.next_review_date, p.metadata_completeness_score,
    p.source_difference_count,
    (select count(*) from public.field_comparisons f where f.course_id = p.id and f.alignment_status in ('Pending LMS update', 'Mapping required')),
    (select count(*) from public.course_flags f where f.course_id = p.id and f.archived_at is null),
    exists(select 1 from public.lms_snapshots s where s.course_id = p.id and s.is_current),
    exists(select 1 from public.content_metadata_records m where m.course_id = p.id and m.is_current and m.is_importable),
    p.validation_count,
    coalesce((select array_agg(distinct t.display_label order by t.display_label) from public.course_tags ct join public.tags t on t.id = ct.tag_id where ct.course_id = p.id), '{}'::text[]),
    coalesce((select array_agg(distinct t.display_label order by t.display_label) from public.course_topics ct join public.topics t on t.id = ct.topic_id where ct.course_id = p.id), '{}'::text[]),
    p.total_count
  from page p
  order by
    case when not p_descending and p_sort = 'durationMinutes' then p.duration_minutes end asc nulls last,
    case when p_descending and p_sort = 'durationMinutes' then p.duration_minutes end desc nulls last,
    case when not p_descending and p_sort = 'courseCode' then p.course_code end asc,
    case when p_descending and p_sort = 'courseCode' then p.course_code end desc,
    case when not p_descending and p_sort = 'healthStatus' then p.health_status end asc,
    case when p_descending and p_sort = 'healthStatus' then p.health_status end desc,
    case when p_descending then p.title end desc,
    p.title asc, p.app_id asc
$$;

revoke all on function public.search_course_library_v2(text,text,text,text,text,text,text,text,boolean,integer,integer) from public, anon, authenticated;
grant execute on function public.search_course_library_v2(text,text,text,text,text,text,text,text,boolean,integer,integer) to service_role;

commit;
