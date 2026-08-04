begin;

-- Replace the dormant additive 6-role/13-permission scaffold (never wired to
-- a real login) with an exclusive 4-role model. has_permission()/
-- has_permission_for_email() keep their exact names and signatures so none
-- of the existing RLS policies elsewhere in this schema need to change --
-- only what those two functions mean underneath changes.
--
-- Ordering note: every function is redefined to stop referencing the old
-- columns/tables *before* those columns/tables are dropped below, so nothing
-- is ever dropped while still referenced.

alter table public.profiles
  add column if not exists role text,
  add column if not exists account_status text,
  add column if not exists created_by uuid references public.profiles(id);

-- Conservative backfill. Legacy rows are memberships, but none was ever an
-- intentionally assigned application administrator. In particular, the seed
-- identity must never become a human login or an administrator.
update public.profiles
set
  role = coalesce(role, 'content'),
  account_status = coalesce(
    account_status,
    case
      when email = 'coursetrack-import@system.local' then 'disabled'
      when active then 'active'
      else 'disabled'
    end
  )
where role is null or account_status is null;

alter table public.profiles
  alter column role set not null,
  alter column account_status set not null,
  alter column account_status set default 'active';

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'accreditation', 'content'));

alter table public.profiles
  drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'disabled'));

comment on column public.profiles.role is
  'Exclusive application role. A user has exactly one role -- no additive/composed permissions.';
comment on column public.profiles.account_status is
  'active or disabled. A disabled account cannot sign in regardless of role.';

-- Single source of truth for "does this role satisfy this legacy permission
-- key" -- the concrete translation of the 4-role model onto the permission
-- keys still checked by existing RLS policies across this schema.
create or replace function public.role_grants_permission(p_role text, p_permission text)
returns boolean
language sql
immutable
as $$
  select case p_permission
    when 'courses:view'          then p_role in ('super_admin', 'admin', 'accreditation', 'content')
    when 'flags:manage'          then p_role in ('super_admin', 'admin', 'accreditation', 'content')
    when 'notes:create'          then p_role in ('super_admin', 'admin', 'accreditation', 'content')
    when 'accreditation:manage'  then p_role in ('super_admin', 'admin', 'accreditation')
    when 'courses:edit-internal' then p_role in ('super_admin', 'admin', 'content')
    when 'versions:manage'       then p_role in ('super_admin', 'admin', 'content')
    when 'revamp:propose'        then p_role in ('super_admin', 'admin', 'content')
    when 'revamp:approve'        then p_role in ('super_admin', 'admin')
    when 'audit:view'            then p_role in ('super_admin', 'admin')
    when 'administration:manage' then p_role in ('super_admin', 'admin')
    else false
  end;
$$;

-- Redefine has_permission()/has_permission_for_email() to read the new
-- profiles.role/account_status columns instead of the old scaffold. Same
-- names and signatures as before -- every existing RLS policy that calls
-- them keeps working unchanged.
create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.account_status = 'active'
      and public.role_grants_permission(pr.role, required_permission)
  );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- Mirrors has_permission() but keyed by email instead of auth.uid(), for
-- service-role-client code paths (see lib/auth.ts / lib/wrike-authz.ts),
-- which have no authenticated Postgres session to key off of.
create or replace function public.has_permission_for_email(p_email text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.email = p_email
      and pr.account_status = 'active'
      and public.role_grants_permission(pr.role, p_permission)
  );
$$;

revoke all on function public.has_permission_for_email(text, text) from public, anon, authenticated;
grant execute on function public.has_permission_for_email(text, text) to service_role;

-- Now safe to remove: nothing above references the old scaffold anymore.
drop table if exists public.role_permissions;
drop table if exists public.user_roles;
drop table if exists public.roles;
drop table if exists public.permissions;
alter table public.profiles drop column if exists active;

-- Defense in depth: these invariants hold regardless of which Postgres role
-- performs the update (including service_role, which the app's own write
-- path always uses -- see docs/auth-setup.md for why app-layer checks in
-- db/user-repository.ts are still the primary enforcement).
create or replace function public.protect_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A real authenticated session can never change its own role/status,
  -- regardless of what the request claims. No-op for service-role writes
  -- (auth.uid() is null there), where admin-initiated changes to *other*
  -- rows are the norm and are authorized at the application layer instead.
  if auth.uid() is not null and auth.uid() = old.id
     and (new.role is distinct from old.role or new.account_status is distinct from old.account_status) then
    raise exception 'Users cannot change their own role or account status.';
  end if;

  -- The service-role write path (auth.uid() is null) enforces the rest of
  -- the access matrix in db/user-repository.ts. But profiles_admin_write's
  -- RLS policy grants any 'admin' or 'super_admin' full write access to this
  -- table for any *other* row, so a plain 'admin' calling Supabase directly
  -- (bypassing the app entirely) could otherwise promote themselves via a
  -- second account, touch a super_admin/admin row, or grant super_admin/
  -- admin to someone else. Re-check the matrix here too, keyed off the
  -- caller's own profile row, so this holds even for direct API/SQL access.
  if auth.uid() is not null and (new.role is distinct from old.role or new.account_status is distinct from old.account_status) then
    declare
      actor_role text;
    begin
      select role into actor_role from public.profiles where id = auth.uid();

      if actor_role is distinct from 'super_admin' and actor_role is distinct from 'admin' then
        raise exception 'You do not have permission to change roles or account status.';
      end if;

      if actor_role = 'admin' and (
        old.role in ('super_admin', 'admin') or new.role in ('super_admin', 'admin')
      ) then
        raise exception 'Admins may only manage accreditation and content users.';
      end if;
    end;
  end if;

  -- profiles_self_update_display_name's RLS policy authorizes a self-update
  -- of the whole row (RLS restricts rows, not columns) -- reject any
  -- self-update that touches a column other than display_name, so a direct
  -- API/SQL call can't rewrite email/created_by/role/account_status via
  -- that policy either (role/account_status are already covered above, but
  -- this closes the rest of the column set).
  if auth.uid() is not null and auth.uid() = old.id and (
    new.email is distinct from old.email
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.id is distinct from old.id
  ) then
    raise exception 'Users may only update their own display name.';
  end if;

  -- Never allow the last active super_admin to be demoted, disabled, or
  -- have their role changed, no matter who (or what) is asking.
  if old.role = 'super_admin' and old.account_status = 'active'
     and (new.role is distinct from 'super_admin' or new.account_status is distinct from 'active')
     and not exists (
       select 1 from public.profiles
       where role = 'super_admin' and account_status = 'active' and id <> old.id
     )
  then
    raise exception 'Cannot remove, disable, or demote the last active super_admin.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_role_changes on public.profiles;
create trigger profiles_protect_role_changes before update on public.profiles
for each row execute function public.protect_profile_role_changes();

-- Users may update their own display_name (nothing else -- the trigger
-- above is what actually stops role/account_status from changing here;
-- profiles_admin_write, already in place, covers admin-initiated writes).
drop policy if exists profiles_self_update_display_name on public.profiles;
create policy profiles_self_update_display_name on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

commit;
