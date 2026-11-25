-- =====================================================================
-- 1. Design number: given to a sample after its final approval is Yes.
--    One plain running series; the next number is given on a click.
-- 2. Accessory list of a sample (sampling draft), like the fabric list:
--    accessory name, qty type (quantity / length / dimension), qty,
--    vendor code, rate, remarks. With an Accessories master (the names)
--    and an Accessory vendors master (vendor name + vendor code).
-- =====================================================================

-- ---------- Design number series (one row) ----------------------------

create table public.design_series (
  id boolean primary key default true check (id),
  start_number bigint check (start_number is null or start_number >= 1),
  last_number bigint
);
insert into public.design_series default values;

alter table public.design_series enable row level security;
create policy "Signed-in people can view" on public.design_series
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can change" on public.design_series
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.design_series from anon, authenticated;
grant select, update (start_number) on public.design_series to authenticated;

-- The starting number is locked once a design number has been given.
create function private.guard_design_series_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.last_number is not null and new.start_number is distinct from old.start_number then
    raise exception 'Design numbers have already been given, so the starting number is locked';
  end if;
  return new;
end
$$;
revoke all on function private.guard_design_series_update() from public;
create trigger guard_update before update on public.design_series
  for each row execute function private.guard_design_series_update();

alter table public.samples
  add column design_no bigint unique,
  add column design_no_at timestamptz,
  add column design_no_by uuid references public.app_users (id);
create index samples_design_no_by_idx on public.samples (design_no_by);

