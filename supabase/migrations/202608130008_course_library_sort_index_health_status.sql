-- See 202608130006 -- CONCURRENTLY requires its own migration file with a
-- single statement and no begin/commit.
create index concurrently if not exists courses_library_sort_health_status_idx
  on public.courses (health_status, app_id)
  where archived_at is null;
