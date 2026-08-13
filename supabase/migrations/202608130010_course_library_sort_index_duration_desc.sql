-- See 202608130009 for why this direction needs its own index.
create index concurrently if not exists courses_library_sort_duration_desc_idx
  on public.courses (duration_minutes desc nulls last, app_id)
  where archived_at is null;
