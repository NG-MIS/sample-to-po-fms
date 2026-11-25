-- =====================================================================
-- Material lists of a wishlist item, and purchase orders.
--   * Four lists per wishlist item: primary fabric, secondary fabric,
--     primary accessory, secondary accessory. A list is "updated" once it
--     is confirmed, and "ordered" once every item has a PO or is marked
--     not required.
--   * A PO is for one wishlist item and one vendor, fabric or accessory.
--     An open order is a free PO, not tied to a material list.
--   * Masters: Colours, the fabric tolerance and the PO number series.
-- =====================================================================

-- ---------- Pieces of each single size in a set -----------------------
-- 22-38 at 1:2 -> 1,1,1,1,1,2,2,2,2. Splits a wishlist quantity by size.

alter table public.size_ratios add column size_pieces integer[];
update public.size_ratios
set size_pieces = case
  when size = '22-38' and ratio = '1:2' then array[1, 1, 1, 1, 1, 2, 2, 2, 2]
  when size = '22-38' and ratio = '2:1' then array[2, 2, 2, 2, 2, 1, 1, 1, 1]
  else array_fill(1, array[cardinality(sizes)])
end;
alter table public.size_ratios
  alter column size_pieces set not null,
  add constraint size_ratios_size_pieces_check check (
    cardinality(size_pieces) = cardinality(sizes) and array_position(size_pieces, null) is null and 0 < all (size_pieces)
  );
grant insert (size_pieces), update (size_pieces) on public.size_ratios to authenticated;

-- ---------- Purchase settings (one row) -------------------------------

create table public.purchase_settings (
  id boolean primary key default true check (id),
  fabric_tolerance numeric(5, 2) not null default 0 check (fabric_tolerance >= 0 and fabric_tolerance <= 100),
  po_start_number bigint check (po_start_number is null or po_start_number >= 1),
  po_last_number bigint
);
insert into public.purchase_settings default values;

alter table public.purchase_settings enable row level security;
create policy "Signed-in people can view" on public.purchase_settings
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can change" on public.purchase_settings
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.purchase_settings from anon, authenticated;
grant select, update (fabric_tolerance, po_start_number) on public.purchase_settings to authenticated;

create function private.guard_purchase_settings_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.po_last_number is not null and new.po_start_number is distinct from old.po_start_number then
    raise exception 'PO numbers have already been given, so the starting number is locked';
  end if;
  return new;
end
$$;
revoke all on function private.guard_purchase_settings_update() from public;
create trigger guard_update before update on public.purchase_settings
  for each row execute function private.guard_purchase_settings_update();

-- ---------- Colours master (a simple list of names) -------------------

