-- =====================================================================
-- Step 1: masters and sign-in
-- Department, designation and role lists, the user master, sign-in
-- linking, access rules, and the private picture store for avatars.
-- =====================================================================

create schema if not exists private;

-- ---------- Tables ----------------------------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table public.designations (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- The user master. A person can exist here without being able to sign in.
create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (btrim(name) <> ''),
  email text,
  phone text,
  department_id uuid references public.departments (id),
  designation_id uuid references public.designations (id),
  authority text not null default 'self' check (authority in ('self', 'departments', 'all')),
  avatar_path text,
  can_sign_in boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id),
  constraint app_users_email_lowercase check (email = lower(email)),
  constraint app_users_sign_in_needs_email check (not can_sign_in or email is not null)
);
create unique index app_users_email_key on public.app_users (email);
create index app_users_department_id_idx on public.app_users (department_id);
create index app_users_designation_id_idx on public.app_users (designation_id);
create index app_users_created_by_idx on public.app_users (created_by);

-- A person can hold several roles.
create table public.user_roles (
  user_id uuid not null references public.app_users (id) on delete cascade,
  role_id uuid not null references public.roles (id),
  primary key (user_id, role_id)
);
create index user_roles_role_id_idx on public.user_roles (role_id);

-- The departments a person may work with when their authority is "departments".
create table public.user_authority_departments (
  user_id uuid not null references public.app_users (id) on delete cascade,
  department_id uuid not null references public.departments (id),
  primary key (user_id, department_id)
);
create index user_authority_departments_department_id_idx
  on public.user_authority_departments (department_id);

-- ---------- Helper functions (kept out of the public API) -------------

-- The signed-in person's row in the user master, or null when they are
-- inactive or their sign-in is switched off.
create function private.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.app_users
  where auth_user_id = (select auth.uid())
    and is_active
    and can_sign_in
$$;

-- True when the signed-in person has authority "all".
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users
    where auth_user_id = (select auth.uid())
      and is_active
      and can_sign_in
      and authority = 'all'
  )
$$;

-- Fills TIMESTAMP and ENTERED BY on every new row, whatever the screen sends.
create function private.stamp_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  new.created_by := (select private.current_app_user_id());
  return new;
end
$$;

-- Guards on changes to a person.
create function private.guard_app_user_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.auth_user_id is not null and new.email is distinct from old.email then
    raise exception 'Email cannot be changed after the person has set up sign-in';
  end if;
  return new;
end
$$;

-- There must always be someone who can manage the system.
create function private.keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.authority = 'all' and old.is_active and old.can_sign_in and old.auth_user_id is not null
     and not exists (
       select 1
       from public.app_users
       where authority = 'all' and is_active and can_sign_in and auth_user_id is not null
     )
  then
    raise exception 'At least one active person with authority All and sign-in must remain';
  end if;
  return null;
end
$$;

-- Runs when someone sets up their sign-in.
--   * The very first person to set up becomes the first user, with authority "all".
--   * After that, only an email already in the user master with sign-in switched on is accepted.
create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_name text;
  v_id uuid;
begin
  if v_email is null then
    raise exception 'Email is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('app_users_first_user'));

  if not exists (select 1 from public.app_users) then
    v_name := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(v_email, '@', 1));
    insert into public.app_users (name, email, authority, can_sign_in, is_active, auth_user_id)
    values (v_name, v_email, 'all', true, true, new.id);
    return new;
  end if;

  update public.app_users
  set auth_user_id = new.id
  where email = v_email
    and can_sign_in
    and is_active
    and auth_user_id is null
  returning id into v_id;

  if v_id is null then
    raise exception 'This email is not set up for sign-in';
  end if;

  return new;
end
$$;

revoke all on function private.current_app_user_id() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.stamp_row() from public;
revoke all on function private.guard_app_user_update() from public;
revoke all on function private.keep_one_admin() from public;
revoke all on function private.handle_new_auth_user() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_app_user_id() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- ---------- Triggers --------------------------------------------------

create trigger stamp_row before insert on public.app_users
  for each row execute function private.stamp_row();
create trigger guard_update before update on public.app_users
  for each row execute function private.guard_app_user_update();
create trigger keep_one_admin after update on public.app_users
  for each row execute function private.keep_one_admin();
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- ---------- The three small lists: links, access rules, permissions ---

do $$
declare
  t text;
