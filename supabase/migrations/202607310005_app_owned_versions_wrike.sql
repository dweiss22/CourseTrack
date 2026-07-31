begin;

alter table public.course_versions
  add column if not exists app_version_id text,
  add column if not exists version_status text not null default 'Published',
  add column if not exists managed_by text not null default 'CourseTrack',
  add column if not exists created_by_email text;

comment on table public.course_versions is
  'CourseTrack-owned version ledger. LMS version identifiers are not available to CourseTrack and must not be inferred.';
comment on column public.course_versions.external_version_id is
  'Deprecated for LMS versioning. Retained for backwards compatibility; new CourseTrack versions use app_version_id.';
comment on column public.course_versions.managed_by is
  'Version authority. CourseTrack is the sole supported value.';

update public.course_versions
set
  managed_by = 'CourseTrack',
  source_system = 'CourseTrack',
  data_source = 'manual'
where
  managed_by is distinct from 'CourseTrack'
  or source_system is distinct from 'CourseTrack'
  or data_source is distinct from 'manual';

alter table public.course_versions
  drop constraint if exists course_versions_version_status_check;
alter table public.course_versions
  add constraint course_versions_version_status_check
  check (version_status in ('Draft', 'In Review', 'Scheduled', 'Published', 'Superseded'));

alter table public.course_versions
  drop constraint if exists course_versions_managed_by_check;
alter table public.course_versions
  add constraint course_versions_managed_by_check
  check (managed_by = 'CourseTrack');

create unique index if not exists course_versions_course_number_unique_idx
  on public.course_versions(course_id, version_number);
create unique index if not exists course_versions_app_version_id_unique_idx
  on public.course_versions(app_version_id)
  where app_version_id is not null;
create index if not exists course_versions_status_idx
  on public.course_versions(version_status, is_current);

create table if not exists public.version_wrike_task_references (
  id uuid primary key default gen_random_uuid(),
  course_version_id uuid not null references public.course_versions(id) on delete cascade,
  external_task_id text not null,
  task_title text not null,
  external_project_id text,
  project_title text,
  task_status text,
  assignee_names jsonb not null default '[]',
  due_date date,
  permalink text,
  provider_name text not null check (provider_name in ('Mock Wrike', 'Live Wrike')),
  retrieved_at timestamptz not null,
  raw_payload jsonb not null default '{}',
  linked_by uuid references public.profiles(id),
  linked_by_email text,
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  unique (course_version_id, external_task_id)
);

comment on table public.version_wrike_task_references is
  'CourseTrack-owned references to read-only Wrike task snapshots. These records never write back to Wrike.';

create index if not exists version_wrike_task_external_idx
  on public.version_wrike_task_references(external_task_id);
create index if not exists version_wrike_task_project_idx
  on public.version_wrike_task_references(external_project_id)
  where external_project_id is not null;
create index if not exists version_wrike_task_active_idx
  on public.version_wrike_task_references(course_version_id, linked_at desc)
  where unlinked_at is null;

alter table public.version_wrike_task_references enable row level security;

drop policy if exists version_wrike_task_references_read
  on public.version_wrike_task_references;
create policy version_wrike_task_references_read
  on public.version_wrike_task_references
  for select to authenticated
  using (public.has_permission('courses:view'));

drop policy if exists version_wrike_task_references_write
  on public.version_wrike_task_references;
create policy version_wrike_task_references_write
  on public.version_wrike_task_references
  for all to authenticated
  using (public.has_permission('versions:manage'))
  with check (public.has_permission('versions:manage'));

commit;
