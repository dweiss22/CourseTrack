begin;

-- There is one super_admin holder, not merely one active holder. Bootstrap
-- may temporarily have zero; after bootstrap, the trigger and transfer RPC
-- prevent ordinary writes from returning to zero or creating a second holder.
create unique index if not exists profiles_single_super_admin_idx
  on public.profiles ((role))
  where role = 'super_admin';

create or replace function public.protect_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  transfer_in_progress boolean :=
    coalesce(current_setting('coursetrack.super_admin_transfer', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.role = 'super_admin' and not transfer_in_progress then
      raise exception 'The super_admin account can only be changed through the transfer workflow.';
    end if;
    return old;
  end if;

  if not transfer_in_progress then
    if old.role = 'super_admin' and (
      new.role is distinct from 'super_admin'
      or new.account_status is distinct from 'active'
    ) then
      raise exception 'The super_admin account can only be changed through the transfer workflow.';
    end if;

    if auth.uid() is not null and auth.uid() = old.id
       and (new.role is distinct from old.role or new.account_status is distinct from old.account_status) then
      raise exception 'Users cannot change their own role or account status.';
    end if;

    if auth.uid() is not null and (new.role is distinct from old.role or new.account_status is distinct from old.account_status) then
      select role into actor_role from public.profiles where id = auth.uid();

      if actor_role is distinct from 'super_admin' and actor_role is distinct from 'admin' then
        raise exception 'You do not have permission to change roles or account status.';
      end if;

      if actor_role = 'admin' and (
        old.role in ('super_admin', 'admin') or new.role in ('super_admin', 'admin')
      ) then
        raise exception 'Admins may only manage accreditation and content users.';
      end if;
    end if;
  end if;

  if auth.uid() is not null and auth.uid() = old.id and (
    new.email is distinct from old.email
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.id is distinct from old.id
  ) then
    raise exception 'Users may only update their own display name.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_role_changes on public.profiles;
create trigger profiles_protect_role_changes
before update or delete on public.profiles
for each row execute function public.protect_profile_role_changes();

create or replace function public.transfer_super_admin(
  p_actor_id uuid,
  p_target_id uuid
)
returns setof public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  target_confirmed_at timestamptz;
  target_last_sign_in_at timestamptz;
begin
  if p_actor_id = p_target_id then
    raise exception 'Choose another active user as the successor.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('coursetrack-super-admin-transfer', 0));

  select * into actor_profile
  from public.profiles
  where id = p_actor_id
  for update;

  if not found or actor_profile.role <> 'super_admin' or actor_profile.account_status <> 'active' then
    raise exception 'Only the active super_admin can transfer this role.';
  end if;

  select * into target_profile
  from public.profiles
  where id = p_target_id
  for update;

  if not found then
    raise exception 'The selected successor does not have an application membership.';
  end if;
  if target_profile.account_status <> 'active' then
    raise exception 'The selected successor must have an active account.';
  end if;

  select email_confirmed_at, last_sign_in_at
  into target_confirmed_at, target_last_sign_in_at
  from auth.users
  where id = p_target_id;

  if target_confirmed_at is null or target_last_sign_in_at is null then
    raise exception 'The selected successor must confirm their email and sign in before transfer.';
  end if;

  perform set_config('coursetrack.super_admin_transfer', 'on', true);

  update public.profiles
  set role = 'admin'
  where id = p_actor_id;

  update public.profiles
  set role = 'super_admin', account_status = 'active'
  where id = p_target_id;

  insert into public.audit_logs (
    actor_id,
    actor_email,
    action,
    record_type,
    record_id,
    previous_values,
    new_values,
    source,
    reason
  ) values (
    p_actor_id,
    actor_profile.email,
    'super_admin.transferred',
    'profile',
    p_target_id::text,
    jsonb_build_object('super_admin_id', p_actor_id, 'role', actor_profile.role),
    jsonb_build_object('super_admin_id', p_target_id, 'role', 'super_admin'),
    'coursetrack',
    'Explicit super_admin transfer'
  );

  return query
  select pr.*
  from public.profiles pr
  where pr.id in (p_actor_id, p_target_id)
  order by case when pr.id = p_target_id then 0 else 1 end;
end;
$$;

revoke all on function public.transfer_super_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_super_admin(uuid, uuid) to service_role;

commit;
