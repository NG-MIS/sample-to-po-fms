-- =====================================================================
-- Step 2: numbering master, reference list, samples and remarks
-- =====================================================================

-- ---------- Names the system depends on -------------------------------
-- The DESIGNER pick-list is "department Sample + role Designer", and the
-- role Designer is what allows a person to create a sample.

insert into public.departments (name)
select 'Sample'
where not exists (select 1 from public.departments where lower(btrim(name)) = 'sample');

insert into public.roles (name)
select 'Designer'
where not exists (select 1 from public.roles where lower(btrim(name)) = 'designer');

create function private.guard_system_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_table_name = 'departments' and lower(btrim(old.name)) = 'sample')
     or (tg_table_name = 'roles' and lower(btrim(old.name)) = 'designer')
  then
    if lower(btrim(new.name)) <> lower(btrim(old.name)) or not new.is_active then
      raise exception '"%" is used by the system to decide who is a designer, so it cannot be renamed or switched inactive', old.name;
    end if;
  end if;
  return new;
end
$$;
revoke all on function private.guard_system_names() from public;

create trigger guard_system_names before update on public.departments
  for each row execute function private.guard_system_names();
create trigger guard_system_names before update on public.roles
  for each row execute function private.guard_system_names();

-- ---------- Reference list (a simple list, like departments) ----------

create table public.sample_reference_options (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index sample_reference_options_name_key on public.sample_reference_options (lower(btrim(name)));
create index sample_reference_options_created_by_idx on public.sample_reference_options (created_by);
create trigger stamp_row before insert on public.sample_reference_options
  for each row execute function private.stamp_row();

alter table public.sample_reference_options enable row level security;
create policy "Signed-in people can view" on public.sample_reference_options
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.sample_reference_options
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.sample_reference_options
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.sample_reference_options from anon, authenticated;
grant select, insert (name, is_active), update (name, is_active)
  on public.sample_reference_options to authenticated;

-- ---------- Numbering master (one row per series) ---------------------

create table public.sample_series (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  prefix text not null,
  start_number bigint not null check (start_number >= 1),
  last_number bigint,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id),
  constraint sample_series_prefix_format check (prefix ~ '^[A-Z0-9]{1,10}$'),
  constraint sample_series_last_number_check check (last_number is null or last_number >= start_number)
);
create unique index sample_series_prefix_key on public.sample_series (prefix);
create index sample_series_created_by_idx on public.sample_series (created_by);
create trigger stamp_row before insert on public.sample_series
  for each row execute function private.stamp_row();

-- Once a series has given out a number, its prefix and starting number are locked.
create function private.guard_sample_series_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.last_number is not null
     and (new.prefix <> old.prefix or new.start_number <> old.start_number)
  then
    raise exception 'This series has already been used, so its prefix and starting number cannot change';
  end if;
  return new;
end
$$;
revoke all on function private.guard_sample_series_update() from public;
create trigger guard_update before update on public.sample_series
  for each row execute function private.guard_sample_series_update();

alter table public.sample_series enable row level security;
create policy "Signed-in people can view" on public.sample_series
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.sample_series
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.sample_series
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.sample_series from anon, authenticated;
grant select, insert (prefix, start_number, is_active), update (prefix, start_number, is_active)
  on public.sample_series to authenticated;

-- ---------- Samples and their remarks ---------------------------------

create table public.samples (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  sample_no text not null unique,
  series_id uuid not null references public.sample_series (id),
  series_number bigint not null,
  creation_date date not null,
  designer_id uuid not null references public.app_users (id),
  concept_image_path text not null,
  reference_option_id uuid references public.sample_reference_options (id),
  reference_image_path text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.app_users (id),
  unique (series_id, series_number)
);
create index samples_designer_id_idx on public.samples (designer_id);
create index samples_created_by_idx on public.samples (created_by);
create index samples_reference_option_id_idx on public.samples (reference_option_id);
create index samples_concept_image_path_idx on public.samples (concept_image_path);
create index samples_reference_image_path_idx on public.samples (reference_image_path);

