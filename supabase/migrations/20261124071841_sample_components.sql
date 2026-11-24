-- =====================================================================
-- Components: a master list, and the components picked on each sample.
-- A sample must have at least one component.
-- =====================================================================

-- ---------- Components master (a simple list, like departments) -------

create table public.components (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index components_name_key on public.components (lower(btrim(name)));
create index components_created_by_idx on public.components (created_by);
create trigger stamp_row before insert on public.components
  for each row execute function private.stamp_row();

alter table public.components enable row level security;
create policy "Signed-in people can view" on public.components
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.components
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.components
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.components from anon, authenticated;
grant select, insert (name, is_active), update (name, is_active)
  on public.components to authenticated;

-- ---------- Components of a sample ------------------------------------

create table public.sample_components (
  sample_id uuid not null references public.samples (id) on delete cascade,
  component_id uuid not null references public.components (id),
  primary key (sample_id, component_id)
);
create index sample_components_component_id_idx on public.sample_components (component_id);

alter table public.sample_components enable row level security;
create policy "People see components of samples they can see" on public.sample_components
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id));
revoke all on public.sample_components from anon, authenticated;
grant select on public.sample_components to authenticated;

-- ---------- save_sample now also takes the components -----------------
-- p_component_ids -> the components of the sample. At least one is required.
--                    Components being added must be active; ones already on
--                    the sample may stay even if they were switched inactive.

drop function public.save_sample(uuid, uuid, date, uuid, text, uuid, text, jsonb);

create function public.save_sample(
  p_id uuid,
  p_series_id uuid,
  p_creation_date date,
  p_designer_id uuid,
  p_concept_image_path text,
  p_reference_option_id uuid,
  p_reference_image_path text,
  p_remarks jsonb,
  p_component_ids uuid[]
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
  v_components uuid[];
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

  select coalesce(array_agg(distinct c), '{}') into v_components
  from unnest(coalesce(p_component_ids, '{}')) as c
  where c is not null;
  if cardinality(v_components) = 0 then
    raise exception 'Choose at least one component';
  end if;
  if (select count(*) from public.components where id = any (v_components)) <> cardinality(v_components) then
    raise exception 'A chosen component does not exist';
  end if;

  if p_id is null then
    if not private.can_create_samples() then
      raise exception 'Only people with the role Designer or authority All can create a sample';
    end if;
    if not private.is_sample_designer(p_designer_id) then
      raise exception 'The designer must be an active person in department Sample with the role Designer';
    end if;
    if exists (select 1 from public.components where id = any (v_components) and not is_active) then
      raise exception 'A chosen component is inactive';
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
    if exists (
      select 1
      from public.components c
      where c.id = any (v_components)
        and not c.is_active
        and not exists (
          select 1 from public.sample_components sc
          where sc.sample_id = p_id and sc.component_id = c.id
        )
    ) then
      raise exception 'A newly chosen component is inactive';
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

  delete from public.sample_components
  where sample_id = v_id and component_id <> all (v_components);
  insert into public.sample_components (sample_id, component_id)
  select v_id, c from unnest(v_components) as c
  on conflict do nothing;

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

revoke all on function public.save_sample(uuid, uuid, date, uuid, text, uuid, text, jsonb, uuid[]) from public, anon;
grant execute on function public.save_sample(uuid, uuid, date, uuid, text, uuid, text, jsonb, uuid[]) to authenticated;