create table public.colours (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> '' and char_length(name) <= 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index colours_name_key on public.colours (lower(btrim(name)));
create index colours_created_by_idx on public.colours (created_by);
create trigger stamp_row before insert on public.colours
  for each row execute function private.stamp_row();

alter table public.colours enable row level security;
create policy "Signed-in people can view" on public.colours
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.colours
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.colours
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.colours from anon, authenticated;
grant select, insert (name, is_active), update (name, is_active) on public.colours to authenticated;

-- ---------- Material lists and their items ----------------------------

create table public.material_lists (
  wishlist_entry_id uuid not null references public.wishlist_entries (id),
  kind text not null check (kind in ('primary_fabric', 'secondary_fabric', 'primary_accessory', 'secondary_accessory')),
  confirmed_at timestamptz,
  confirmed_by uuid references public.app_users (id),
  primary key (wishlist_entry_id, kind)
);
create index material_lists_confirmed_by_idx on public.material_lists (confirmed_by);

create table public.material_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_entry_id uuid not null references public.wishlist_entries (id),
  kind text not null check (kind in ('primary_fabric', 'secondary_fabric', 'primary_accessory', 'secondary_accessory')),
  position integer not null,
  -- a fabric item
  fabric_id uuid references public.fabrics (id),
  cad_row_id uuid references public.cad_rows (id) on delete set null,
  msrmnt numeric(10, 2) check (msrmnt is null or msrmnt >= 0),
  pcs_in_layer integer check (pcs_in_layer is null or pcs_in_layer >= 1),
  paina numeric(6, 2) check (paina is null or paina >= 0),
  fabric_vendor_id uuid references public.fabric_vendors (id),
  -- an accessory item (groups as on the primary accessory list)
  accessory_id uuid references public.accessories (id),
  qty_type text check (qty_type in ('quantity', 'length', 'dimension')),
  groups jsonb,
  colour_specific boolean not null default false,
  accessory_vendor_id uuid references public.accessory_vendors (id),
  rate numeric(12, 2) check (rate is null or rate >= 0),
  -- marked not required: already in-house, or not needed at all
  not_required text check (not_required in ('in_house', 'not_needed')),
  not_required_remark text,
  not_required_at timestamptz,
  not_required_by uuid references public.app_users (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id),
  updated_at timestamptz,
  updated_by uuid references public.app_users (id),
  constraint material_items_shape check (
    (kind in ('primary_fabric', 'secondary_fabric') and fabric_id is not null and accessory_id is null)
    or (kind in ('primary_accessory', 'secondary_accessory') and accessory_id is not null and fabric_id is null
        and qty_type is not null and groups is not null)
  )
);
create index material_items_list_idx on public.material_items (wishlist_entry_id, kind);
create index material_items_fabric_id_idx on public.material_items (fabric_id);
create index material_items_cad_row_id_idx on public.material_items (cad_row_id);
create index material_items_fabric_vendor_id_idx on public.material_items (fabric_vendor_id);
create index material_items_accessory_id_idx on public.material_items (accessory_id);
create index material_items_accessory_vendor_id_idx on public.material_items (accessory_vendor_id);
create index material_items_not_required_by_idx on public.material_items (not_required_by);
create index material_items_created_by_idx on public.material_items (created_by);
create index material_items_updated_by_idx on public.material_items (updated_by);

-- ---------- Purchase orders -------------------------------------------

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  po_no text not null unique,
  kind text not null check (kind in ('fabric', 'accessory')),
  is_open boolean not null default false,
  wishlist_entry_id uuid references public.wishlist_entries (id),
  sample_id uuid references public.samples (id),
  fabric_vendor_id uuid references public.fabric_vendors (id),
  accessory_vendor_id uuid references public.accessory_vendors (id),
  order_date date not null,
  remarks text,
  status text not null default 'raised' check (status in ('raised', 'cancelled')),
  cancel_remarks text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id),
  updated_at timestamptz,
  updated_by uuid references public.app_users (id),
  constraint purchase_orders_vendor check (
    (kind = 'fabric' and fabric_vendor_id is not null and accessory_vendor_id is null)
    or (kind = 'accessory' and accessory_vendor_id is not null and fabric_vendor_id is null)
  ),
  constraint purchase_orders_link check (is_open or wishlist_entry_id is not null)
);
create index purchase_orders_wishlist_entry_id_idx on public.purchase_orders (wishlist_entry_id);
create index purchase_orders_sample_id_idx on public.purchase_orders (sample_id);
create index purchase_orders_fabric_vendor_id_idx on public.purchase_orders (fabric_vendor_id);
create index purchase_orders_accessory_vendor_id_idx on public.purchase_orders (accessory_vendor_id);
create index purchase_orders_cancelled_by_idx on public.purchase_orders (cancelled_by);
create index purchase_orders_created_by_idx on public.purchase_orders (created_by);
create index purchase_orders_updated_by_idx on public.purchase_orders (updated_by);

