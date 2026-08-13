-- See 202608130001 -- CONCURRENTLY requires its own migration file with a
-- single statement and no begin/commit.
create index concurrently if not exists topics_display_label_trgm_idx
  on public.topics using gin (display_label gin_trgm_ops);
