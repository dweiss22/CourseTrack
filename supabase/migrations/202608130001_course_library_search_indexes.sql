-- Supports the search_course_library_v2 rewrite in 202608130002. CONCURRENTLY
-- cannot run inside a transaction block, so this migration is intentionally
-- left unwrapped (no begin/commit) and must stay that way.

create index concurrently if not exists courses_library_search_trgm_idx
  on public.courses using gin (
    concat_ws(' ', title, short_title, course_code, lms_course_id, description, primary_topic, owner_name) gin_trgm_ops
  )
  where archived_at is null;

create index concurrently if not exists tags_display_label_trgm_idx
  on public.tags using gin (display_label gin_trgm_ops);

create index concurrently if not exists topics_display_label_trgm_idx
  on public.topics using gin (display_label gin_trgm_ops);
