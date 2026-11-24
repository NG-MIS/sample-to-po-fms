-- =====================================================================
-- Category details of a sample: denim type, product type and collection.
-- (PCS type is not stored: it is the number of components on the sample.)
-- =====================================================================

-- ---------- Two new masters (simple lists, like departments) ----------

create table public.product_types (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);

do $$
declare
  t text;
begin
  foreach t in array array['product_types', 'collections'] loop
    execute format('create unique index %I on public.%I (lower(btrim(name)))', t || '_name_key', t);
    execute format('create index %I on public.%I (created_by)', t || '_created_by_idx', t);
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

-- Starting entries given by Nihal on 24 Nov 2026. More are added from the screens.
insert into public.product_types (name) values
  ('CAPRI SET'), ('PLAZZO SET'), ('FULL PANT SET'), ('HOT PANT SET'), ('SKIRT TOP'), ('FROCK'), ('KURTI SET');
insert into public.collections (name) values
  ('EID 2027'), ('SUMMER 2027');

-- ---------- New columns on samples ------------------------------------
-- They are empty on samples created before this change, and required from now on.

alter table public.samples
  add column denim_type text check (denim_type in ('denim', 'non_denim')),
  add column product_type_id uuid references public.product_types (id),
  add column collection_id uuid references public.collections (id);
create index samples_product_type_id_idx on public.samples (product_type_id);
create index samples_collection_id_idx on public.samples (collection_id);

-- ---------- save_sample now also takes the category details -----------

drop function public.save_sample(uuid, uuid, date, uuid, text, uuid, text, jsonb, uuid[]);

create function public.save_sample(
  p_id uuid,
  p_series_id uuid,
  p_creation_date date,
  p_designer_id uuid,
  p_concept_image_path text,
  p_reference_option_id uuid,
  p_reference_image_path text,
  p_remarks jsonb,
  p_component_ids uuid[],
  p_denim_type text,
  p_product_type_id uuid,
  p_collection_id uuid
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
  v_active boolean;
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
  if p_denim_type is null or p_denim_type not in ('denim', 'non_denim') then
    raise exception 'Choose the denim type: Denim or Non denim';
  end if;
  if p_product_type_id is null then
    raise exception 'Product type is required';
  end if;
  if p_collection_id is null then
    raise exception 'Collection is required';
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

  if p_id is not null then
    if not private.is_admin() then
      raise exception 'Only people with authority All can change a sample';
    end if;
    select * into v_old from public.samples where id = p_id for update;
    if not found then
      raise exception 'Sample not found';
    end if;
  end if;

  -- A product type or collection being newly chosen must be active. One already
  -- on the sample may stay even if it was switched inactive since.
  select is_active into v_active from public.product_types where id = p_product_type_id;
  if v_active is null then
    raise exception 'The chosen product type does not exist';
  end if;
  if not v_active and p_product_type_id is distinct from v_old.product_type_id then
    raise exception 'The chosen product type is inactive';
  end if;
  select is_active into v_active from public.collections where id = p_collection_id;
  if v_active is null then
    raise exception 'The chosen collection does not exist';
  end if;
  if not v_active and p_collection_id is distinct from v_old.collection_id then
    raise exception 'The chosen collection is inactive';
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
       reference_option_id, reference_image_path, denim_type, product_type_id, collection_id, created_by)
    values
      (v_no, p_series_id, v_number, p_creation_date, p_designer_id, v_concept,
       p_reference_option_id, v_reference_image, p_denim_type, p_product_type_id, p_collection_id, v_me)
    returning id into v_id;
  else
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
        reference_image_path = v_reference_image,
        denim_type = p_denim_type,
        product_type_id = p_product_type_id,
        collection_id = p_collection_id
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

revoke all on function public.save_sample(uuid, uuid, date, uuid, text, uuid, text, jsonb, uuid[], text, uuid, uuid) from public, anon;
grant execute on function public.save_sample(uuid, uuid, date, uuid, text, uuid, text, jsonb, uuid[], text, uuid, uuid) to authenticated;
