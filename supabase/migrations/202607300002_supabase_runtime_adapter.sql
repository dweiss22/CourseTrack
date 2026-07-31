begin;

alter table public.courses
  add column if not exists app_id text,
  add column if not exists owner_name text,
  add column if not exists instructional_designer_name text,
  add column if not exists source_payload jsonb not null default '{}';

create unique index if not exists courses_app_id_idx
  on public.courses(app_id)
  where app_id is not null;

alter table public.lms_retrieval_runs
  add column if not exists external_run_id text,
  add column if not exists initiated_by_email text;

create unique index if not exists retrieval_runs_external_id_idx
  on public.lms_retrieval_runs(external_run_id)
  where external_run_id is not null;

create or replace function public.update_internal_course_metadata(
  p_app_id text,
  p_actor_email text,
  p_internal_summary text,
  p_owner_name text,
  p_next_review_date date
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  previous_values jsonb;
  changed_rows integer;
begin
  select jsonb_build_object(
    'internalSummary', c.internal_summary,
    'owner', c.owner_name,
    'nextReviewDate', c.next_review_date
  )
  into previous_values
  from public.courses c
  where c.app_id = p_app_id
  for update;

  if previous_values is null then
    return false;
  end if;

  update public.courses
  set
    internal_summary = p_internal_summary,
    owner_name = p_owner_name,
    next_review_date = p_next_review_date,
    updated_at = now()
  where app_id = p_app_id;

  get diagnostics changed_rows = row_count;
  if changed_rows = 0 then
    return false;
  end if;

  insert into public.audit_logs (
    actor_email,
    action,
    record_type,
    record_id,
    previous_values,
    new_values,
    source,
    reason
  )
  values (
    p_actor_email,
    'course.internal_metadata_updated',
    'course',
    p_app_id,
    previous_values,
    jsonb_build_object(
      'internalSummary', p_internal_summary,
      'owner', p_owner_name,
      'nextReviewDate', p_next_review_date
    ),
    'CourseTrack',
    'Internal metadata edit through the server-side Supabase adapter'
  );

  return true;
end;
$$;

revoke all on function public.update_internal_course_metadata(
  text,
  text,
  text,
  text,
  date
) from public, anon, authenticated;

grant execute on function public.update_internal_course_metadata(
  text,
  text,
  text,
  text,
  date
) to service_role;

commit;
