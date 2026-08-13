begin;

-- 202608130005 sorted with a multi-branch CASE expression (e.g.
-- `case when p_descending then c.title end desc, c.title asc, c.app_id asc`)
-- so a single static query body could support any of the 4 sort keys in
-- either direction. That CASE-derived sort key is not a plain column
-- reference, so Postgres can never match it to an index no matter what
-- indexes exist -- it always falls back to a full Sort node over the
-- entire `candidate` set (~18.5k rows for the default, barely-filtered
-- classification) before LIMIT/OFFSET applies. That's still expensive
-- even after 202608130005 deferred the per-row aggregates past
-- pagination, and text DESC sorts under a disk-spilled/near-work_mem sort
-- are measurably slower than ASC, which is why "sort by title descending"
-- specifically hit statement_timeout (57014) in production.
--
-- This migration keeps the exact same `candidate` -> `page` (sort +
-- count(*) over() + limit/offset) -> per-page-aggregate structure, but
-- switches the function to plpgsql and builds the ORDER BY clause
-- dynamically from an allow-listed column name + direction (never from
-- raw user input -- p_sort/p_descending are mapped through a fixed CASE
-- into `sort_column`/`sort_dir` before being interpolated via format()'s
-- %I/%s, which is the standard safe pattern for parameterizing identifiers
-- that can't be bound as query parameters). With a literal
-- `order by <col> <dir> nulls last, app_id asc` the planner can match the
-- btree indexes added in 202608130006-202608130010 and use an Index Scan
-- + Limit instead of sorting the whole candidate set.
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
) language plpgsql stable security definer set search_path = public as $$
declare
  sort_column text := case p_sort
    when 'courseCode' then 'course_code'
    when 'healthStatus' then 'health_status'
    when 'durationMinutes' then 'duration_minutes'
    else 'title'
  end;
  sort_dir text := case when p_descending then 'desc' else 'asc' end;
  order_clause text := format('order by %I %s nulls last, app_id asc', sort_column, sort_dir);
begin
  return query execute format($f$
    with candidate as (
      -- Every predicate here reads only public.courses (plus small EXISTS
      -- probes into the join tables), so filtering + sorting + pagination
      -- stays a single indexable scan and never depends on the per-row
      -- aggregates computed below.
      select c.*, jsonb_array_length(coalesce(c.import_validation_errors, '[]'::jsonb)) as validation_count
      from public.courses c
      where c.archived_at is null
        and (coalesce($3, '') in ('', 'All statuses') or c.lifecycle_status = $3)
        and (coalesce($4, '') in ('', 'All health levels') or c.health_status = $4)
        and (coalesce($5, '') in ('', 'All courses')
          or ($5 = 'Lexipol Managed' and c.management_classification = 'Lexipol managed')
          or ($5 = 'Unmanaged' and c.management_classification = 'Unclassified'))
        and (coalesce($6, '') <> 'Stale LMS data'
          or c.retrieval_status in ('Stale Data', 'Retrieval Failed'))
        and (coalesce($6, '') <> 'Invalid import records'
          or jsonb_array_length(coalesce(c.import_validation_errors, '[]'::jsonb)) > 0)
        and (coalesce($6, '') <> 'Field conflicts' or exists (
              select 1 from public.field_comparisons f
              where f.course_id = c.id and f.alignment_status in ('Pending LMS update', 'Mapping required')))
        and (coalesce($6, '') <> 'Missing Content Metadata' or (
              exists (select 1 from public.lms_snapshots s where s.course_id = c.id and s.is_current)
              and not exists (select 1 from public.content_metadata_records m
                    where m.course_id = c.id and m.is_current and m.is_importable)))
        and (coalesce($7, '') in ('', 'All LMS links')
          or ($7 = 'linked' and exists (select 1 from public.lms_snapshots s where s.course_id = c.id and s.is_current))
          or ($7 = 'not_linked' and not exists (select 1 from public.lms_snapshots s where s.course_id = c.id and s.is_current)))
        and (coalesce($2, '') in ('', 'All verticals')
          or ($2 = 'No vertical' and not exists (
                select 1 from public.course_verticals cv join public.verticals v on v.id = cv.vertical_id
                where cv.course_id = c.id and v.active and lower(v.slug) <> 'unclassified'))
          or exists (
                select 1 from public.course_verticals cv join public.verticals v on v.id = cv.vertical_id
                where cv.course_id = c.id and v.active
                  and case lower(v.slug)
                    when 'p1a' then 'P1A' when 'fr1a' then 'FR1A' when 'c1a' then 'C1A'
                    when 'ems1' then 'EMS1' when 'd1a' then 'D1A' when 'lgu' then 'LGU'
                    when 'lexipol' then 'Lexipol' when 'wellness' then 'Wellness' end = $2))
        and (coalesce(trim($1), '') = '' or (
          (coalesce(c.title, '') || ' ' || coalesce(c.short_title, '') || ' ' || coalesce(c.course_code, '') || ' ' ||
           coalesce(c.lms_course_id, '') || ' ' || coalesce(c.description, '') || ' ' || coalesce(c.primary_topic, '') || ' ' ||
           coalesce(c.owner_name, ''))
            ilike '%%' || trim($1) || '%%'
          or exists (
                select 1 from public.course_tags ct join public.tags t on t.id = ct.tag_id
                where ct.course_id = c.id and t.display_label ilike '%%' || trim($1) || '%%')
          or exists (
                select 1 from public.course_topics ct join public.topics t on t.id = ct.topic_id
                where ct.course_id = c.id and t.display_label ilike '%%' || trim($1) || '%%')
        ))
    ), page as (
      -- Sorting, total_count, and pagination happen here, over `candidate`
      -- alone -- no per-row aggregates yet, so this scales with the number
      -- of matching rows, not with an extra 7x join-table fan-out per row.
      select c.*, count(*) over() as total_count
      from candidate c
      %s
      limit least(greatest($8, 1), 200) offset greatest($9, 0)
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
    %s
  $f$, order_clause, order_clause)
  using p_search, p_vertical, p_lifecycle, p_health, p_classification, p_work_queue, p_lms_link, p_limit, p_offset;
end;
$$;

revoke all on function public.search_course_library_v2(text,text,text,text,text,text,text,text,boolean,integer,integer) from public, anon, authenticated;
grant execute on function public.search_course_library_v2(text,text,text,text,text,text,text,text,boolean,integer,integer) to service_role;

commit;
