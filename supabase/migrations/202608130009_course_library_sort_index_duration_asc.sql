-- See 202608130006 -- CONCURRENTLY requires its own migration file with a
-- single statement and no begin/commit.
--
-- duration_minutes is nullable and the UI always wants nulls sorted last
-- regardless of direction, so a single ascending index can't be backward-
-- scanned to serve the descending case (backward-scanning an "asc nulls
-- last" index yields "desc nulls first", not "desc nulls last") -- hence a
-- separate index per direction (this one, plus 202608130010).
create index concurrently if not exists courses_library_sort_duration_asc_idx
  on public.courses (duration_minutes asc nulls last, app_id)
  where archived_at is null;
