-- Supports the search_course_library_v2 rewrite in 202608130002. CONCURRENTLY
-- cannot run inside a transaction block, so this migration is intentionally
-- left unwrapped (no begin/commit) and must stay that way.

-- concat_ws() is STABLE, not IMMUTABLE (its behavior can depend on locale
-- settings for non-text arguments), so Postgres refuses it in an index
-- expression. coalesce()/|| are IMMUTABLE for text, so use that instead --
-- this exact expression must also appear in search_course_library_v2's
-- WHERE clause (202608130002) for the planner to match the index.
create index concurrently if not exists courses_library_search_trgm_idx
  on public.courses using gin (
    (coalesce(title, '') || ' ' || coalesce(short_title, '') || ' ' || coalesce(course_code, '') || ' ' ||
     coalesce(lms_course_id, '') || ' ' || coalesce(description, '') || ' ' || coalesce(primary_topic, '') || ' ' ||
     coalesce(owner_name, '')) gin_trgm_ops
  )
  where archived_at is null;

create index concurrently if not exists tags_display_label_trgm_idx
  on public.tags using gin (display_label gin_trgm_ops);

create index concurrently if not exists topics_display_label_trgm_idx
  on public.topics using gin (display_label gin_trgm_ops);
