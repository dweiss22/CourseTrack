begin;

-- Wrike returns a task's custom fields as opaque id/value pairs; the titles
-- live only in the account-level catalogue (GET /api/v4/customfields). This
-- table is the locally synchronized copy of that catalogue, following the same
-- reference-data pattern as public.wrike_contacts and public.wrike_folder_index.
--
-- Custom-field definitions change rarely, so the scheduled Wrike sync refreshes
-- them alongside contacts and folders. Task search then resolves field names
-- from this table instead of calling Wrike on every keystroke.
--
-- Additive only: no existing table, function, or policy is altered.

create table if not exists public.wrike_custom_field_index (
  field_id text primary key,
  title text not null,
  field_type text,
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now()
);

alter table public.wrike_custom_field_index enable row level security;

-- Mirrors the wrike_contacts / wrike_folder_index policies exactly: the same
-- readers who may view course data may read the catalogue, and only
-- administrators may write it. Writes in practice come from the service-role
-- sync client, which bypasses RLS.
drop policy if exists wrike_custom_field_index_read on public.wrike_custom_field_index;
create policy wrike_custom_field_index_read on public.wrike_custom_field_index for select to authenticated
using (public.has_permission('courses:view'));

drop policy if exists wrike_custom_field_index_admin_write on public.wrike_custom_field_index;
create policy wrike_custom_field_index_admin_write on public.wrike_custom_field_index for all to authenticated
using (public.has_permission('administration:manage')) with check (public.has_permission('administration:manage'));

commit;