-- qty_text is what was typed: "100" (for every colour) or "100+200+300"
-- (one per colour). total_qty is worked out from it.
create table public.po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  position integer not null,
  material_item_id uuid references public.material_items (id),
  fabric_id uuid references public.fabrics (id),
  accessory_id uuid references public.accessories (id),
  item_type text check (item_type in ('primary', 'secondary')),
  dimension text,
  colours text[] not null default '{}',
  qty_text text not null,
  total_qty numeric(14, 2) not null check (total_qty > 0),
  unit text not null check (unit in ('mtr', 'pcs', 'inch')),
  rate numeric(12, 2) not null check (rate >= 0),
  amount numeric(16, 2) generated always as (round(total_qty * rate, 2)) stored,
  promise_days integer check (promise_days is null or promise_days >= 0),
  promised_date date,
  folds text,
  paina numeric(6, 2) check (paina is null or paina >= 0),
  constraint po_lines_item check ((fabric_id is null) <> (accessory_id is null))
);
create index po_lines_po_id_idx on public.po_lines (po_id);
create index po_lines_material_item_id_idx on public.po_lines (material_item_id);
create index po_lines_fabric_id_idx on public.po_lines (fabric_id);
create index po_lines_accessory_id_idx on public.po_lines (accessory_id);

alter table public.material_lists enable row level security;
create policy "People see lists of wishlist items they can see" on public.material_lists
  for select to authenticated
  using (exists (select 1 from public.wishlist_entries w where w.id = wishlist_entry_id));
alter table public.material_items enable row level security;
create policy "People see items of wishlist items they can see" on public.material_items
  for select to authenticated
  using (exists (select 1 from public.wishlist_entries w where w.id = wishlist_entry_id));
alter table public.purchase_orders enable row level security;
create policy "People see POs of samples they can see, and open orders" on public.purchase_orders
  for select to authenticated
  using (
    (select private.current_app_user_id()) is not null
    and (sample_id is null or exists (select 1 from public.samples s where s.id = sample_id))
  );
alter table public.po_lines enable row level security;
create policy "People see lines of POs they can see" on public.po_lines
  for select to authenticated
  using (exists (select 1 from public.purchase_orders p where p.id = po_id));
revoke all on public.material_lists, public.material_items, public.purchase_orders, public.po_lines from anon, authenticated;
grant select on public.material_lists, public.material_items, public.purchase_orders, public.po_lines to authenticated;

-- ---------- Helpers ---------------------------------------------------

-- An item can no longer be changed once it is on a raised PO or marked not required.
create function private.material_item_locked(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.material_items where id = p_item_id and not_required is not null)
      or exists (
        select 1 from public.po_lines l
        join public.purchase_orders p on p.id = l.po_id
        where l.material_item_id = p_item_id and p.status = 'raised'
      )
$$;
revoke all on function private.material_item_locked(uuid) from public;

