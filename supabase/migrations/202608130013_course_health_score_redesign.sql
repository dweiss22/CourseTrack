begin;

-- Mirror the redesigned health scoring model (lib/health.ts) in the
-- persisted courses.health_score/health_status cache so every screen that
-- reads the cached columns directly (portfolio/dashboard fallbacks) agrees
-- with the on-demand TypeScript recomputation used by course detail and
-- the Course Library RPC.
--
-- The signature of course_health_score changes (import-error and
-- lms-snapshot inputs are gone; a next-review-date input is added), so the
-- old overload must be dropped explicitly -- Postgres does not let
-- CREATE OR REPLACE change a function's argument list in place.
drop function if exists public.course_health_score(numeric, integer, integer, boolean);

-- Graduated next-review-cycle penalty (0-100), matching
-- lib/health.ts#reviewCyclePenalty: 0 a year or more before the next
-- review date, a modest deduction right at the due date, accelerating
-- after the date passes, saturating at 100 (health forced to 0) once the
-- course is 3+ years (1095 days) overdue.
create or replace function public.course_review_cycle_penalty(
  p_next_review_date date,
  p_as_of date default current_date
)
returns integer language sql stable as $$
  select case
    when p_next_review_date is null then 0
    when (p_next_review_date - p_as_of) >= 365 then 0
    when (p_as_of - p_next_review_date) >= 1095 then 100
    when p_next_review_date >= p_as_of then
      round(8 * power(1 - (p_next_review_date - p_as_of)::numeric / 365, 3))::integer
    else
      round(8 + (100 - 8) * power((p_as_of - p_next_review_date)::numeric / 1095, 1.6))::integer
  end;
$$;

create or replace function public.course_health_score(
  p_metadata_completeness numeric,
  p_unresolved_conflicts integer,
  p_next_review_date date,
  p_as_of date default current_date
)
returns integer language sql stable as $$
  select greatest(0, least(100,
    100
    - round((100 - greatest(0, least(100, coalesce(round(p_metadata_completeness)::integer, 0)))) * 0.15)
    - 10 * greatest(coalesce(p_unresolved_conflicts, 0), 0)
    - public.course_review_cycle_penalty(p_next_review_date, p_as_of)
  ));
$$;

create or replace function public.set_course_health_cache()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  score integer;
begin
  score := public.course_health_score(
    new.metadata_completeness_score,
    (select count(*)::integer from public.field_comparisons where course_id = new.id and comparison_status = 'Conflict' and selected_source is null),
    new.next_review_date
  );
  new.health_score := score;
  new.health_status := public.course_health_level(score);
  return new;
end;
$$;

-- Recompute on next_review_date changes too, not just metadata/import edits.
drop trigger if exists courses_health_cache on public.courses;
create trigger courses_health_cache before insert or update of metadata_completeness_score, next_review_date on public.courses
for each row execute function public.set_course_health_cache();

-- Backfill every existing row through the new formula immediately.
update public.courses set metadata_completeness_score = metadata_completeness_score;

commit;