-- Gives the sample the next design number. Allowed for the people who
-- update the sample's images, and only after the final approval is Yes.
create function public.assign_design_number(p_sample_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_sample public.samples;
  v_number bigint;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  select * into v_sample from public.samples where id = p_sample_id for update;
  if not found then
    raise exception 'Sample not found';
  end if;
  if not private.can_work_on_sample(p_sample_id) then
    raise exception 'Only the designer of this sample, or a person with department authority over Sample, can give it a design number';
  end if;
  if v_sample.design_no is not null then
    raise exception 'This sample already has design number %', v_sample.design_no;
  end if;
  if not exists (
    select 1 from public.sample_approvals
    where sample_id = p_sample_id and stage = 'final' and decision = 'yes'
  ) then
    raise exception 'A design number can be given only after the final approval is Yes';
  end if;

  update public.design_series
  set last_number = coalesce(last_number, start_number - 1) + 1
  where start_number is not null
  returning last_number into v_number;
  if v_number is null then
    raise exception 'Set the starting design number in Masters, under Numbering, first';
  end if;

  update public.samples
  set design_no = v_number, design_no_at = now(), design_no_by = v_me
  where id = p_sample_id;
  return v_number;
end
$$;
revoke all on function public.assign_design_number(uuid) from public, anon;
grant execute on function public.assign_design_number(uuid) to authenticated;

-- Once a sample has a design number its final approval stays Yes.
create function private.keep_final_approval_of_designs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.stage = 'final' and old.decision = 'yes' and new.decision <> 'yes'
    and exists (select 1 from public.samples where id = old.sample_id and design_no is not null) then
    raise exception 'This sample already has a design number, so its final approval cannot be changed';
  end if;
  return new;
end
$$;
revoke all on function private.keep_final_approval_of_designs() from public;
create trigger keep_final_approval_of_designs before update on public.sample_approvals
  for each row execute function private.keep_final_approval_of_designs();

-- ---------- Accessory vendors master ----------------------------------

create table public.accessory_vendors (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  code text not null check (btrim(code) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index accessory_vendors_name_key on public.accessory_vendors (lower(btrim(name)));
create unique index accessory_vendors_code_key on public.accessory_vendors (lower(btrim(code)));
create index accessory_vendors_created_by_idx on public.accessory_vendors (created_by);
create trigger stamp_row before insert on public.accessory_vendors
  for each row execute function private.stamp_row();

alter table public.accessory_vendors enable row level security;
create policy "Signed-in people can view" on public.accessory_vendors
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.accessory_vendors
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.accessory_vendors
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.accessory_vendors from anon, authenticated;
grant select, insert (name, code, is_active), update (name, code, is_active)
  on public.accessory_vendors to authenticated;

-- ---------- Accessories master (a simple list of names) ---------------

create table public.accessories (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index accessories_name_key on public.accessories (lower(btrim(name)));
create index accessories_created_by_idx on public.accessories (created_by);
create trigger stamp_row before insert on public.accessories
  for each row execute function private.stamp_row();

alter table public.accessories enable row level security;
create policy "Signed-in people can view" on public.accessories
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.accessories
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.accessories
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.accessories from anon, authenticated;
grant select, insert (name, is_active), update (name, is_active) on public.accessories to authenticated;

-- ---------- Accessory lines of a sample -------------------------------
-- qty_type quantity  -> qty is a number of pieces
--          length    -> qty is a length in inches
--          dimension -> qty is the length and breadth the breadth, in inches

create table public.sample_accessories (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  sample_id uuid not null references public.samples (id) on delete cascade,
  accessory_id uuid not null references public.accessories (id),
  qty_type text check (qty_type in ('quantity', 'length', 'dimension')),
  qty numeric(12, 2) check (qty is null or qty >= 0),
  breadth numeric(12, 2) check (breadth is null or breadth >= 0),
  vendor_id uuid references public.accessory_vendors (id),
  rate numeric(12, 2) check (rate is null or rate >= 0),
  remarks text check (remarks is null or (btrim(remarks) <> '' and char_length(remarks) <= 500)),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id),
  updated_at timestamptz,
  updated_by uuid references public.app_users (id),
  constraint sample_accessories_qty_needs_type check (qty_type is not null or (qty is null and breadth is null)),
  constraint sample_accessories_breadth_only_for_dimension check (breadth is null or qty_type = 'dimension')
);
create index sample_accessories_sample_id_idx on public.sample_accessories (sample_id);
create index sample_accessories_accessory_id_idx on public.sample_accessories (accessory_id);
create index sample_accessories_vendor_id_idx on public.sample_accessories (vendor_id);
create index sample_accessories_created_by_idx on public.sample_accessories (created_by);
create index sample_accessories_updated_by_idx on public.sample_accessories (updated_by);

alter table public.sample_accessories enable row level security;
create policy "People see accessories of samples they can see" on public.sample_accessories
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id));
revoke all on public.sample_accessories from anon, authenticated;
grant select on public.sample_accessories to authenticated;

-- ---------- Writing the accessory list --------------------------------
-- p_lines is the whole accessory list of the sample:
--   [{ id, accessory_id, new_accessory, qty_type, qty, breadth, vendor_id, rate, remarks }]
-- Lines of the sample that are not in p_lines are removed.
-- This inner routine does no permission check; its callers do.

create function private.write_sample_accessories(p_sample_id uuid, p_lines jsonb)
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
  v_accessory_id uuid;
  v_name text;
  v_type text;
  v_qty numeric;
  v_breadth numeric;
  v_vendor_id uuid;
  v_rate numeric;
  v_remarks text;
  v_keep uuid[] := '{}';
  v_accessory public.accessories;
  v_old public.sample_accessories;
  v_active boolean;
begin
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'The accessory list is not in the expected form';
  end if;

  for e in select * from jsonb_array_elements(v_lines) loop
    v_id := nullif(e ->> 'id', '')::uuid;
    v_accessory_id := nullif(e ->> 'accessory_id', '')::uuid;
    v_name := btrim(regexp_replace(coalesce(e ->> 'new_accessory', ''), '\s+', ' ', 'g'));
    v_type := nullif(e ->> 'qty_type', '');
    v_qty := round(nullif(btrim(e ->> 'qty'), '')::numeric, 2);
    v_breadth := round(nullif(btrim(e ->> 'breadth'), '')::numeric, 2);
    v_vendor_id := nullif(e ->> 'vendor_id', '')::uuid;
    v_rate := round(nullif(btrim(e ->> 'rate'), '')::numeric, 2);
    v_remarks := nullif(btrim(e ->> 'remarks'), '');

    v_old := null;
    if v_id is not null then
      select * into v_old from public.sample_accessories where id = v_id and sample_id = p_sample_id;
      if not found then
        raise exception 'An accessory line was not found. Reload the screen and try again';
      end if;
    end if;

    if v_accessory_id is null and v_name <> '' then
      if char_length(v_name) > 80 then
        raise exception 'An accessory name can be at most 80 characters long';
      end if;
      insert into public.accessories (name) values (v_name)
      on conflict (lower(btrim(name))) do nothing;
      select id into v_accessory_id from public.accessories where lower(btrim(name)) = lower(v_name);
    end if;
    if v_accessory_id is null then
      raise exception 'Every accessory line needs an accessory name';
    end if;
    select * into v_accessory from public.accessories where id = v_accessory_id;
    if not found then
      raise exception 'A chosen accessory does not exist';
    end if;
    if not v_accessory.is_active and v_accessory_id is distinct from v_old.accessory_id then
      raise exception 'The accessory % is in the list but inactive. A person with authority All can switch it on in Masters', v_accessory.name;
    end if;

    if v_type is not null and v_type not in ('quantity', 'length', 'dimension') then
      raise exception 'Qty type must be Quantity, Length or Dimension';
    end if;
    if v_type is null and (v_qty is not null or v_breadth is not null) then
      raise exception 'Choose the qty type before entering a qty';
    end if;
    if v_type is distinct from 'dimension' and v_breadth is not null then
      raise exception 'Breadth is only for the qty type Dimension';
    end if;
    if v_qty < 0 or v_breadth < 0 then
      raise exception 'Qty cannot be less than zero';
    end if;
    if v_type = 'quantity' and v_qty <> trunc(v_qty) then
      raise exception 'A quantity in pieces must be a whole number';
    end if;

    if v_vendor_id is not null then
      select is_active into v_active from public.accessory_vendors where id = v_vendor_id;
      if v_active is null then
        raise exception 'A chosen accessory vendor does not exist';
      end if;
      if not v_active and v_vendor_id is distinct from v_old.vendor_id then
        raise exception 'A newly chosen accessory vendor is inactive';
      end if;
    end if;
    if v_rate < 0 then
      raise exception 'Rate cannot be less than zero';
    end if;
    if char_length(v_remarks) > 500 then
      raise exception 'Remarks on an accessory can be at most 500 characters long';
    end if;

    if v_id is null then
      insert into public.sample_accessories
        (sample_id, accessory_id, qty_type, qty, breadth, vendor_id, rate, remarks, created_by)
      values (p_sample_id, v_accessory_id, v_type, v_qty, v_breadth, v_vendor_id, v_rate, v_remarks, v_me)
      returning id into v_id;
    elsif (v_old.accessory_id, v_old.qty_type, v_old.qty, v_old.breadth, v_old.vendor_id, v_old.rate, v_old.remarks)
      is distinct from (v_accessory_id, v_type, v_qty, v_breadth, v_vendor_id, v_rate, v_remarks) then
      update public.sample_accessories
      set accessory_id = v_accessory_id, qty_type = v_type, qty = v_qty, breadth = v_breadth,
          vendor_id = v_vendor_id, rate = v_rate, remarks = v_remarks, updated_at = now(), updated_by = v_me
      where id = v_id;
    end if;

    v_keep := v_keep || v_id;
  end loop;

  delete from public.sample_accessories
  where sample_id = p_sample_id and id <> all (v_keep);
end
$$;
revoke all on function private.write_sample_accessories(uuid, jsonb) from public;

-- Changing the accessory list of a sample after it was created.
create function public.save_sample_accessories(p_sample_id uuid, p_lines jsonb)
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
    raise exception 'Only the designer of this sample, or a person with department authority over Sample, can change its accessory list';
  end if;
  if private.is_sample_closed(p_sample_id) then
    raise exception 'This sample is closed because its initial approval is No. Nothing more can be done on it';
  end if;
  perform private.write_sample_accessories(p_sample_id, p_lines);
end
$$;
revoke all on function public.save_sample_accessories(uuid, jsonb) from public, anon;
grant execute on function public.save_sample_accessories(uuid, jsonb) to authenticated;

-- ---------- The sample form saves fabrics and accessories together ----
-- Replaces save_sample_with_fabrics. p_fabrics / p_accessories null ->
-- that list is left as it is.

drop function public.save_sample_with_fabrics(uuid, uuid, date, uuid, text, uuid[], jsonb, uuid[], text, uuid, uuid, uuid[], text[], jsonb);

create function public.save_sample_with_materials(
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
  p_fabrics jsonb,
  p_accessories jsonb
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

  if (p_fabrics is not null or p_accessories is not null) and private.is_sample_closed(v_id) then
    raise exception 'This sample is closed because its initial approval is No. Its fabric and accessory lists cannot be changed';
  end if;
  if p_fabrics is not null then
    perform private.write_sample_fabrics(v_id, p_fabrics);
  end if;
  if p_accessories is not null then
    perform private.write_sample_accessories(v_id, p_accessories);
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
revoke all on function public.save_sample_with_materials(uuid, uuid, date, uuid, text, uuid[], jsonb, uuid[], text, uuid, uuid, uuid[], text[], jsonb, jsonb) from public, anon;
grant execute on function public.save_sample_with_materials(uuid, uuid, date, uuid, text, uuid[], jsonb, uuid[], text, uuid, uuid, uuid[], text[], jsonb, jsonb) to authenticated;