-- A sample can carry any number of remarks: typed text, voice notes, pictures.
create table public.sample_remarks (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.samples (id) on delete cascade,
  kind text not null check (kind in ('text', 'voice', 'image')),
  body text,
  file_path text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id),
  constraint sample_remarks_content check (
    (kind = 'text' and nullif(btrim(body), '') is not null and file_path is null)
    or (kind in ('voice', 'image') and nullif(btrim(file_path), '') is not null and body is null)
  )
);
create index sample_remarks_sample_id_idx on public.sample_remarks (sample_id);
create index sample_remarks_created_by_idx on public.sample_remarks (created_by);
create index sample_remarks_file_path_idx on public.sample_remarks (file_path);

-- ---------- Who may do what -------------------------------------------

-- Role Designer or authority All may create a sample.
create function private.can_create_samples()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users me
    where me.auth_user_id = (select auth.uid())
      and me.is_active
      and me.can_sign_in
      and (
        me.authority = 'all'
        or exists (
          select 1
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.user_id = me.id and r.is_active and lower(btrim(r.name)) = 'designer'
        )
      )
  )
$$;

-- A person who may be picked as DESIGNER: active, department Sample, role Designer.
create function private.is_sample_designer(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users p
    join public.departments d on d.id = p.department_id
    join public.user_roles ur on ur.user_id = p.id
    join public.roles r on r.id = ur.role_id
    where p.id = p_user_id
      and p.is_active
      and lower(btrim(d.name)) = 'sample'
      and lower(btrim(r.name)) = 'designer'
  )
$$;

-- Which samples the signed-in person sees:
--   All           -> every sample
--   Self          -> samples they entered or are the designer of
--   Department(s) -> also samples whose enterer or designer belongs to one of their departments
create function private.can_see_sample(p_created_by uuid, p_designer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users me
    where me.auth_user_id = (select auth.uid())
      and me.is_active
      and me.can_sign_in
      and (
        me.authority = 'all'
        or me.id in (p_created_by, p_designer_id)
        or (
          me.authority = 'departments'
          and exists (
            select 1
            from public.app_users p
            join public.user_authority_departments ad on ad.department_id = p.department_id
            where p.id in (p_created_by, p_designer_id) and ad.user_id = me.id
          )
        )
      )
  )
$$;

revoke all on function private.can_create_samples() from public;
revoke all on function private.is_sample_designer(uuid) from public;
revoke all on function private.can_see_sample(uuid, uuid) from public;
grant execute on function private.can_create_samples() to authenticated;
grant execute on function private.can_see_sample(uuid, uuid) to authenticated;

alter table public.samples enable row level security;
create policy "People see the samples their authority allows" on public.samples
  for select to authenticated
  using ((select private.can_see_sample(created_by, designer_id)));
revoke all on public.samples from anon, authenticated;
grant select on public.samples to authenticated;

alter table public.sample_remarks enable row level security;
create policy "People see remarks of samples they can see" on public.sample_remarks
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id));
revoke all on public.sample_remarks from anon, authenticated;
grant select on public.sample_remarks to authenticated;

-- ---------- The only way a sample is created or changed ---------------
-- p_id null  -> create. Gives out the next SAMPLE NO of the chosen series.
-- p_id given -> change (authority All only). SAMPLE NO never changes.
-- p_remarks  -> [{ id?, kind, body?, file_path? }]. Entries with an id are kept as they
--               are, entries without one are added, and anything missing is removed.

