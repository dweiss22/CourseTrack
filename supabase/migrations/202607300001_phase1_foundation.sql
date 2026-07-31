begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    join public.profiles pr on pr.id = ur.user_id and pr.active
    where ur.user_id = auth.uid()
      and p.key = required_permission
  );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

create table public.verticals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  sort_order integer not null,
  active boolean not null default true
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null unique,
  lms_course_id text unique,
  title text not null,
  short_title text,
  description text,
  learning_audience text,
  primary_vertical_id uuid not null references public.verticals(id),
  primary_topic text,
  tags text[] not null default '{}',
  lifecycle_status text not null check (
    lifecycle_status in (
      'Published', 'Under Maintenance', 'Internal Review', 'In Development',
      'Scheduled for Revamp', 'Retired', 'Archived'
    )
  ),
  publication_status text not null,
  delivery_format text,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  authoring_tool text,
  state_code text,
  owner_id uuid references public.profiles(id),
  instructional_designer_id uuid references public.profiles(id),
  current_version text,
  original_publish_date date,
  last_major_revision_date date,
  next_review_date date,
  health_status text not null check (
    health_status in ('Healthy', 'Monitor', 'Needs Review', 'At Risk', 'Critical')
  ),
  health_score integer not null check (health_score between 0 and 100),
  metadata_completeness_score integer not null check (
    metadata_completeness_score between 0 and 100
  ),
  internal_summary text not null default '',
  source_system text not null,
  data_source text not null,
  retrieval_status text not null,
  last_retrieved_at timestamptz,
  is_sample boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_verticals (
  course_id uuid not null references public.courses(id) on delete cascade,
  vertical_id uuid not null references public.verticals(id),
  relationship_type text not null default 'secondary'
    check (relationship_type in ('secondary', 'applicable')),
  primary key (course_id, vertical_id)
);

