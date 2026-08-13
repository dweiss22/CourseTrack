-- Supports the search_course_library_v2 rewrite in 202608130004. CONCURRENTLY
-- cannot run inside a transaction block or alongside other statements in the
-- same pipelined migration, so each CONCURRENTLY index gets its own file with
-- exactly one statement and no begin/commit -- keep it that way.
--
-- concat_ws() is STABLE, not IMMUTABLE (its behavior can depend on locale
-- settings for non-text arguments), so Postgres refuses it in an index
-- expression. coalesce()/|| are IMMUTABLE for text, so use that instead --
-- this exact expression must also appear in search_course_library_v2's
-- WHERE clause for the planner to match the index.
create index concurrently if not exists courses_library_search_trgm_idx
  on public.courses using gin (
    (coalesce(title, '') || ' ' || coalesce(short_title, '') || ' ' || coalesce(course_code, '') || ' ' ||
     coalesce(lms_course_id, '') || ' ' || coalesce(description, '') || ' ' || coalesce(primary_topic, '') || ' ' ||
     coalesce(owner_name, '')) gin_trgm_ops
  )
  where archived_at is null;
