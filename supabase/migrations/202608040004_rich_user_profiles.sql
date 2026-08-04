begin;

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists job_title text,
  add column if not exists department text,
  add column if not exists timezone text not null default 'America/Chicago';

comment on column public.profiles.first_name is 'User-managed given name used for personalized greetings.';
comment on column public.profiles.last_name is 'User-managed family name.';
comment on column public.profiles.display_name is 'User-managed preferred name used throughout the application.';
comment on column public.profiles.job_title is 'Optional user-managed professional title.';
comment on column public.profiles.department is 'Optional user-managed department or team.';
comment on column public.profiles.timezone is 'IANA time zone used for user-local presentation.';

-- Correct the current superadmin identity while adding the richer profile.
-- Both identifiers are checked so this cannot rename an unrelated row.
update public.profiles
set
  first_name = 'Devin',
  last_name = 'Weiss',
  display_name = 'Devin Weiss',
  timezone = 'America/Chicago'
where id = '865d4df0-7217-4768-b5a3-bd0f09e0e576'
  and lower(email) = 'dweiss@lexipol.com';

commit;
