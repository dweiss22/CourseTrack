-- See 202608130006 -- CONCURRENTLY requires its own migration file with a
-- single statement and no begin/commit.
create index concurrently if not exists courses_library_sort_course_code_idx
  on public.courses (course_code, app_id)
  where archived_at is null;
