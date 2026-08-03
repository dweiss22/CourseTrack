begin;

-- Extend the existing app-owned Wrike reference table with linking metadata
-- and enforce "zero or one active link" in both directions.
alter table public.version_wrike_task_references
  add column if not exists link_method text,
  add column if not exists last_verified_at timestamptz;

alter table public.version_wrike_task_references
  drop constraint if exists version_wrike_task_references_link_method_check;
alter table public.version_wrike_task_references
  add constraint version_wrike_task_references_link_method_check
  check (link_method is null or link_method in ('manual_permalink', 'selected_candidate'));

create unique index if not exists version_wrike_task_one_active_per_version_idx
  on public.version_wrike_task_references(course_version_id)
  where unlinked_at is null;
create unique index if not exists version_wrike_task_one_active_per_task_idx
  on public.version_wrike_task_references(external_task_id)
  where unlinked_at is null;

-- Singleton connection row holding the encrypted Wrike permanent access token.
create table if not exists public.wrike_connection (
  connection_key text primary key default 'default' check (connection_key = 'default'),
  api_host text not null,
  access_token_encrypted text not null,
  account_id text,
  account_name text,
  status text not null check (status in ('connected', 'error', 'disconnected')),
  last_error text,
  connected_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.wrike_connection is
  'Singleton, admin-managed Wrike connection. Holds only an encrypted permanent access token; never exposed to browser clients.';

-- Approved top-level Wrike folders CourseTrack is allowed to read tasks from,
-- plus per-folder sync status. The set of approved folder ids is defined in
-- code (lib/wrike-source-folders.ts) and mirrored here at seed time.
create table if not exists public.wrike_source_folders (
  folder_id text primary key,
  name text not null,
  category text,
  designation text,
  enabled boolean not null default true,
  last_sync_at timestamptz,
  last_sync_error text,
  last_sync_task_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.wrike_source_folders (folder_id, name, category, designation) values
  ('IEACHQK7I4UOEPFL', 'Cordico [New]', 'Cordico', 'New'),
  ('IEACHQK7I4PGHAIF', 'Custody [Maint]', 'Custody', 'Maint'),
  ('IEACHQK7I4QUZOFS', 'Custody [New]', 'Custody', 'New'),
  ('IEACHQK7I45QZU3G', 'Dispatch [New]', 'Dispatch', 'New'),
  ('IEACHQK7I4PGHAD7', 'EMS [Maint]', 'EMS', 'Maint'),
  ('IEACHQK7I4SCO46Z', 'EMS [New]', 'EMS', 'New'),
  ('IEACHQK7I4PGHBAC', 'Fire [Maint]', 'Fire', 'Maint'),
  ('IEACHQK7I4N7GGRM', 'Fire [New]', 'Fire', 'New'),
  ('IEACHQK7I4PGHACI', 'Law Enforcement [Maint]', 'Law Enforcement', 'Maint'),
  ('IEACHQK7I4N7GGQ4', 'Law Enforcement [New]', 'Law Enforcement', 'New'),
  ('IEACHQK7I4PGG7Z2', 'Local Gov [Maint]', 'Local Gov', 'Maint'),
  ('IEACHQK7I4SCPAAB', 'Local Gov [New]', 'Local Gov', 'New'),
  ('IEACHQK7I4N7GGRB', 'Non-Vertical Content Projects [Maint]', 'Non-Vertical Content Projects', 'Maint')
on conflict (folder_id) do nothing;

-- Synchronized, normalized index of Wrike tasks found in the approved
-- folders. Populated only by the sync job; never written to by end users.
create table if not exists public.wrike_tasks (
  wrike_task_id text primary key,
  title text not null,
  status text,
  custom_status_id text,
  responsible_ids jsonb not null default '[]',
  parent_ids jsonb not null default '[]',
  super_parent_ids jsonb not null default '[]',
  custom_fields jsonb not null default '[]',
  permalink text,
  wrike_created_date timestamptz,
  wrike_updated_date timestamptz,
  wrike_completed_date timestamptz,
  raw_payload jsonb,
  is_active boolean not null default true,
  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.wrike_tasks is
  'Synchronized read-only snapshot of Wrike tasks from approved folders only. Never written back to Wrike.';

create index if not exists wrike_tasks_title_trgm_idx
  on public.wrike_tasks using gin (title gin_trgm_ops);
create index if not exists wrike_tasks_active_idx
  on public.wrike_tasks(is_active);
create index if not exists wrike_tasks_updated_idx
  on public.wrike_tasks(wrike_updated_date);

-- A task may live in more than one approved folder; preserve every match.
create table if not exists public.wrike_task_source_folders (
  wrike_task_id text not null references public.wrike_tasks(wrike_task_id) on delete cascade,
  folder_id text not null references public.wrike_source_folders(folder_id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (wrike_task_id, folder_id)
);

create index if not exists wrike_task_source_folders_folder_idx
  on public.wrike_task_source_folders(folder_id);

-- Sync run history for admin-visible status/troubleshooting.
create table if not exists public.wrike_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  triggered_by text not null,
  folders_attempted integer not null default 0,
  folders_succeeded integer not null default 0,
  folders_failed integer not null default 0,
  tasks_seen integer not null default 0,
  tasks_upserted integer not null default 0,
  tasks_marked_inactive integer not null default 0,
  errors jsonb not null default '[]'
);

create index if not exists wrike_sync_runs_started_idx
  on public.wrike_sync_runs(started_at desc);

create trigger wrike_connection_set_updated_at before update on public.wrike_connection
for each row execute function public.set_updated_at();
create trigger wrike_source_folders_set_updated_at before update on public.wrike_source_folders
for each row execute function public.set_updated_at();
create trigger wrike_tasks_set_updated_at before update on public.wrike_tasks
for each row execute function public.set_updated_at();

alter table public.wrike_connection enable row level security;
alter table public.wrike_source_folders enable row level security;
alter table public.wrike_tasks enable row level security;
alter table public.wrike_task_source_folders enable row level security;
alter table public.wrike_sync_runs enable row level security;

drop policy if exists wrike_connection_admin_all on public.wrike_connection;
create policy wrike_connection_admin_all on public.wrike_connection
for all to authenticated
using (public.has_permission('administration:manage'))
with check (public.has_permission('administration:manage'));

drop policy if exists wrike_source_folders_read on public.wrike_source_folders;
create policy wrike_source_folders_read on public.wrike_source_folders
for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists wrike_source_folders_admin_write on public.wrike_source_folders;
create policy wrike_source_folders_admin_write on public.wrike_source_folders
for all to authenticated
using (public.has_permission('administration:manage'))
with check (public.has_permission('administration:manage'));

drop policy if exists wrike_tasks_read on public.wrike_tasks;
create policy wrike_tasks_read on public.wrike_tasks
for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists wrike_tasks_admin_write on public.wrike_tasks;
create policy wrike_tasks_admin_write on public.wrike_tasks
for all to authenticated
using (public.has_permission('administration:manage'))
with check (public.has_permission('administration:manage'));

drop policy if exists wrike_task_source_folders_read on public.wrike_task_source_folders;
create policy wrike_task_source_folders_read on public.wrike_task_source_folders
for select to authenticated using (public.has_permission('courses:view'));
drop policy if exists wrike_task_source_folders_admin_write on public.wrike_task_source_folders;
create policy wrike_task_source_folders_admin_write on public.wrike_task_source_folders
for all to authenticated
using (public.has_permission('administration:manage'))
with check (public.has_permission('administration:manage'));

drop policy if exists wrike_sync_runs_admin_all on public.wrike_sync_runs;
create policy wrike_sync_runs_admin_all on public.wrike_sync_runs
for all to authenticated
using (public.has_permission('administration:manage'))
with check (public.has_permission('administration:manage'));

commit;
