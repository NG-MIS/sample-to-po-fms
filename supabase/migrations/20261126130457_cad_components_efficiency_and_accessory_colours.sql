-- =====================================================================
-- CAD rows: the components each row is for, and its efficiency %.
-- Accessories (primary accessory list and the accessory material lists):
--   general        - comes in one colour; that colour can be named
--   colour specific - ordered colour by colour, following the base colour
--                     of the garment or an alternate (contrast) colour
-- =====================================================================

alter table public.cad_rows
  add column component_ids uuid[] not null default '{}',
  add column efficiency numeric(5, 2) check (efficiency is null or (efficiency >= 0 and efficiency <= 100));

alter table public.primary_accessory_lines
  add column colour_specific boolean not null default false,
  add column colour_follows text check (colour_follows in ('base', 'alternate')),
  add column colour text,
  add constraint primary_accessory_lines_colour check (
    (colour_specific and colour_follows is not null and colour is null)
    or (not colour_specific and colour_follows is null)
  );

alter table public.material_items
  add column colour_follows text check (colour_follows in ('base', 'alternate')),
  add column colour text,
  add constraint material_items_colour check (
    (colour_specific and colour is null) or (not colour_specific and colour_follows is null)
  );

-- The colour of a general accessory, tidy and added to the Colours list.
create function private.keep_colour(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(private.tidy_name(p_name), 60);
begin
  if v_name = '' then
    return null;
  end if;
  insert into public.colours (name) values (v_name) on conflict (lower(btrim(name))) do nothing;
  return (select name from public.colours where lower(btrim(name)) = lower(v_name));
end
$$;
revoke all on function private.keep_colour(text) from public;

-- ---------- Saving a CAD (rows now carry components and efficiency) ----

create or replace function public.save_cad(p_id uuid, p_sample_id uuid, p_size_ratio_id uuid, p_rows jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_sample public.samples;
  v_cad public.cads;
  v_active boolean;
  e jsonb;
  v_row_id uuid;
  v_particular_id uuid;
  v_name text;
  v_type text;
  v_components uuid[];
  v_efficiency numeric;
  v_keep uuid[] := '{}';
  v_position integer := 0;
  v_seq integer;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not private.is_cad() then
    raise exception 'Only people in department CAD can add or change a CAD';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'A CAD needs at least one drawing row';
  end if;

  if p_id is null then
    select * into v_sample from public.samples where id = p_sample_id for update;
    if not found then
      raise exception 'Sample not found';
    end if;
    if not private.sample_is_approved(p_sample_id) then
      raise exception 'A CAD can be made only for a sample whose final approval is Yes';
    end if;
  else
    select * into v_cad from public.cads where id = p_id for update;
    if not found then
      raise exception 'CAD not found';
    end if;
    select * into v_sample from public.samples where id = v_cad.sample_id;
    if p_size_ratio_id is distinct from v_cad.size_ratio_id
      and exists (select 1 from public.cad_wishlist where cad_id = p_id) then
      raise exception 'This CAD is assigned to wishlist items, so its size and ratio cannot be changed';
    end if;
  end if;

  select is_active into v_active from public.size_ratios where id = p_size_ratio_id;
  if v_active is null then
    raise exception 'Choose the size, and the ratio when the size has ratios';
  end if;
  if not v_active and p_size_ratio_id is distinct from v_cad.size_ratio_id then
    raise exception 'The chosen size and ratio is inactive';
  end if;

  if p_id is null then
    select coalesce(max(seq), 0) + 1 into v_seq from public.cads where sample_id = v_sample.id;
    insert into public.cads (cad_no, sample_id, seq, size_ratio_id, created_by)
    values (v_sample.sample_no || '-CAD-' || v_seq, v_sample.id, v_seq, p_size_ratio_id, v_me)
    returning * into v_cad;
  else
    update public.cads set size_ratio_id = p_size_ratio_id, updated_at = now(), updated_by = v_me
    where id = p_id;
  end if;

  for e in select * from jsonb_array_elements(p_rows) loop
    v_position := v_position + 1;
    v_row_id := nullif(e ->> 'id', '')::uuid;
    v_particular_id := nullif(e ->> 'particular_id', '')::uuid;
    v_name := private.tidy_name(e ->> 'new_particular');
    v_type := e ->> 'fabric_type';

    if v_particular_id is null and v_name <> '' then
      if char_length(v_name) > 80 then
        raise exception 'Particulars can be at most 80 characters long';
      end if;
      insert into public.cad_particulars (name) values (v_name)
      on conflict (lower(btrim(name))) do nothing;
      select id into v_particular_id from public.cad_particulars where lower(btrim(name)) = lower(v_name);
    end if;
    if v_particular_id is null or not exists (select 1 from public.cad_particulars where id = v_particular_id) then
      raise exception 'Every drawing row needs its particulars';
    end if;
    if v_type is null or v_type not in ('primary', 'secondary') then
      raise exception 'Choose the fabric type of every drawing row: Primary or Secondary';
    end if;

    -- the components this row is for: one or more, from the components of the sample
    select coalesce(array_agg(distinct c::uuid), '{}') into v_components
    from jsonb_array_elements_text(case when jsonb_typeof(e -> 'component_ids') = 'array' then e -> 'component_ids' else '[]'::jsonb end) as c;
    if cardinality(v_components) = 0 then
      raise exception 'Choose the components of every drawing row';
    end if;
    if exists (
      select 1 from unnest(v_components) as c
      where not exists (select 1 from public.sample_components sc where sc.sample_id = v_sample.id and sc.component_id = c)
    ) then
      raise exception 'A drawing row has a component that is not one of the components of the sample';
    end if;
    v_efficiency := round(nullif(btrim(e ->> 'efficiency'), '')::numeric, 2);
    if v_efficiency < 0 or v_efficiency > 100 then
      raise exception 'Efficiency is a percentage from 0 to 100';
    end if;

    if v_row_id is null then
      insert into public.cad_rows (cad_id, position, particular_id, fabric_type, msrmnt, paina, pcs_in_layer, panels, component_ids, efficiency)
      values (
        v_cad.id, v_position, v_particular_id, v_type,
        nullif(btrim(e ->> 'msrmnt'), '')::numeric, nullif(btrim(e ->> 'paina'), '')::numeric,
        nullif(btrim(e ->> 'pcs_in_layer'), '')::integer, nullif(btrim(e ->> 'panels'), '')::integer,
        v_components, v_efficiency
      )
      returning id into v_row_id;
    else
      update public.cad_rows
      set position = v_position, particular_id = v_particular_id, fabric_type = v_type,
          msrmnt = nullif(btrim(e ->> 'msrmnt'), '')::numeric, paina = nullif(btrim(e ->> 'paina'), '')::numeric,
          pcs_in_layer = nullif(btrim(e ->> 'pcs_in_layer'), '')::integer, panels = nullif(btrim(e ->> 'panels'), '')::integer,
          component_ids = v_components, efficiency = v_efficiency
      where id = v_row_id and cad_id = v_cad.id;
      if not found then
        raise exception 'A drawing row was not found. Reload the screen and try again';
      end if;
    end if;
    v_keep := v_keep || v_row_id;
  end loop;

  delete from public.cad_rows where cad_id = v_cad.id and id <> all (v_keep);
  return v_cad.cad_no;
end
$$;

-- ---------- The primary accessory list (now with the colour choice) ----
-- line: { accessory_id, new_accessory, qty_type, groups, colour_specific, colour_follows, colour }

create or replace function public.save_primary_accessories(p_sample_id uuid, p_size_ratio_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_sizes text[];
  e jsonb;
  v_accessory_id uuid;
  v_name text;
  v_groups jsonb;
  v_specific boolean;
  v_position integer := 0;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not private.is_cad() then
    raise exception 'Only people in department CAD can set up a primary accessory list';
  end if;
  perform 1 from public.samples where id = p_sample_id for update;
  if not found then
    raise exception 'Sample not found';
  end if;
  if not private.sample_is_approved(p_sample_id) then
    raise exception 'A primary accessory list can be made only for a sample whose final approval is Yes';
  end if;
  select sizes into v_sizes from public.size_ratios where id = p_size_ratio_id;
  if v_sizes is null then
    raise exception 'Choose the size, and the ratio when the size has ratios';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'The accessory list is not in the expected form';
  end if;

  delete from public.primary_accessory_lines where sample_id = p_sample_id and size_ratio_id = p_size_ratio_id;

  for e in select * from jsonb_array_elements(p_lines) loop
    v_position := v_position + 1;
    v_accessory_id := nullif(e ->> 'accessory_id', '')::uuid;
    v_name := private.tidy_name(e ->> 'new_accessory');

    if v_accessory_id is null and v_name <> '' then
      if char_length(v_name) > 80 then
        raise exception 'An accessory name can be at most 80 characters long';
      end if;
      insert into public.accessories (name) values (v_name)
      on conflict (lower(btrim(name))) do nothing;
      select id into v_accessory_id from public.accessories where lower(btrim(name)) = lower(v_name);
    end if;
    if v_accessory_id is null or not exists (select 1 from public.accessories where id = v_accessory_id) then
      raise exception 'Every accessory line needs an accessory name';
    end if;
    v_groups := private.clean_accessory_groups(e ->> 'qty_type', e -> 'groups', v_sizes);
    v_specific := coalesce((e ->> 'colour_specific')::boolean, false);
    if v_specific and coalesce(e ->> 'colour_follows', '') not in ('base', 'alternate') then
      raise exception 'For every colour specific accessory, choose Base colour or Alternate colour';
    end if;

    insert into public.primary_accessory_lines
      (sample_id, size_ratio_id, position, accessory_id, qty_type, groups, colour_specific, colour_follows, colour, updated_by)
    values (
      p_sample_id, p_size_ratio_id, v_position, v_accessory_id, e ->> 'qty_type', v_groups,
      v_specific, case when v_specific then e ->> 'colour_follows' end,
      case when not v_specific then private.keep_colour(e ->> 'colour') end, v_me
    );
  end loop;
end
$$;

-- ---------- Saving a material list (accessories now with the colour choice)
--   fabric item:    { id, fabric_id, cad_row_id, msrmnt, pcs_in_layer, paina, vendor_id, rate }
--   accessory item: { id, accessory_id, new_accessory, qty_type, groups, colour_specific,
--                     colour_follows, colour, vendor_id, rate }

create or replace function public.save_material_list(p_wishlist_id uuid, p_kind text, p_items jsonb, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_entry public.wishlist_entries;
  v_sizes text[];
  v_fabric boolean;
  e jsonb;
  v_id uuid;
  v_keep uuid[] := '{}';
  v_position integer := 0;
  v_item_id uuid;
  v_name text;
  v_vendor uuid;
  v_groups jsonb;
  v_specific boolean;
  v_follows text;
  v_colour text;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if p_kind is null or p_kind not in ('primary_fabric', 'secondary_fabric', 'primary_accessory', 'secondary_accessory') then
    raise exception 'Unknown material list';
  end if;
  select * into v_entry from public.wishlist_entries where id = p_wishlist_id for update;
  if not found then
    raise exception 'Wishlist item not found';
  end if;
  if not private.can_work_on_sample(v_entry.sample_id) then
    raise exception 'Only the designer of this sample, or a person with department authority over Sample, can change its material lists';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The material list is not in the expected form';
  end if;
  select sizes into v_sizes from public.size_ratios where id = v_entry.size_ratio_id;
  v_fabric := p_kind in ('primary_fabric', 'secondary_fabric');

  for e in select * from jsonb_array_elements(p_items) loop
    v_position := v_position + 1;
    v_id := nullif(e ->> 'id', '')::uuid;
    v_vendor := nullif(e ->> 'vendor_id', '')::uuid;
    if v_id is not null then
      perform 1 from public.material_items where id = v_id and wishlist_entry_id = p_wishlist_id and kind = p_kind;
      if not found then
        raise exception 'A material was not found. Reload the screen and try again';
      end if;
      v_keep := v_keep || v_id;
      if private.material_item_locked(v_id) then
        continue;
      end if;
    end if;

    if v_fabric then
      v_item_id := nullif(e ->> 'fabric_id', '')::uuid;
      if v_item_id is null or not exists (select 1 from public.fabrics where id = v_item_id) then
        raise exception 'Every fabric line needs a fabric name';
      end if;
      if v_vendor is not null and not exists (select 1 from public.fabric_vendors where id = v_vendor) then
        raise exception 'A chosen fabric vendor does not exist';
      end if;
      if v_id is null then
        insert into public.material_items
          (wishlist_entry_id, kind, position, fabric_id, cad_row_id, msrmnt, pcs_in_layer, paina, fabric_vendor_id, rate, created_by)
        values (
          p_wishlist_id, p_kind, v_position, v_item_id, nullif(e ->> 'cad_row_id', '')::uuid,
          nullif(btrim(e ->> 'msrmnt'), '')::numeric, nullif(btrim(e ->> 'pcs_in_layer'), '')::integer,
          nullif(btrim(e ->> 'paina'), '')::numeric, v_vendor, round(nullif(btrim(e ->> 'rate'), '')::numeric, 2), v_me
        )
        returning id into v_id;
        v_keep := v_keep || v_id;
      else
        update public.material_items
        set position = v_position, fabric_id = v_item_id,
            msrmnt = nullif(btrim(e ->> 'msrmnt'), '')::numeric,
            pcs_in_layer = nullif(btrim(e ->> 'pcs_in_layer'), '')::integer,
            paina = nullif(btrim(e ->> 'paina'), '')::numeric,
            fabric_vendor_id = v_vendor, rate = round(nullif(btrim(e ->> 'rate'), '')::numeric, 2),
            updated_at = now(), updated_by = v_me
        where id = v_id;
      end if;
    else
      v_item_id := nullif(e ->> 'accessory_id', '')::uuid;
      v_name := private.tidy_name(e ->> 'new_accessory');
      if v_item_id is null and v_name <> '' then
        if char_length(v_name) > 80 then
          raise exception 'An accessory name can be at most 80 characters long';
        end if;
        insert into public.accessories (name) values (v_name)
        on conflict (lower(btrim(name))) do nothing;
        select id into v_item_id from public.accessories where lower(btrim(name)) = lower(v_name);
      end if;
      if v_item_id is null or not exists (select 1 from public.accessories where id = v_item_id) then
        raise exception 'Every accessory line needs an accessory name';
      end if;
      if v_vendor is not null and not exists (select 1 from public.accessory_vendors where id = v_vendor) then
        raise exception 'A chosen accessory vendor does not exist';
      end if;
      v_groups := private.clean_accessory_groups(e ->> 'qty_type', e -> 'groups', v_sizes);
      v_specific := coalesce((e ->> 'colour_specific')::boolean, false);
      if v_specific and coalesce(e ->> 'colour_follows', '') not in ('base', 'alternate') then
        raise exception 'For every colour specific accessory, choose Base colour or Alternate colour';
      end if;
      v_follows := case when v_specific then e ->> 'colour_follows' end;
      v_colour := case when not v_specific then private.keep_colour(e ->> 'colour') end;
      if v_id is null then
        insert into public.material_items
          (wishlist_entry_id, kind, position, accessory_id, qty_type, groups, colour_specific, colour_follows, colour, accessory_vendor_id, rate, created_by)
        values (
          p_wishlist_id, p_kind, v_position, v_item_id, e ->> 'qty_type', v_groups,
          v_specific, v_follows, v_colour, v_vendor, round(nullif(btrim(e ->> 'rate'), '')::numeric, 2), v_me
        )
        returning id into v_id;
        v_keep := v_keep || v_id;
      else
        update public.material_items
        set position = v_position, accessory_id = v_item_id, qty_type = e ->> 'qty_type', groups = v_groups,
            colour_specific = v_specific, colour_follows = v_follows, colour = v_colour,
            accessory_vendor_id = v_vendor, rate = round(nullif(btrim(e ->> 'rate'), '')::numeric, 2),
            updated_at = now(), updated_by = v_me
        where id = v_id;
      end if;
    end if;
  end loop;

  delete from public.material_items i
  where i.wishlist_entry_id = p_wishlist_id and i.kind = p_kind
    and i.id <> all (v_keep) and not private.material_item_locked(i.id);

  insert into public.material_lists (wishlist_entry_id, kind) values (p_wishlist_id, p_kind)
  on conflict do nothing;
  if coalesce(p_confirm, false) then
    update public.material_lists set confirmed_at = now(), confirmed_by = v_me
    where wishlist_entry_id = p_wishlist_id and kind = p_kind;
  end if;
end
$$;
