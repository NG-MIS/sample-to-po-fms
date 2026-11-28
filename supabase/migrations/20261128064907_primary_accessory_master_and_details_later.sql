-- Primary accessories get their own master: which accessories are primary, and the
-- unit each one starts with on a primary accessory list. They stay in the one
-- accessories list (so material lists, POs and receiving keep working), marked primary.
-- A line of a primary accessory list can now be saved with its details still to fill.

alter table public.accessories
  add column is_primary boolean not null default false,
  add column default_qty_type text
    constraint accessories_default_qty_type_check check (default_qty_type = any (array['quantity'::text, 'length'::text, 'dimension'::text]));

grant select (is_primary, default_qty_type), insert (is_primary, default_qty_type), update (is_primary, default_qty_type)
  on public.accessories to authenticated;

-- Accessories already on a primary accessory list are primary, with the unit used there.
update public.accessories a
set is_primary = true,
    default_qty_type = (
      select l.qty_type from public.primary_accessory_lines l
      where l.accessory_id = a.id order by l.updated_at desc limit 1
    )
where exists (select 1 from public.primary_accessory_lines l where l.accessory_id = a.id);

alter table public.primary_accessory_lines add column details_filled boolean not null default true;
alter table public.primary_accessory_lines alter column qty_type drop not null;
alter table public.primary_accessory_lines drop constraint primary_accessory_lines_groups_check;
alter table public.primary_accessory_lines add constraint primary_accessory_lines_groups_check
  check (jsonb_typeof(groups) = 'array' and (not details_filled or (qty_type is not null and jsonb_array_length(groups) >= 1)));

create or replace function public.save_primary_accessories(p_sample_id uuid, p_size_ratio_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := private.current_app_user_id();
  v_sizes text[];
  e jsonb;
  v_accessory_id uuid;
  v_name text;
  v_type text;
  v_pending boolean;
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
    v_type := nullif(e ->> 'qty_type', '');
    -- the details (size groups and qty) can be filled later
    v_pending := coalesce((e ->> 'details_pending')::boolean, false);
    if v_type is not null and v_type not in ('quantity', 'length', 'dimension') then
      raise exception 'Choose the qty type of every accessory: Quantity, Length or Dimension';
    end if;

    -- a name typed here is added to the primary accessory master, with the unit chosen
    if v_accessory_id is null and v_name <> '' then
      if char_length(v_name) > 80 then
        raise exception 'An accessory name can be at most 80 characters long';
      end if;
      insert into public.accessories (name, is_primary, default_qty_type) values (v_name, true, v_type)
      on conflict (lower(btrim(name))) do nothing;
      select id into v_accessory_id from public.accessories where lower(btrim(name)) = lower(v_name);
    end if;
    if v_accessory_id is null or not exists (select 1 from public.accessories where id = v_accessory_id) then
      raise exception 'Every accessory line needs an accessory name';
    end if;
    if exists (
      select 1 from public.primary_accessory_lines
      where sample_id = p_sample_id and size_ratio_id = p_size_ratio_id and accessory_id = v_accessory_id
    ) then
      raise exception 'An accessory is on the list twice. Keep it once';
    end if;
    -- an accessory used on a primary accessory list is a primary accessory
    update public.accessories
    set is_primary = true, default_qty_type = coalesce(default_qty_type, v_type)
    where id = v_accessory_id and (not is_primary or (default_qty_type is null and v_type is not null));

    if v_pending then
      v_groups := '[]'::jsonb;
    else
      v_groups := private.clean_accessory_groups(v_type, e -> 'groups', v_sizes);
    end if;
    v_specific := coalesce((e ->> 'colour_specific')::boolean, false);
    if v_specific and coalesce(e ->> 'colour_follows', '') not in ('base', 'alternate', 'neutral') then
      raise exception 'For every colour specific accessory, choose Base colour, Alternate colour or Neutral colour';
    end if;

    insert into public.primary_accessory_lines
      (sample_id, size_ratio_id, position, accessory_id, qty_type, groups, details_filled, colour_specific, colour_follows, colour, updated_by)
    values (
      p_sample_id, p_size_ratio_id, v_position, v_accessory_id, v_type, v_groups, not v_pending,
      v_specific, case when v_specific then e ->> 'colour_follows' end,
      case when not v_specific then private.keep_colour(e ->> 'colour') end, v_me
    );
  end loop;
end
$function$;
