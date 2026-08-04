begin;

create table if not exists public.environment_snapshot_status (
  singleton boolean primary key default true check (singleton),
  refreshed_at timestamptz not null,
  source_snapshot_at timestamptz not null,
  source_project_ref text not null,
  row_counts jsonb not null default '{}'
);

comment on table public.environment_snapshot_status is
  'Singleton metadata for the latest successful sanitized staging refresh.';

alter table public.environment_snapshot_status enable row level security;

revoke all on public.environment_snapshot_status from public, anon, authenticated;
grant select, insert, update, delete on public.environment_snapshot_status to service_role;

commit;
