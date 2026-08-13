begin;

-- search_course_library_v2 (202608120003) computed 7+ correlated subqueries per
-- course row (verticals, lms/metadata existence, flag/comparison counts, tag and
-- topic aggregation) before any filtering was applied, then matched free text
-- against a concat_ws() of columns and already-materialized arrays that no index
-- could cover. On the production courses table this exceeded statement_timeout
-- (57014) on every Library page load. This migration pushes all pushdownable
-- filters (classification, lifecycle, health, vertical membership, stale
-- retrieval status, and free-text search against the course's own columns and
-- its tags/topics) into a `candidate` CTE that reads directly from
-- public.courses and its join tables, so the expensive per-row subqueries in
-- `base` only run over the rows that can actually match -- not the whole table.
-- Trigram indexes it relies on are created in 202608130001 (which must run
-- first and cannot be wrapped in a transaction).

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
    -- All predicates here read only public.courses (plus small EXISTS probes
    -- into the join tables) so this stays a single indexable scan instead of
    -- fanning out into per-row aggregate subqueries.
    select c.*
    from public.courses c
    where c.archived_at is null
      and (coalesce(p_lifecycle, '') in ('', 'All statuses') or c.lifecycle_status = p_lifecycle)
      and (coalesce(p_health, '') in ('', 'All health levels') or c.health_status = p_health)
      and (coalesce(p_classification, '') in ('', 'All courses')
        or (p_classification = 'Lexipol Managed' and c.management_classification = 'Lexipol managed')
        or (p_classification = 'Unmanaged' and c.management_classification = 'Unclassified'))
      and (coalesce(p_work_queue, '') <> 'Stale LMS data'
        or c.retrieval_status in ('Stale Data', 'Retrieval Failed'))
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
        concat_ws(' ', c.title, c.short_title, c.course_code, c.lms_course_id, c.description, c.primary_topic, c.owner_name)
          ilike '%' || trim(p_search) || '%'
        or exists (
              select 1 from public.course_tags ct join public.tags t on t.id = ct.tag_id
              where ct.course_id = c.id and t.display_label ilike '%' || trim(p_search) || '%')
        or exists (
              select 1 from public.course_topics ct join public.topics t on t.id = ct.topic_id
              where ct.course_id = c.id and t.display_label ilike '%' || trim(p_search) || '%')
      ))
  ), base as (
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
    from candidate c
  ), filtered as (
    select * from base b where
      (coalesce(p_lms_link, '') in ('', 'All LMS links')
        or (p_lms_link = 'linked' and b.has_lms)
        or (p_lms_link = 'not_linked' and not b.has_lms))
      and (coalesce(p_work_queue, '') in ('', 'All queues', 'Stale LMS data')
        or (p_work_queue = 'Missing Content Metadata' and b.has_lms and not b.has_metadata)
        or (p_work_queue = 'Field conflicts' and b.differences > 0)
        or (p_work_queue = 'Invalid import records' and b.validation_count > 0))
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

commit;
