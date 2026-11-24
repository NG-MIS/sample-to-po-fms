-- =====================================================================
-- Fabric list of a sample.
--   * New master: Fabric vendors (vendor name + vendor code). The sample
--     screens show the code.
--   * New master: Fabrics (the fabric names). A name that is not in the
--     list yet can be typed on a sample and is added when it is saved.
--   * Every sample has its own fabric lines: fabric, for which of the
--     sample's components, vendor code, rate. All optional, entered while
--     creating the sample or later.
--   * Later changes: the sample's designer, or department authority over
--     Sample (the same people who update its images). Not on a closed sample.
-- =====================================================================

-- ---------- Fabric vendors master -------------------------------------

create table public.fabric_vendors (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  code text not null check (btrim(code) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index fabric_vendors_name_key on public.fabric_vendors (lower(btrim(name)));
create unique index fabric_vendors_code_key on public.fabric_vendors (lower(btrim(code)));
create index fabric_vendors_created_by_idx on public.fabric_vendors (created_by);
create trigger stamp_row before insert on public.fabric_vendors
  for each row execute function private.stamp_row();

alter table public.fabric_vendors enable row level security;
create policy "Signed-in people can view" on public.fabric_vendors
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.fabric_vendors
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.fabric_vendors
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.fabric_vendors from anon, authenticated;
grant select, insert (name, code, is_active), update (name, code, is_active)
  on public.fabric_vendors to authenticated;

-- ---------- Fabrics master (a simple list of names) -------------------

create table public.fabrics (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index fabrics_name_key on public.fabrics (lower(btrim(name)));
create index fabrics_created_by_idx on public.fabrics (created_by);
create trigger stamp_row before insert on public.fabrics
  for each row execute function private.stamp_row();

alter table public.fabrics enable row level security;
create policy "Signed-in people can view" on public.fabrics
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.fabrics
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.fabrics
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.fabrics from anon, authenticated;
grant select, insert (name, is_active), update (name, is_active) on public.fabrics to authenticated;

-- ---------- Fabric lines of a sample ----------------------------------

create table public.sample_fabrics (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  sample_id uuid not null references public.samples (id) on delete cascade,
  fabric_id uuid not null references public.fabrics (id),
  vendor_id uuid references public.fabric_vendors (id),
  rate numeric(12, 2) check (rate is null or rate >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id),
  updated_at timestamptz,
  updated_by uuid references public.app_users (id)
);
create index sample_fabrics_sample_id_idx on public.sample_fabrics (sample_id);
create index sample_fabrics_fabric_id_idx on public.sample_fabrics (fabric_id);
create index sample_fabrics_vendor_id_idx on public.sample_fabrics (vendor_id);
create index sample_fabrics_created_by_idx on public.sample_fabrics (created_by);
create index sample_fabrics_updated_by_idx on public.sample_fabrics (updated_by);

alter table public.sample_fabrics enable row level security;
create policy "People see fabrics of samples they can see" on public.sample_fabrics
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id));
revoke all on public.sample_fabrics from anon, authenticated;
grant select on public.sample_fabrics to authenticated;

-- Which of the sample's components a fabric line is for.
create table public.sample_fabric_components (
  sample_fabric_id uuid not null references public.sample_fabrics (id) on delete cascade,
  component_id uuid not null references public.components (id),
  primary key (sample_fabric_id, component_id)
);
create index sample_fabric_components_component_id_idx on public.sample_fabric_components (component_id);

alter table public.sample_fabric_components enable row level security;
create policy "People see this for fabric lines they can see" on public.sample_fabric_components
  for select to authenticated
  using (exists (select 1 from public.sample_fabrics f where f.id = sample_fabric_id));
revoke all on public.sample_fabric_components from anon, authenticated;
grant select on public.sample_fabric_components to authenticated;

-- ---------- Writing the fabric list -----------------------------------
-- p_lines is the whole fabric list of the sample, in this form:
--   [{ id, fabric_id, new_fabric, component_ids, vendor_id, rate }]
--   id         -> an existing line (kept and updated); empty for a new line.
--   fabric_id  -> a fabric from the list, or
--   new_fabric -> a typed name: the one in the list is used, or it is added.
-- Lines of the sample that are not in p_lines are removed.
-- This inner routine does no permission check; its callers do.

create function private.write_sample_fabrics(p_sample_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  e jsonb;
  v_id uuid;
  v_fabric_id uuid;
  v_name text;
  v_vendor_id uuid;
  v_rate numeric;
  v_components uuid[];
  v_keep uuid[] := '{}';
  v_fabric public.fabrics;
  v_old public.sample_fabrics;
  v_active boolean;
begin
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'The fabric list is not in the expected form';
  end if;

  for e in select * from jsonb_array_elements(v_lines) loop
    v_id := nullif(e ->> 'id', '')::uuid;
    v_fabric_id := nullif(e ->> 'fabric_id', '')::uuid;
    v_name := btrim(regexp_replace(coalesce(e ->> 'new_fabric', ''), '\s+', ' ', 'g'));
    v_vendor_id := nullif(e ->> 'vendor_id', '')::uuid;
    v_rate := nullif(btrim(e ->> 'rate'), '')::numeric;
    select coalesce(array_agg(distinct c::uuid), '{}') into v_components
    from jsonb_array_elements_text(
      case when jsonb_typeof(e -> 'component_ids') = 'array' then e -> 'component_ids' else '[]'::jsonb end
    ) as c;

    v_old := null;
    if v_id is not null then
      select * into v_old from public.sample_fabrics where id = v_id and sample_id = p_sample_id;
      if not found then
        raise exception 'A fabric line was not found. Reload the screen and try again';
      end if;
    end if;

    if v_fabric_id is null and v_name <> '' then
      if char_length(v_name) > 80 then
        raise exception 'A fabric name can be at most 80 characters long';
      end if;
      insert into public.fabrics (name) values (v_name)
      on conflict (lower(btrim(name))) do nothing;
      select id into v_fabric_id from public.fabrics where lower(btrim(name)) = lower(v_name);
    end if;
    if v_fabric_id is null then
      raise exception 'Every fabric line needs a fabric name';
    end if;
    select * into v_fabric from public.fabrics where id = v_fabric_id;
    if not found then
      raise exception 'A chosen fabric does not exist';
    end if;
    if not v_fabric.is_active and v_fabric_id is distinct from v_old.fabric_id then
      raise exception 'The fabric % is in the list but inactive. A person with authority All can switch it on in Masters', v_fabric.name;
    end if;

    if v_vendor_id is not null then
      select is_active into v_active from public.fabric_vendors where id = v_vendor_id;
      if v_active is null then
        raise exception 'A chosen fabric vendor does not exist';
      end if;
      if not v_active and v_vendor_id is distinct from v_old.vendor_id then
        raise exception 'A newly chosen fabric vendor is inactive';
      end if;
    end if;

    if v_rate is not null and v_rate < 0 then
      raise exception 'Rate cannot be less than zero';
    end if;

    if exists (
      select 1 from unnest(v_components) as c
      where not exists (
        select 1 from public.sample_components sc
        where sc.sample_id = p_sample_id and sc.component_id = c
      )
    ) then
      raise exception 'A fabric can only be for components of this sample';
    end if;

    if v_id is null then
      insert into public.sample_fabrics (sample_id, fabric_id, vendor_id, rate, created_by)
      values (p_sample_id, v_fabric_id, v_vendor_id, v_rate, v_me)
      returning id into v_id;
    elsif (v_old.fabric_id, v_old.vendor_id, v_old.rate) is distinct from (v_fabric_id, v_vendor_id, round(v_rate, 2)) then
      update public.sample_fabrics
      set fabric_id = v_fabric_id, vendor_id = v_vendor_id, rate = v_rate, updated_at = now(), updated_by = v_me
      where id = v_id;
    end if;

    delete from public.sample_fabric_components
    where sample_fabric_id = v_id and component_id <> all (v_components);
    insert into public.sample_fabric_components (sample_fabric_id, component_id)
    select v_id, c from unnest(v_components) as c
    on conflict do nothing;

    v_keep := v_keep || v_id;
  end loop;

  delete from public.sample_fabrics
  where sample_id = p_sample_id and id <> all (v_keep);
end
$$;
revoke all on function private.write_sample_fabrics(uuid, jsonb) from public;

-- Changing the fabric list of a sample after it was created.
create function public.save_sample_fabrics(p_sample_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_app_user_id() is null then
    raise exception 'You are not signed in';
  end if;
  if not exists (select 1 from public.samples where id = p_sample_id) then
    raise exception 'Sample not found';
  end if;
  if not private.can_work_on_sample(p_sample_id) then
    raise exception 'Only the designer of this sample, or a person with department authority over Sample, can change its fabric list';
  end if;
  if private.is_sample_closed(p_sample_id) then
    raise exception 'This sample is closed because its initial approval is No. Nothing more can be done on it';
  end if;
  perform private.write_sample_fabrics(p_sample_id, p_lines);
end
$$;
revoke all on function public.save_sample_fabrics(uuid, jsonb) from public, anon;
grant execute on function public.save_sample_fabrics(uuid, jsonb) to authenticated;

-- Saving a sample together with its fabric list, in one go: the sample form
-- uses this. Who may save the sample is decided by save_sample as before.
-- p_fabrics null -> the fabric list is left as it is.
create function public.save_sample_with_fabrics(
  p_id uuid,
  p_series_id uuid,
  p_creation_date date,
  p_designer_id uuid,
  p_concept_image_path text,
  p_reference_ids uuid[],
  p_remarks jsonb,
  p_component_ids uuid[],
  p_denim_type text,
  p_product_type_id uuid,
  p_collection_id uuid,
  p_tag_ids uuid[],
  p_new_tags text[],
  p_fabrics jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no text;
  v_id uuid;
begin
  v_no := public.save_sample(
    p_id, p_series_id, p_creation_date, p_designer_id, p_concept_image_path, p_reference_ids, p_remarks,
    p_component_ids, p_denim_type, p_product_type_id, p_collection_id, p_tag_ids, p_new_tags
  );
  select id into v_id from public.samples where sample_no = v_no;

  if p_fabrics is not null then
    if private.is_sample_closed(v_id) then
      raise exception 'This sample is closed because its initial approval is No. Its fabric list cannot be changed';
    end if;
    perform private.write_sample_fabrics(v_id, p_fabrics);
  end if;

  -- A component taken off the sample is also taken off its fabric lines.
  delete from public.sample_fabric_components fc
  using public.sample_fabrics f
  where f.id = fc.sample_fabric_id
    and f.sample_id = v_id
    and not exists (
      select 1 from public.sample_components sc
      where sc.sample_id = v_id and sc.component_id = fc.component_id
    );

  return v_no;
end
$$;
revoke all on function public.save_sample_with_fabrics(uuid, uuid, date, uuid, text, uuid[], jsonb, uuid[], text, uuid, uuid, uuid[], text[], jsonb) from public, anon;
grant execute on function public.save_sample_with_fabrics(uuid, uuid, date, uuid, text, uuid[], jsonb, uuid[], text, uuid, uuid, uuid[], text[], jsonb) to authenticated;