create function public.save_sample(
  p_id uuid,
  p_series_id uuid,
  p_creation_date date,
  p_designer_id uuid,
  p_concept_image_path text,
  p_reference_option_id uuid,
  p_reference_image_path text,
  p_remarks jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_remarks jsonb := coalesce(p_remarks, '[]'::jsonb);
  v_concept text := nullif(btrim(p_concept_image_path), '');
  v_reference_image text := nullif(btrim(p_reference_image_path), '');
  v_old public.samples;
  v_prefix text;
  v_number bigint;
  v_id uuid;
  v_no text;
  v_keep uuid[];
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if p_creation_date is null then
    raise exception 'Creation date is required';
  end if;
  if p_creation_date > v_today then
    raise exception 'Creation date cannot be in the future';
  end if;
  if p_designer_id is null then
    raise exception 'Designer is required';
  end if;
  if v_concept is null then
    raise exception 'Concept image is required';
  end if;
  if jsonb_typeof(v_remarks) <> 'array' then
    raise exception 'Remarks are not in the expected form';
  end if;

  if p_id is null then
    if not private.can_create_samples() then
      raise exception 'Only people with the role Designer or authority All can create a sample';
    end if;
    if not private.is_sample_designer(p_designer_id) then
      raise exception 'The designer must be an active person in department Sample with the role Designer';
    end if;

    update public.sample_series
    set last_number = coalesce(last_number, start_number - 1) + 1
    where id = p_series_id and is_active
    returning prefix, last_number into v_prefix, v_number;
    if v_prefix is null then
      raise exception 'Choose an active prefix';
    end if;

    v_no := v_prefix || '-' || v_number;
    insert into public.samples
      (sample_no, series_id, series_number, creation_date, designer_id, concept_image_path,
       reference_option_id, reference_image_path, created_by)
    values
      (v_no, p_series_id, v_number, p_creation_date, p_designer_id, v_concept,
       p_reference_option_id, v_reference_image, v_me)
    returning id into v_id;
  else
    if not private.is_admin() then
      raise exception 'Only people with authority All can change a sample';
    end if;
    select * into v_old from public.samples where id = p_id for update;
    if not found then
      raise exception 'Sample not found';
    end if;
    if p_designer_id <> v_old.designer_id and not private.is_sample_designer(p_designer_id) then
      raise exception 'The designer must be an active person in department Sample with the role Designer';
    end if;

    update public.samples
    set creation_date = p_creation_date,
        designer_id = p_designer_id,
        concept_image_path = v_concept,
        reference_option_id = p_reference_option_id,
        reference_image_path = v_reference_image
    where id = p_id;
    v_id := p_id;
    v_no := v_old.sample_no;
  end if;

  select coalesce(array_agg((e ->> 'id')::uuid), '{}')
  into v_keep
  from jsonb_array_elements(v_remarks) as e
  where nullif(e ->> 'id', '') is not null;

  delete from public.sample_remarks
  where sample_id = v_id and id <> all (v_keep);

  insert into public.sample_remarks (sample_id, kind, body, file_path, created_by)
  select v_id,
         e ->> 'kind',
         case when e ->> 'kind' = 'text' then btrim(e ->> 'body') end,
         case when e ->> 'kind' in ('voice', 'image') then e ->> 'file_path' end,
         v_me
  from jsonb_array_elements(v_remarks) as e
  where nullif(e ->> 'id', '') is null;

  return v_no;
end
$$;

revoke all on function public.save_sample(uuid, uuid, date, uuid, text, uuid, text, jsonb) from public, anon;
grant execute on function public.save_sample(uuid, uuid, date, uuid, text, uuid, text, jsonb) to authenticated;

-- ---------- Private file store for sample pictures and voice notes ----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('samples', 'samples', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp',
              'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav']);

-- A file can be viewed by the person who uploaded it, by authority All, and by
-- anyone who can see the sample it belongs to.
create policy "People can view files of samples they can see" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'samples'
    and (select private.current_app_user_id()) is not null
    and (
      owner_id = (select auth.uid())::text
      or (select private.is_admin())
      or exists (
        select 1 from public.samples s
        where s.concept_image_path = storage.objects.name
           or s.reference_image_path = storage.objects.name
      )
      or exists (
        select 1 from public.sample_remarks r
        where r.file_path = storage.objects.name
      )
    )
  );
create policy "Sample creators can add files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'samples' and (select private.can_create_samples()));