-- Checks the size groups of an accessory and gives them back tidy.
create function private.clean_accessory_groups(p_type text, p_groups jsonb, p_sizes text[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  g jsonb;
  v_out jsonb := '[]'::jsonb;
  v_last integer := 0;
  v_at integer;
  v_pcs numeric;
  v_qty numeric;
  v_breadth numeric;
begin
  if p_type is null or p_type not in ('quantity', 'length', 'dimension') then
    raise exception 'Choose the qty type of every accessory: Quantity, Length or Dimension';
  end if;
  if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'Every accessory needs its qty';
  end if;
  for g in select * from jsonb_array_elements(p_groups) loop
    v_at := array_position(p_sizes, g ->> 'upto');
    if v_at is null or v_at <= v_last then
      raise exception 'The size groups of an accessory must follow one another, each ending at a later size';
    end if;
    v_last := v_at;
    v_pcs := nullif(btrim(g ->> 'pcs'), '')::numeric;
    v_qty := round(nullif(btrim(g ->> 'qty'), '')::numeric, 2);
    v_breadth := round(nullif(btrim(g ->> 'breadth'), '')::numeric, 2);
    if v_pcs is null or v_pcs < 1 or v_pcs <> trunc(v_pcs) then
      raise exception 'Number of pieces must be a whole number, 1 or more';
    end if;
    if p_type in ('length', 'dimension') and (v_qty is null or v_qty <= 0) then
      raise exception 'Enter the length, more than zero, for every size group';
    end if;
    if p_type = 'dimension' and (v_breadth is null or v_breadth <= 0) then
      raise exception 'Enter the breadth, more than zero, for every size group';
    end if;
    v_out := v_out || jsonb_build_object(
      'upto', g ->> 'upto',
      'pcs', v_pcs::integer,
      'qty', case when p_type in ('length', 'dimension') then v_qty end,
      'breadth', case when p_type = 'dimension' then v_breadth end
    );
  end loop;
  if v_last <> cardinality(p_sizes) then
    raise exception 'The size groups of every accessory must reach the last size, %', p_sizes[cardinality(p_sizes)];
  end if;
  return v_out;
end
$$;
revoke all on function private.clean_accessory_groups(text, jsonb, text[]) from public;

-- May raise an open order: looks after samples, or is the designer of one.
create function private.can_raise_open_orders()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.manages_samples()
      or exists (select 1 from public.samples s where s.designer_id = private.current_app_user_id())
$$;
revoke all on function private.can_raise_open_orders() from public;

-- ---------- Saving a material list ------------------------------------
-- p_items is the whole list. An item already on a PO, or marked not
-- required, is left as it is. p_confirm true -> the list becomes "updated".
--   fabric item:    { id, fabric_id, cad_row_id, msrmnt, pcs_in_layer, paina, vendor_id, rate }
--   accessory item: { id, accessory_id, new_accessory, qty_type, groups, colour_specific, vendor_id, rate }

create function public.save_material_list(p_wishlist_id uuid, p_kind text, p_items jsonb, p_confirm boolean)
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
      if v_id is null then
        insert into public.material_items
          (wishlist_entry_id, kind, position, accessory_id, qty_type, groups, colour_specific, accessory_vendor_id, rate, created_by)
        values (
          p_wishlist_id, p_kind, v_position, v_item_id, e ->> 'qty_type', v_groups,
          coalesce((e ->> 'colour_specific')::boolean, false), v_vendor, round(nullif(btrim(e ->> 'rate'), '')::numeric, 2), v_me
        )
        returning id into v_id;
        v_keep := v_keep || v_id;
      else
        update public.material_items
        set position = v_position, accessory_id = v_item_id, qty_type = e ->> 'qty_type', groups = v_groups,
            colour_specific = coalesce((e ->> 'colour_specific')::boolean, false),
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
revoke all on function public.save_material_list(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.save_material_list(uuid, text, jsonb, boolean) to authenticated;

-- Marks an item not required (p_reason 'in_house' or 'not_needed'), or, for
-- authority All, takes the mark off again (p_reason null).
create function public.mark_material_not_required(p_item_id uuid, p_reason text, p_remark text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_item public.material_items;
  v_sample uuid;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  select * into v_item from public.material_items where id = p_item_id for update;
  if not found then
    raise exception 'Material not found';
  end if;
  select sample_id into v_sample from public.wishlist_entries where id = v_item.wishlist_entry_id;

  if p_reason is null then
    if not private.is_admin() then
      raise exception 'Only a person with authority All can take the Not required mark off again';
    end if;
    update public.material_items
    set not_required = null, not_required_remark = null, not_required_at = null, not_required_by = null
    where id = p_item_id;
    return;
  end if;

  if not private.can_work_on_sample(v_sample) then
    raise exception 'Only the designer of this sample, or a person with department authority over Sample, can mark its materials';
  end if;
  if p_reason not in ('in_house', 'not_needed') then
    raise exception 'Choose the reason: Already in-house, or Not required at all';
  end if;
  if not exists (
    select 1 from public.material_lists
    where wishlist_entry_id = v_item.wishlist_entry_id and kind = v_item.kind and confirmed_at is not null
  ) then
    raise exception 'Confirm the list first';
  end if;
  if private.material_item_locked(p_item_id) then
    raise exception 'This material is already on a PO or marked not required';
  end if;
  update public.material_items
  set not_required = p_reason, not_required_remark = nullif(btrim(p_remark), ''), not_required_at = now(), not_required_by = v_me
  where id = p_item_id;
end
$$;
revoke all on function public.mark_material_not_required(uuid, text, text) from public, anon;
grant execute on function public.mark_material_not_required(uuid, text, text) to authenticated;

-- ---------- Raising or changing a PO ----------------------------------
-- p_id null -> raise a new PO. p_id given -> authority All changes it.
-- p_po: { kind, is_open, wishlist_id, sample_id, vendor_id, order_date, remarks,
--         lines: [{ material_item_id, fabric_id, accessory_id, new_name, item_type, dimension,
--                   colours, qty_text, unit, rate, promise_days, folds, paina }] }
-- Returns the PO number.

create function public.save_purchase_order(p_id uuid, p_po jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_po public.purchase_orders;
  v_kind text := p_po ->> 'kind';
  v_open boolean := coalesce((p_po ->> 'is_open')::boolean, false);
  v_wishlist uuid := nullif(p_po ->> 'wishlist_id', '')::uuid;
  v_sample uuid := nullif(p_po ->> 'sample_id', '')::uuid;
  v_vendor uuid := nullif(p_po ->> 'vendor_id', '')::uuid;
  v_date date := coalesce(nullif(p_po ->> 'order_date', '')::date, v_today);
  v_number bigint;
  e jsonb;
  v_position integer := 0;
  v_item public.material_items;
  v_fabric uuid;
  v_accessory uuid;
  v_name text;
  v_type text;
  v_colours text[];
  v_colour text;
  v_text text;
  v_parts numeric[];
  v_total numeric;
  v_rate numeric;
  v_days integer;
  v_unit text;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;

  if p_id is not null then
    if not private.is_admin() then
      raise exception 'Only a person with authority All can change a PO that has been raised';
    end if;
    select * into v_po from public.purchase_orders where id = p_id for update;
    if not found then
      raise exception 'PO not found';
    end if;
    if v_po.status <> 'raised' then
      raise exception 'A cancelled PO cannot be changed';
    end if;
    v_kind := v_po.kind;
    v_open := v_po.is_open;
    v_wishlist := v_po.wishlist_entry_id;
    v_vendor := coalesce(v_po.fabric_vendor_id, v_po.accessory_vendor_id);
  else
    if v_kind is null or v_kind not in ('fabric', 'accessory') then
      raise exception 'Choose fabric or accessory';
    end if;
    if v_wishlist is not null then
      select sample_id into v_sample from public.wishlist_entries where id = v_wishlist;
      if v_sample is null then
        raise exception 'Wishlist item not found';
      end if;
    end if;
    if v_open then
      if not private.can_raise_open_orders() then
        raise exception 'Only people who look after samples can raise an open order';
      end if;
    else
      if v_wishlist is null then
        raise exception 'A PO is for one wishlist item';
      end if;
      if not private.can_work_on_sample(v_sample) then
        raise exception 'Only the designer of this sample, or a person with department authority over Sample, can raise its POs';
      end if;
    end if;
    if v_vendor is null
      or (v_kind = 'fabric' and not exists (select 1 from public.fabric_vendors where id = v_vendor and is_active))
      or (v_kind = 'accessory' and not exists (select 1 from public.accessory_vendors where id = v_vendor and is_active)) then
      raise exception 'Choose an active vendor';
    end if;
  end if;

  if v_date > v_today then
    raise exception 'Order date cannot be in the future';
  end if;
  if jsonb_typeof(p_po -> 'lines') is distinct from 'array' or jsonb_array_length(p_po -> 'lines') = 0 then
    raise exception 'A PO needs at least one line';
  end if;

  if p_id is null then
    update public.purchase_settings
    set po_last_number = coalesce(po_last_number, po_start_number - 1) + 1
    where po_start_number is not null
    returning po_last_number into v_number;
    if v_number is null then
      raise exception 'Set the starting PO number in Masters, under Numbering, first';
    end if;
    insert into public.purchase_orders
      (po_no, kind, is_open, wishlist_entry_id, sample_id, fabric_vendor_id, accessory_vendor_id, order_date, remarks, created_by)
    values (
      'PO-' || v_number, v_kind, v_open, v_wishlist, v_sample,
      case when v_kind = 'fabric' then v_vendor end, case when v_kind = 'accessory' then v_vendor end,
      v_date, nullif(btrim(p_po ->> 'remarks'), ''), v_me
    )
    returning * into v_po;
  else
    update public.purchase_orders
    set order_date = v_date, remarks = nullif(btrim(p_po ->> 'remarks'), ''), updated_at = now(), updated_by = v_me
    where id = p_id;
    delete from public.po_lines where po_id = p_id;
  end if;

  for e in select * from jsonb_array_elements(p_po -> 'lines') loop
    v_position := v_position + 1;
    v_item := null;
    v_fabric := nullif(e ->> 'fabric_id', '')::uuid;
    v_accessory := nullif(e ->> 'accessory_id', '')::uuid;
    v_type := nullif(e ->> 'item_type', '');

    if nullif(e ->> 'material_item_id', '') is not null then
      select * into v_item from public.material_items where id = (e ->> 'material_item_id')::uuid for update;
      if not found or v_item.wishlist_entry_id is distinct from v_wishlist
        or (v_kind = 'fabric') <> (v_item.kind in ('primary_fabric', 'secondary_fabric')) then
        raise exception 'A line does not belong to this wishlist item';
      end if;
      if coalesce(v_item.fabric_vendor_id, v_item.accessory_vendor_id) is distinct from v_vendor then
        raise exception 'Every line of a PO must be for the vendor of the PO';
      end if;
      if v_item.not_required is not null then
        raise exception 'A line is marked not required';
      end if;
      if not exists (
        select 1 from public.material_lists
        where wishlist_entry_id = v_item.wishlist_entry_id and kind = v_item.kind and confirmed_at is not null
      ) then
        raise exception 'Confirm the list before raising its PO';
      end if;
      if exists (
        select 1 from public.po_lines l
        join public.purchase_orders p on p.id = l.po_id
        where l.material_item_id = v_item.id and p.status = 'raised' and p.id <> v_po.id
      ) then
        raise exception 'A line is already on another PO';
      end if;
      v_fabric := v_item.fabric_id;
      v_accessory := v_item.accessory_id;
      v_type := split_part(v_item.kind, '_', 1);
    elsif not v_open then
      raise exception 'Every line of this PO must come from the material list';
    else
      v_name := private.tidy_name(e ->> 'new_name');
      if v_kind = 'fabric' then
        v_accessory := null;
        if v_fabric is null and v_name <> '' then
          insert into public.fabrics (name) values (left(v_name, 80)) on conflict (lower(btrim(name))) do nothing;
          select id into v_fabric from public.fabrics where lower(btrim(name)) = lower(left(v_name, 80));
        end if;
      else
        v_fabric := null;
        if v_accessory is null and v_name <> '' then
          insert into public.accessories (name) values (left(v_name, 80)) on conflict (lower(btrim(name))) do nothing;
          select id into v_accessory from public.accessories where lower(btrim(name)) = lower(left(v_name, 80));
        end if;
      end if;
      if v_fabric is null and v_accessory is null then
        raise exception 'Every line needs its item name';
      end if;
    end if;

    -- colours: tidy, no repeats, and each one joins the Colours list
    v_colours := '{}';
    if jsonb_typeof(e -> 'colours') = 'array' then
      for v_colour in select private.tidy_name(c) from jsonb_array_elements_text(e -> 'colours') as c loop
        if v_colour <> '' and not (lower(v_colour) = any (select lower(x) from unnest(v_colours) as x)) then
          v_colour := left(v_colour, 60);
          insert into public.colours (name) values (v_colour) on conflict (lower(btrim(name))) do nothing;
          v_colours := v_colours || (select name from public.colours where lower(btrim(name)) = lower(v_colour));
        end if;
      end loop;
    end if;
    if v_kind = 'fabric' and cardinality(v_colours) = 0 then
      raise exception 'Name the colours of every fabric line';
    end if;
    if v_item.id is not null and v_kind = 'accessory' then
      if v_item.colour_specific and cardinality(v_colours) = 0 then
        raise exception 'Name the colours of every colour specific accessory';
      end if;
      if not v_item.colour_specific and cardinality(v_colours) > 0 then
        raise exception 'An accessory that is not colour specific is ordered without colours';
      end if;
    end if;

    -- quantity: one number for every colour, or one number per colour joined with +
    v_text := regexp_replace(coalesce(e ->> 'qty_text', ''), '\s', '', 'g');
    if v_text !~ '^[0-9]+(\.[0-9]{1,2})?(\+[0-9]+(\.[0-9]{1,2})?)*$' then
      raise exception 'Qty must be a number, or numbers joined with +, for example 100+200+300';
    end if;
    v_parts := string_to_array(v_text, '+')::numeric[];
    if cardinality(v_parts) = 1 then
      v_total := v_parts[1] * greatest(cardinality(v_colours), 1);
    elsif cardinality(v_parts) <> cardinality(v_colours) then
      raise exception 'The number of quantities (%) must equal the number of colours (%)', cardinality(v_parts), cardinality(v_colours);
    else
      select sum(x) into v_total from unnest(v_parts) as x;
    end if;
    if v_total <= 0 then
      raise exception 'Qty must be more than zero';
    end if;

    v_rate := round(nullif(btrim(e ->> 'rate'), '')::numeric, 2);
    if v_rate is null or v_rate < 0 then
      raise exception 'Enter the rate of every line';
    end if;
    v_days := nullif(btrim(e ->> 'promise_days'), '')::integer;
    if v_days < 0 then
      raise exception 'Promise days cannot be less than zero';
    end if;
    v_unit := case when v_kind = 'fabric' then 'mtr' else coalesce(nullif(e ->> 'unit', ''), 'pcs') end;
    if v_unit not in ('mtr', 'pcs', 'inch') then
      raise exception 'Unknown unit';
    end if;

    insert into public.po_lines
      (po_id, position, material_item_id, fabric_id, accessory_id, item_type, dimension, colours, qty_text,
       total_qty, unit, rate, promise_days, promised_date, folds, paina)
    values (
      v_po.id, v_position, v_item.id, v_fabric, v_accessory, v_type,
      case when v_kind = 'accessory' then nullif(btrim(e ->> 'dimension'), '') end,
      v_colours, v_text, v_total, v_unit, v_rate, v_days, v_date + v_days,
      case when v_kind = 'fabric' then nullif(btrim(e ->> 'folds'), '') end,
      case when v_kind = 'fabric' then nullif(btrim(e ->> 'paina'), '')::numeric end
    );
  end loop;

  return v_po.po_no;
end
$$;
revoke all on function public.save_purchase_order(uuid, jsonb) from public, anon;
grant execute on function public.save_purchase_order(uuid, jsonb) to authenticated;

-- Cancelling a PO: authority All. Its items can then be ordered again.
create function public.cancel_purchase_order(p_id uuid, p_remarks text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not private.is_admin() then
    raise exception 'Only a person with authority All can cancel a PO';
  end if;
  update public.purchase_orders
  set status = 'cancelled', cancel_remarks = nullif(btrim(p_remarks), ''), cancelled_at = now(), cancelled_by = v_me
  where id = p_id and status = 'raised';
  if not found then
    raise exception 'This PO is not open to cancel';
  end if;
end
$$;
revoke all on function public.cancel_purchase_order(uuid, text) from public, anon;
grant execute on function public.cancel_purchase_order(uuid, text) to authenticated;
