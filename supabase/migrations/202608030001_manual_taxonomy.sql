begin;

alter table public.course_topics
  drop constraint if exists course_topics_assignment_source_check;
alter table public.course_topics
  add constraint course_topics_assignment_source_check check (
    assignment_source in ('LMS Public Topic', 'LMS Private Topic', 'Topics import', 'Manual')
  );

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  normalized_label text not null unique,
  display_label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.course_tags (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references public.tags(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  assignment_source text not null default 'Manual' check (assignment_source in ('Manual')),
  created_at timestamptz not null default now(),
  unique (tag_id, course_id)
);

create index if not exists tags_label_trgm_idx
  on public.tags using gin (display_label gin_trgm_ops);
create index if not exists course_tags_course_idx
  on public.course_tags(course_id);

-- Backfill the existing flat courses.tags array into the new tag catalog so no
-- manually-entered tag data is lost. courses.tags itself is left in place but is
-- no longer read by the application after this migration.
insert into public.tags (normalized_label, display_label)
select distinct lower(trim(tag)), trim(tag)
from public.courses, unnest(tags) as tag
where trim(tag) <> ''
on conflict (normalized_label) do nothing;

insert into public.course_tags (tag_id, course_id, assignment_source)
select t.id, c.id, 'Manual'
from public.courses c, unnest(c.tags) as tag
join public.tags t on t.normalized_label = lower(trim(tag))
where trim(tag) <> ''
on conflict (tag_id, course_id) do nothing;

alter table public.tags enable row level security;
alter table public.course_tags enable row level security;

drop policy if exists tags_read on public.tags;
create policy tags_read on public.tags
for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists course_tags_read on public.course_tags;
create policy course_tags_read on public.course_tags
for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists tags_write on public.tags;
create policy tags_write on public.tags
for all to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));
drop policy if exists course_tags_write on public.course_tags;
create policy course_tags_write on public.course_tags
for all to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));

create or replace function public.assign_course_topic(
  p_app_id text,
  p_topic_label text,
  p_actor_email text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_course_id uuid;
  target_topic_id uuid;
  normalized text := lower(trim(p_topic_label));
begin
  if normalized = '' then
    return false;
  end if;

  select id into target_course_id from public.courses where app_id = p_app_id;
  if target_course_id is null then
    return false;
  end if;

  insert into public.topics (normalized_label, display_label, original_label)
  values (normalized, trim(p_topic_label), trim(p_topic_label))
  on conflict (normalized_label) do update set display_label = excluded.display_label
  returning id into target_topic_id;

  insert into public.course_topics (topic_id, course_id, external_course_id, assignment_source)
  select target_topic_id, target_course_id, p_app_id, 'Manual'
  where not exists (
    select 1 from public.course_topics
    where topic_id = target_topic_id and course_id = target_course_id
  );

  insert into public.audit_logs (actor_email, action, record_type, record_id, new_values, source)
  values (p_actor_email, 'course.topic_assigned', 'course_topic', p_app_id, jsonb_build_object('topic', trim(p_topic_label)), 'CourseTrack');

  return true;
end;
$$;

create or replace function public.remove_course_topic(
  p_course_topic_id uuid,
  p_actor_email text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  removed_course_id text;
begin
  delete from public.course_topics
  where id = p_course_topic_id and assignment_source = 'Manual'
  returning external_course_id into removed_course_id;

  if removed_course_id is null then
    return false;
  end if;

  insert into public.audit_logs (actor_email, action, record_type, record_id, source)
  values (p_actor_email, 'course.topic_removed', 'course_topic', removed_course_id, 'CourseTrack');

  return true;
end;
$$;

create or replace function public.assign_topic_to_courses(
  p_topic_label text,
  p_app_ids text[],
  p_actor_email text
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  app_id text;
  assigned_count integer := 0;
begin
  foreach app_id in array p_app_ids loop
    if public.assign_course_topic(app_id, p_topic_label, p_actor_email) then
      assigned_count := assigned_count + 1;
    end if;
  end loop;
  return assigned_count;
end;
$$;

create or replace function public.assign_course_tag(
  p_app_id text,
  p_tag_label text,
  p_actor_email text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_course_id uuid;
  target_tag_id uuid;
  normalized text := lower(trim(p_tag_label));
begin
  if normalized = '' then
    return false;
  end if;

  select id into target_course_id from public.courses where app_id = p_app_id;
  if target_course_id is null then
    return false;
  end if;

  insert into public.tags (normalized_label, display_label)
  values (normalized, trim(p_tag_label))
  on conflict (normalized_label) do update set display_label = excluded.display_label
  returning id into target_tag_id;

  insert into public.course_tags (tag_id, course_id, assignment_source)
  values (target_tag_id, target_course_id, 'Manual')
  on conflict (tag_id, course_id) do nothing;

  insert into public.audit_logs (actor_email, action, record_type, record_id, new_values, source)
  values (p_actor_email, 'course.tag_assigned', 'course_tag', p_app_id, jsonb_build_object('tag', trim(p_tag_label)), 'CourseTrack');

  return true;
end;
$$;

create or replace function public.remove_course_tag(
  p_course_tag_id uuid,
  p_actor_email text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  removed_course_id uuid;
  removed_app_id text;
begin
  delete from public.course_tags
  where id = p_course_tag_id
  returning course_id into removed_course_id;

  if removed_course_id is null then
    return false;
  end if;

  select app_id into removed_app_id from public.courses where id = removed_course_id;

  insert into public.audit_logs (actor_email, action, record_type, record_id, source)
  values (p_actor_email, 'course.tag_removed', 'course_tag', coalesce(removed_app_id, removed_course_id::text), 'CourseTrack');

  return true;
end;
$$;

create or replace function public.assign_tag_to_courses(
  p_tag_label text,
  p_app_ids text[],
  p_actor_email text
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  app_id text;
  assigned_count integer := 0;
begin
  foreach app_id in array p_app_ids loop
    if public.assign_course_tag(app_id, p_tag_label, p_actor_email) then
      assigned_count := assigned_count + 1;
    end if;
  end loop;
  return assigned_count;
end;
$$;

revoke all on function public.assign_course_topic(text, text, text) from public, anon, authenticated;
revoke all on function public.remove_course_topic(uuid, text) from public, anon, authenticated;
revoke all on function public.assign_topic_to_courses(text, text[], text) from public, anon, authenticated;
revoke all on function public.assign_course_tag(text, text, text) from public, anon, authenticated;
revoke all on function public.remove_course_tag(uuid, text) from public, anon, authenticated;
revoke all on function public.assign_tag_to_courses(text, text[], text) from public, anon, authenticated;

grant execute on function public.assign_course_topic(text, text, text) to service_role;
grant execute on function public.remove_course_topic(uuid, text) to service_role;
grant execute on function public.assign_topic_to_courses(text, text[], text) to service_role;
grant execute on function public.assign_course_tag(text, text, text) to service_role;
grant execute on function public.remove_course_tag(uuid, text) to service_role;
grant execute on function public.assign_tag_to_courses(text, text[], text) to service_role;

commit;