create table public.course_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  external_version_id text,
  version_number text not null,
  version_type text not null,
  publication_date date,
  is_current boolean not null default false,
  authoring_tool text,
  package_standard text,
  release_notes text,
  data_source text not null,
  source_system text not null,
  retrieved_at timestamptz,
  source_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accreditation_records (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  external_accreditation_id text,
  organization text not null,
  jurisdiction text,
  status text not null,
  approval_number text,
  credit_hours numeric(7,2) not null default 0 check (credit_hours >= 0),
  effective_date date,
  expiration_date date,
  risk_reasons text[] not null default '{}',
  data_source text not null,
  source_system text not null,
  retrieved_at timestamptz,
  source_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_flags (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  type text not null,
  title text not null,
  priority text not null check (priority in ('Low', 'Medium', 'High', 'Critical')),
  status text not null check (status in ('Open', 'In Progress', 'Resolved', 'Dismissed')),
  owner_id uuid references public.profiles(id),
  due_date date,
  created_by uuid not null references public.profiles(id),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  note_type text not null,
  author_id uuid not null references public.profiles(id),
  visibility text not null check (visibility in ('Team', 'Role restricted', 'Private')),
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.revamp_proposals (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  status text not null check (
    status in ('Draft', 'Submitted', 'Under Review', 'Approved', 'Deferred', 'In Progress', 'Completed')
  ),
  priority text not null check (priority in ('Low', 'Medium', 'High', 'Critical')),
  score integer not null check (score between 0 and 100),
  business_justification text not null,
  target_publication_date date,
  proposed_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lms_retrieval_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (
    status in ('Running', 'Retrieved', 'Retrieved with Warnings', 'Retrieval Failed')
  ),
  records_requested integer not null default 0 check (records_requested >= 0),
  records_received integer not null default 0 check (records_received >= 0),
  records_failed integer not null default 0 check (records_failed >= 0),
  message text not null default '',
  initiated_by uuid references public.profiles(id),
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.lms_snapshots (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete set null,
  provider text not null,
  external_id text not null,
  retrieval_run_id uuid not null references public.lms_retrieval_runs(id),
  retrieved_at timestamptz not null,
  normalized_payload jsonb not null,
  payload_hash text not null,
  mapping_warnings jsonb not null default '[]',
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index lms_snapshots_current_idx
  on public.lms_snapshots(provider, external_id)
  where is_current;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  actor_email text not null,
  action text not null,
  record_type text not null,
  record_id text not null,
  previous_values jsonb,
  new_values jsonb,
  source text not null,
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index courses_title_trgm_idx on public.courses using gin (title gin_trgm_ops);
create index courses_code_trgm_idx on public.courses using gin (course_code gin_trgm_ops);
create index courses_vertical_idx on public.courses(primary_vertical_id);
create index courses_lifecycle_idx on public.courses(lifecycle_status);
create index courses_review_idx on public.courses(next_review_date);
create index courses_health_idx on public.courses(health_status);
create index versions_course_idx on public.course_versions(course_id);
create index accreditation_course_idx on public.accreditation_records(course_id);
create index accreditation_expiration_idx on public.accreditation_records(expiration_date);
create index flags_course_idx on public.course_flags(course_id);
create index flags_status_priority_idx on public.course_flags(status, priority);
create index notes_course_idx on public.notes(course_id);
create index revamps_course_idx on public.revamp_proposals(course_id);
create index retrieval_started_idx on public.lms_retrieval_runs(started_at desc);
create index snapshots_course_idx on public.lms_snapshots(course_id);
create index snapshots_external_idx on public.lms_snapshots(provider, external_id);
create index audit_record_idx on public.audit_logs(record_type, record_id);
create index audit_created_idx on public.audit_logs(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger courses_set_updated_at before update on public.courses
for each row execute function public.set_updated_at();
create trigger versions_set_updated_at before update on public.course_versions
for each row execute function public.set_updated_at();
create trigger accreditation_set_updated_at before update on public.accreditation_records
for each row execute function public.set_updated_at();
create trigger flags_set_updated_at before update on public.course_flags
for each row execute function public.set_updated_at();
create trigger notes_set_updated_at before update on public.notes
for each row execute function public.set_updated_at();
create trigger revamps_set_updated_at before update on public.revamp_proposals
for each row execute function public.set_updated_at();

insert into public.roles (key, name, description) values
  ('administrator', 'Administrator', 'Full CourseTrack administration'),
  ('course_manager', 'Course Manager', 'Portfolio and workflow management'),
  ('instructional_designer', 'Instructional Designer', 'Course design and review'),
  ('accreditation_reviewer', 'Accreditation Reviewer', 'Accreditation oversight'),
  ('reporting_user', 'Reporting User', 'Portfolio reporting and export'),
  ('read_only_user', 'Read-Only User', 'Portfolio read access')
on conflict (key) do nothing;

insert into public.permissions (key, description) values
  ('courses:view', 'View the course portfolio'),
  ('courses:edit-internal', 'Edit CourseTrack-owned course fields'),
  ('courses:archive', 'Soft-archive a course'),
  ('versions:manage', 'Manage internal version metadata'),
  ('accreditation:manage', 'Manage accreditation records'),
  ('flags:manage', 'Manage course flags'),
  ('notes:create', 'Create course notes'),
  ('revamp:propose', 'Create revamp proposals'),
  ('revamp:approve', 'Approve revamp proposals'),
  ('reports:export', 'Export portfolio reports'),
  ('lms:retrieve', 'Run read-only LMS retrievals'),
  ('administration:manage', 'Manage roles and settings'),
  ('audit:view', 'View audit history')
on conflict (key) do nothing;

insert into public.verticals (slug, name, sort_order) values
  ('law-enforcement', 'Law Enforcement', 1),
  ('fire-and-rescue', 'Fire and Rescue', 2),
  ('emergency-medical-services', 'Emergency Medical Services', 3),
  ('corrections', 'Corrections', 4),
  ('dispatch-and-telecommunications', 'Dispatch and Telecommunications', 5),
  ('local-government', 'Local Government', 6),
  ('wellness', 'Wellness', 7),
  ('cross-vertical', 'Cross-Vertical', 8)
on conflict (slug) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'administrator'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key <> 'administration:manage'
where r.key = 'course_manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = any(array[
  'courses:view', 'courses:edit-internal', 'versions:manage', 'flags:manage',
  'notes:create', 'revamp:propose', 'lms:retrieve'
])
where r.key = 'instructional_designer'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = any(array[
  'courses:view', 'accreditation:manage', 'flags:manage', 'notes:create',
  'reports:export'
])
where r.key = 'accreditation_reviewer'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = any(array['courses:view', 'reports:export'])
where r.key = 'reporting_user'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'courses:view'
where r.key = 'read_only_user'
on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.verticals enable row level security;
alter table public.courses enable row level security;
alter table public.course_verticals enable row level security;
alter table public.course_versions enable row level security;
alter table public.accreditation_records enable row level security;
alter table public.course_flags enable row level security;
alter table public.notes enable row level security;
alter table public.revamp_proposals enable row level security;
alter table public.lms_retrieval_runs enable row level security;
alter table public.lms_snapshots enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_read on public.profiles
for select to authenticated using (
  id = auth.uid() or public.has_permission('administration:manage')
);
create policy profiles_admin_write on public.profiles
for all to authenticated
using (public.has_permission('administration:manage'))
with check (public.has_permission('administration:manage'));

create policy authorization_reference_read on public.roles
for select to authenticated using (public.has_permission('courses:view'));
create policy permissions_reference_read on public.permissions
for select to authenticated using (public.has_permission('courses:view'));
create policy own_role_read on public.user_roles
for select to authenticated using (
  user_id = auth.uid() or public.has_permission('administration:manage')
);
create policy role_permissions_read on public.role_permissions
for select to authenticated using (public.has_permission('courses:view'));
create policy roles_admin_write on public.user_roles
for all to authenticated
using (public.has_permission('administration:manage'))
with check (public.has_permission('administration:manage'));

create policy verticals_read on public.verticals
for select to authenticated using (public.has_permission('courses:view'));
create policy courses_read on public.courses
for select to authenticated using (public.has_permission('courses:view'));
create policy courses_internal_update on public.courses
for update to authenticated
using (public.has_permission('courses:edit-internal'))
with check (public.has_permission('courses:edit-internal'));
create policy course_verticals_read on public.course_verticals
for select to authenticated using (public.has_permission('courses:view'));

create policy versions_read on public.course_versions
for select to authenticated using (public.has_permission('courses:view'));
create policy versions_write on public.course_versions
for all to authenticated
using (public.has_permission('versions:manage'))
with check (public.has_permission('versions:manage'));

create policy accreditation_read on public.accreditation_records
for select to authenticated using (public.has_permission('courses:view'));
create policy accreditation_write on public.accreditation_records
for all to authenticated
using (public.has_permission('accreditation:manage'))
with check (public.has_permission('accreditation:manage'));

create policy flags_read on public.course_flags
for select to authenticated using (public.has_permission('courses:view'));
create policy flags_write on public.course_flags
for all to authenticated
using (public.has_permission('flags:manage'))
with check (public.has_permission('flags:manage'));

create policy notes_read on public.notes
for select to authenticated using (public.has_permission('courses:view'));
create policy notes_insert on public.notes
for insert to authenticated
with check (
  public.has_permission('notes:create')
  and author_id = auth.uid()
);

create policy revamps_read on public.revamp_proposals
for select to authenticated using (public.has_permission('courses:view'));
create policy revamps_insert on public.revamp_proposals
for insert to authenticated
with check (
  public.has_permission('revamp:propose')
  and proposed_by = auth.uid()
);
create policy revamps_update on public.revamp_proposals
for update to authenticated
using (
  public.has_permission('revamp:propose')
  or public.has_permission('revamp:approve')
)
with check (
  public.has_permission('revamp:propose')
  or public.has_permission('revamp:approve')
);

create policy retrieval_runs_read on public.lms_retrieval_runs
for select to authenticated using (public.has_permission('courses:view'));
create policy snapshots_read on public.lms_snapshots
for select to authenticated using (public.has_permission('courses:view'));
create policy audit_read on public.audit_logs
for select to authenticated using (public.has_permission('audit:view'));

commit;
