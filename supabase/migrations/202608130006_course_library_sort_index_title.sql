-- Supports the dynamic-sort rewrite of search_course_library_v2 in
-- 202608130011. CONCURRENTLY requires its own migration file with a single
-- statement and no begin/commit -- keep it that way.
create index concurrently if not exists courses_library_sort_title_idx
  on public.courses (title, app_id)
  where archived_at is null;
