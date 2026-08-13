-- See 202608130001 -- CONCURRENTLY requires its own migration file with a
-- single statement and no begin/commit.
create index concurrently if not exists tags_display_label_trgm_idx
  on public.tags using gin (display_label gin_trgm_ops);