begin
  foreach t in array array['departments', 'designations', 'roles'] loop
    execute format('alter table public.%I add constraint %I foreign key (created_by) references public.app_users (id)', t, t || '_created_by_fkey');
    execute format('create index %I on public.%I (created_by)', t || '_created_by_idx', t);
    execute format('create unique index %I on public.%I (lower(btrim(name)))', t || '_name_key', t);
    execute format('create trigger stamp_row before insert on public.%I for each row execute function private.stamp_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Signed-in people can view" on public.%I for select to authenticated using ((select private.current_app_user_id()) is not null)', t);
    execute format('create policy "Authority All can add" on public.%I for insert to authenticated with check ((select private.is_admin()))', t);
    execute format('create policy "Authority All can change" on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert (name, is_active), update (name, is_active) on public.%I to authenticated', t);
  end loop;
end
$$;

-- ---------- User master: access rules and permissions -----------------

alter table public.app_users enable row level security;
create policy "Signed-in people can view" on public.app_users
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.app_users
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.app_users
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.app_users from anon, authenticated;
grant select on public.app_users to authenticated;
grant insert (name, email, phone, department_id, designation_id, authority, avatar_path, can_sign_in, is_active)
  on public.app_users to authenticated;
grant update (name, email, phone, department_id, designation_id, authority, avatar_path, can_sign_in, is_active)
  on public.app_users to authenticated;

alter table public.user_roles enable row level security;
create policy "Signed-in people can view" on public.user_roles
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.user_roles
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can remove" on public.user_roles
  for delete to authenticated
  using ((select private.is_admin()));
revoke all on public.user_roles from anon, authenticated;
grant select, insert, delete on public.user_roles to authenticated;

alter table public.user_authority_departments enable row level security;
create policy "Signed-in people can view" on public.user_authority_departments
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.user_authority_departments
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can remove" on public.user_authority_departments
  for delete to authenticated
  using ((select private.is_admin()));
revoke all on public.user_authority_departments from anon, authenticated;
grant select, insert, delete on public.user_authority_departments to authenticated;

-- ---------- Saving a person together with roles and departments -------

create function public.save_app_user(
  p_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_department_id uuid,
  p_designation_id uuid,
  p_authority text,
  p_avatar_path text,
  p_can_sign_in boolean,
  p_is_active boolean,
  p_role_ids uuid[],
  p_authority_department_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := nullif(btrim(p_name), '');
  v_email text := nullif(lower(btrim(p_email)), '');
  v_phone text := nullif(btrim(p_phone), '');
  v_roles uuid[] := coalesce(p_role_ids, '{}');
  v_departments uuid[] := coalesce(p_authority_department_ids, '{}');
begin
  if not (select private.is_admin()) then
    raise exception 'Only people with authority All can change the user master';
  end if;
  if v_name is null then
    raise exception 'Name is required';
  end if;
  if p_authority is null or p_authority not in ('self', 'departments', 'all') then
    raise exception 'Authority must be Self, Department(s) or All';
  end if;
  if coalesce(p_can_sign_in, false) and v_email is null then
    raise exception 'Email is required when sign-in is switched on';
  end if;
  if p_authority = 'departments' and cardinality(v_departments) = 0 then
    raise exception 'Choose at least one department for this authority';
  end if;

  if p_id is null then
    insert into public.app_users
      (name, email, phone, department_id, designation_id, authority, avatar_path, can_sign_in, is_active)
    values
      (v_name, v_email, v_phone, p_department_id, p_designation_id, p_authority, p_avatar_path,
       coalesce(p_can_sign_in, false), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.app_users
    set name = v_name,
        email = v_email,
        phone = v_phone,
        department_id = p_department_id,
        designation_id = p_designation_id,
        authority = p_authority,
        avatar_path = p_avatar_path,
        can_sign_in = coalesce(p_can_sign_in, false),
        is_active = coalesce(p_is_active, true)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Person not found';
    end if;
  end if;

  delete from public.user_roles
  where user_id = v_id and role_id <> all (v_roles);
  insert into public.user_roles (user_id, role_id)
  select v_id, r from unnest(v_roles) as r
  on conflict do nothing;

  delete from public.user_authority_departments
  where user_id = v_id
    and (p_authority <> 'departments' or department_id <> all (v_departments));
  if p_authority = 'departments' then
    insert into public.user_authority_departments (user_id, department_id)
    select v_id, d from unnest(v_departments) as d
    on conflict do nothing;
  end if;

  return v_id;
end
$$;

revoke all on function public.save_app_user(uuid, text, text, text, uuid, uuid, text, text, boolean, boolean, uuid[], uuid[]) from public, anon;
grant execute on function public.save_app_user(uuid, text, text, text, uuid, uuid, text, text, boolean, boolean, uuid[], uuid[]) to authenticated;

-- ---------- Private picture store for avatars -------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Signed-in people can view avatars" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (select private.current_app_user_id()) is not null);
create policy "Authority All can add avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (select private.is_admin()));
