-- =====================================================================
-- Receiving material against purchase orders, lot numbers and follow-ups.
--   * Departments "Fabric store" and "Accessory store" receive fabric and
--     accessory POs. Authority All can do both.
--   * A PO can be received in parts. Each receipt records the received
--     date, bill number, bill date, an optional photo, and the quantity
--     of each colour of each PO line.
--   * Every PO line gets one lot number at its first receipt, from a lot
--     series chosen by the person (fabric and accessory series are
--     separate). Each colour is that number plus a letter: FB-1234-A.
--   * At the first receipt the item name can be changed to what came.
--   * A line that came short can be marked complete.
--   * Follow-ups with the vendor, each with an optional revised promised date.
-- =====================================================================

-- ---------- The two store departments ---------------------------------

insert into public.departments (name)
select v.name from (values ('Fabric store'), ('Accessory store')) as v(name)
where not exists (select 1 from public.departments d where lower(btrim(d.name)) = lower(v.name));

create or replace function private.guard_system_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_table_name = 'departments' and lower(btrim(old.name)) in ('sample', 'management', 'cad', 'fabric store', 'accessory store'))
     or (tg_table_name = 'roles' and lower(btrim(old.name)) = 'designer')
  then
    if lower(btrim(new.name)) <> lower(btrim(old.name)) or not new.is_active then
      raise exception '"%" is used by the system to decide who may do what, so it cannot be renamed or switched inactive', old.name;
    end if;
  end if;
  return new;
end
$$;

-- May receive material of this kind ('fabric' or 'accessory').
create function private.can_receive(p_kind text)
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
          select 1 from public.departments d
          where d.id = me.department_id
            and lower(btrim(d.name)) = case p_kind when 'fabric' then 'fabric store' when 'accessory' then 'accessory store' end
        )
      )
  )
$$;
revoke all on function private.can_receive(text) from public;

-- The store departments see every sample, as Management and CAD do, so
-- that a PO shows its sample and wishlist item to them.
create or replace function private.can_see_sample(p_created_by uuid, p_designer_id uuid)
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
        or exists (
          select 1 from public.departments d
          where d.id = me.department_id and lower(btrim(d.name)) in ('management', 'cad', 'fabric store', 'accessory store')
        )
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

-- ---------- Lot series (Numbering) ------------------------------------

create table public.lot_series (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  kind text not null check (kind in ('fabric', 'accessory')),
  name text not null check (btrim(name) <> ''),
  prefix text not null constraint lot_series_prefix_format check (prefix ~ '^[A-Z0-9]{1,10}$'),
  start_number bigint not null check (start_number >= 1),
  last_number bigint check (last_number is null or last_number >= start_number),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index lot_series_prefix_key on public.lot_series (prefix);
create unique index lot_series_name_key on public.lot_series (lower(btrim(name)));
create index lot_series_created_by_idx on public.lot_series (created_by);
create trigger stamp_row before insert on public.lot_series
  for each row execute function private.stamp_row();

create function private.guard_lot_series_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.last_number is not null
    and (new.prefix <> old.prefix or new.start_number <> old.start_number or new.kind <> old.kind) then
    raise exception 'Lot numbers have already been given from this series, so its prefix and starting number are locked';
  end if;
  return new;
end
$$;
revoke all on function private.guard_lot_series_update() from public;
create trigger guard_update before update on public.lot_series
  for each row execute function private.guard_lot_series_update();

alter table public.lot_series enable row level security;
create policy "Signed-in people can view" on public.lot_series
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.lot_series
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.lot_series
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.lot_series from anon, authenticated;
grant select, insert (kind, name, prefix, start_number, is_active), update (kind, name, prefix, start_number, is_active)
  on public.lot_series to authenticated;

-- ---------- Receiving allowance ---------------------------------------
-- A colour is complete once what has come is within this % of what was ordered.

alter table public.purchase_settings
  add column receive_allowance numeric(5, 2) not null default 10 check (receive_allowance >= 0 and receive_allowance <= 100);
grant update (receive_allowance) on public.purchase_settings to authenticated;

-- ---------- What a PO line becomes once it is received ----------------

alter table public.po_lines
  add column lot_series_id uuid references public.lot_series (id),
  add column lot_number bigint,
  add column lot_no text unique,
  add column received_fabric_id uuid references public.fabrics (id),
  add column received_accessory_id uuid references public.accessories (id),
  add column completed_at timestamptz,
  add column completed_by uuid references public.app_users (id),
  add column completed_remark text;
create index po_lines_lot_series_id_idx on public.po_lines (lot_series_id);
create index po_lines_received_fabric_id_idx on public.po_lines (received_fabric_id);
create index po_lines_received_accessory_id_idx on public.po_lines (received_accessory_id);
create index po_lines_completed_by_idx on public.po_lines (completed_by);

create table public.po_receipts (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  po_id uuid not null references public.purchase_orders (id),
  received_date date not null,
  bill_no text not null check (btrim(bill_no) <> ''),
  bill_date date not null,
  photo_path text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create index po_receipts_po_id_idx on public.po_receipts (po_id);
create index po_receipts_created_by_idx on public.po_receipts (created_by);
create index po_receipts_photo_path_idx on public.po_receipts (photo_path);

-- colour_no is the place of the colour on the PO line (1 = lot letter A).
-- A line with no colours has the one colour_no 1.
create table public.po_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.po_receipts (id) on delete cascade,
  po_line_id uuid not null references public.po_lines (id),
  colour_no integer not null check (colour_no >= 1),
  qty numeric(14, 2) not null check (qty > 0),
  unique (receipt_id, po_line_id, colour_no)
);
create index po_receipt_items_po_line_id_idx on public.po_receipt_items (po_line_id);

create table public.po_followups (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  po_id uuid not null references public.purchase_orders (id),
  followup_date date not null,
  remark text not null check (btrim(remark) <> ''),
  promised_date date,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create index po_followups_po_id_idx on public.po_followups (po_id);
create index po_followups_created_by_idx on public.po_followups (created_by);

alter table public.po_receipts enable row level security;
create policy "People see receipts of POs they can see" on public.po_receipts
  for select to authenticated
  using (exists (select 1 from public.purchase_orders p where p.id = po_id));
alter table public.po_receipt_items enable row level security;
create policy "People see receipt items of receipts they can see" on public.po_receipt_items
  for select to authenticated
  using (exists (select 1 from public.po_receipts r where r.id = receipt_id));
alter table public.po_followups enable row level security;
create policy "People see follow-ups of POs they can see" on public.po_followups
  for select to authenticated
  using (exists (select 1 from public.purchase_orders p where p.id = po_id));
revoke all on public.po_receipts, public.po_receipt_items, public.po_followups from anon, authenticated;
grant select on public.po_receipts, public.po_receipt_items, public.po_followups to authenticated;

-- Receipt photos live with the other pictures.
create policy "Store people can add receipt photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'samples'
    and ((select private.can_receive('fabric')) or (select private.can_receive('accessory')))
  );
create policy "People can view receipt photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'samples'
    and (select private.current_app_user_id()) is not null
    and exists (select 1 from public.po_receipts r where r.photo_path = name)
  );

-- ---------- Once received, a PO is fixed ------------------------------

create function private.block_received_po_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.lot_no is not null or exists (select 1 from public.po_receipt_items i where i.po_line_id = old.id) then
    raise exception 'Material has been received against this PO, so it can no longer be changed';
  end if;
  return old;
end
$$;
revoke all on function private.block_received_po_line() from public;
create trigger block_received before delete on public.po_lines
  for each row execute function private.block_received_po_line();

create function private.block_received_po_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled'
    and exists (select 1 from public.po_receipts r where r.po_id = old.id) then
    raise exception 'Material has been received against this PO, so it can no longer be cancelled';
  end if;
  return new;
end
$$;
revoke all on function private.block_received_po_cancel() from public;
create trigger block_received_cancel before update on public.purchase_orders
  for each row execute function private.block_received_po_cancel();

-- ---------- Receiving -------------------------------------------------
-- p_receipt: { received_date, bill_no, bill_date, photo_path, series_id,
--              items: [{ line_id, colour_no, qty }],
--              names: [{ line_id, item_id, new_name }] }
-- series_id is needed only when a line is received for the first time.
-- names changes the item of a line, at its first receipt only.
-- Returns the lot numbers of the lines received, joined with ", ".

create function public.save_po_receipt(p_po_id uuid, p_receipt jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_po public.purchase_orders;
  v_line public.po_lines;
  v_series public.lot_series;
  v_received date := nullif(p_receipt ->> 'received_date', '')::date;
  v_bill_no text := btrim(coalesce(p_receipt ->> 'bill_no', ''));
  v_bill_date date := nullif(p_receipt ->> 'bill_date', '')::date;
  v_receipt uuid;
  v_number bigint;
  v_lots text[] := '{}';
  e jsonb;
  n jsonb;
  v_line_id uuid;
  v_colour integer;
  v_qty numeric;
  v_item uuid;
  v_name text;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found';
  end if;
  if not private.can_receive(v_po.kind) then
    raise exception 'Only the % department, or a person with authority All, can receive this PO',
      case v_po.kind when 'fabric' then 'Fabric store' else 'Accessory store' end;
  end if;
  if v_po.status <> 'raised' then
    raise exception 'A cancelled PO cannot be received';
  end if;
  if v_received is null then
    raise exception 'Enter the received date';
  end if;
  if v_received > v_today then
    raise exception 'Received date cannot be in the future';
  end if;
  if v_received < v_po.order_date then
    raise exception 'Received date cannot be before the order date of the PO';
  end if;
  if v_bill_no = '' then
    raise exception 'Enter the bill number';
  end if;
  if v_bill_date is null then
    raise exception 'Enter the bill date';
  end if;
  if v_bill_date > v_today then
    raise exception 'Bill date cannot be in the future';
  end if;
  if jsonb_typeof(p_receipt -> 'items') is distinct from 'array' or jsonb_array_length(p_receipt -> 'items') = 0 then
    raise exception 'Enter the quantity received of at least one item';
  end if;

  insert into public.po_receipts (po_id, received_date, bill_no, bill_date, photo_path, created_by)
  values (p_po_id, v_received, v_bill_no, v_bill_date, nullif(btrim(p_receipt ->> 'photo_path'), ''), v_me)
  returning id into v_receipt;

  for e in select * from jsonb_array_elements(p_receipt -> 'items') loop
    v_line_id := nullif(e ->> 'line_id', '')::uuid;
    v_colour := nullif(btrim(e ->> 'colour_no'), '')::integer;
    v_qty := round(nullif(btrim(e ->> 'qty'), '')::numeric, 2);
    select * into v_line from public.po_lines where id = v_line_id and po_id = p_po_id for update;
    if not found then
      raise exception 'An item does not belong to this PO';
    end if;
    if v_line.completed_at is not null then
      raise exception 'An item is marked complete, so nothing more can be received against it';
    end if;
    if v_colour is null or v_colour < 1 or v_colour > greatest(cardinality(v_line.colours), 1) then
      raise exception 'A colour does not belong to its item';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Received quantity must be more than zero';
    end if;

    -- first receipt of this line: give it its lot number, and its changed name if any
    if v_line.lot_no is null then
      if v_series.id is null then
        select * into v_series from public.lot_series
        where id = nullif(p_receipt ->> 'series_id', '')::uuid for update;
        if not found then
          raise exception 'Choose the lot number series';
        end if;
        if v_series.kind <> v_po.kind then
          raise exception 'This lot number series is not for %', case v_po.kind when 'fabric' then 'fabric' else 'accessories' end;
        end if;
        if not v_series.is_active then
          raise exception 'This lot number series is switched inactive';
        end if;
      end if;
      v_number := coalesce(v_series.last_number, v_series.start_number - 1) + 1;
      v_series.last_number := v_number;
      update public.lot_series set last_number = v_number where id = v_series.id;

      v_item := null;
      select x into n from jsonb_array_elements(coalesce(p_receipt -> 'names', '[]'::jsonb)) as x
      where x ->> 'line_id' = v_line_id::text limit 1;
      if n is not null then
        v_item := nullif(n ->> 'item_id', '')::uuid;
        v_name := left(private.tidy_name(n ->> 'new_name'), 80);
        if v_po.kind = 'fabric' then
          if v_item is null and v_name <> '' then
            insert into public.fabrics (name) values (v_name) on conflict (lower(btrim(name))) do nothing;
            select id into v_item from public.fabrics where lower(btrim(name)) = lower(v_name);
          end if;
          if v_item is not null and not exists (select 1 from public.fabrics where id = v_item) then
            raise exception 'The received fabric name was not found';
          end if;
        else
          if v_item is null and v_name <> '' then
            insert into public.accessories (name) values (v_name) on conflict (lower(btrim(name))) do nothing;
            select id into v_item from public.accessories where lower(btrim(name)) = lower(v_name);
          end if;
          if v_item is not null and not exists (select 1 from public.accessories where id = v_item) then
            raise exception 'The received accessory name was not found';
          end if;
        end if;
      end if;

      update public.po_lines
      set lot_series_id = v_series.id, lot_number = v_number, lot_no = v_series.prefix || '-' || v_number,
          received_fabric_id = case when v_po.kind = 'fabric' then coalesce(v_item, fabric_id) end,
          received_accessory_id = case when v_po.kind = 'accessory' then coalesce(v_item, accessory_id) end
      where id = v_line_id
      returning * into v_line;
    end if;
    if not (v_line.lot_no = any (v_lots)) then
      v_lots := v_lots || v_line.lot_no;
    end if;

    begin
      insert into public.po_receipt_items (receipt_id, po_line_id, colour_no, qty)
      values (v_receipt, v_line_id, v_colour, v_qty);
    exception when unique_violation then
      raise exception 'A colour is entered twice in this receipt';
    end;
  end loop;

  return array_to_string(v_lots, ', ');
end
$$;
revoke all on function public.save_po_receipt(uuid, jsonb) from public, anon;
grant execute on function public.save_po_receipt(uuid, jsonb) to authenticated;

-- Taking a wrong receipt off again: authority All. Lot numbers stay.
create function public.delete_po_receipt(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_app_user_id() is null then
    raise exception 'You are not signed in';
  end if;
  if not private.is_admin() then
    raise exception 'Only a person with authority All can remove a receipt';
  end if;
  delete from public.po_receipts where id = p_id;
  if not found then
    raise exception 'Receipt not found';
  end if;
end
$$;
revoke all on function public.delete_po_receipt(uuid) from public, anon;
grant execute on function public.delete_po_receipt(uuid) to authenticated;

-- Marks a line complete although it came short (p_undo false), or, for
-- authority All, opens it again (p_undo true).
create function public.complete_po_line(p_line_id uuid, p_remark text, p_undo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_line public.po_lines;
  v_po public.purchase_orders;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  select * into v_line from public.po_lines where id = p_line_id for update;
  if not found then
    raise exception 'Item not found';
  end if;
  select * into v_po from public.purchase_orders where id = v_line.po_id;

  if coalesce(p_undo, false) then
    if not private.is_admin() then
      raise exception 'Only a person with authority All can open a completed item again';
    end if;
    update public.po_lines set completed_at = null, completed_by = null, completed_remark = null where id = p_line_id;
    return;
  end if;

  if not private.can_receive(v_po.kind) then
    raise exception 'Only the % department, or a person with authority All, can mark this item complete',
      case v_po.kind when 'fabric' then 'Fabric store' else 'Accessory store' end;
  end if;
  if v_po.status <> 'raised' then
    raise exception 'This PO is cancelled';
  end if;
  if v_line.completed_at is not null then
    raise exception 'This item is already marked complete';
  end if;
  update public.po_lines
  set completed_at = now(), completed_by = v_me, completed_remark = nullif(btrim(p_remark), '')
  where id = p_line_id;
end
$$;
revoke all on function public.complete_po_line(uuid, text, boolean) from public, anon;
grant execute on function public.complete_po_line(uuid, text, boolean) to authenticated;

-- A follow-up with the vendor: by the store people of that kind, or the
-- people who may raise the POs of that sample (or open orders).
create function public.add_po_followup(p_po_id uuid, p_date date, p_remark text, p_promised_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_po public.purchase_orders;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  select * into v_po from public.purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found';
  end if;
  if not (
    private.can_receive(v_po.kind)
    or v_po.created_by = v_me
    or (v_po.sample_id is not null and private.can_work_on_sample(v_po.sample_id))
    or (v_po.sample_id is null and private.can_raise_open_orders())
  ) then
    raise exception 'Only the people who raise or receive this PO can add a follow-up';
  end if;
  if v_po.status <> 'raised' then
    raise exception 'This PO is cancelled';
  end if;
  if p_date is null then
    raise exception 'Enter the follow-up date';
  end if;
  if p_date > v_today then
    raise exception 'Follow-up date cannot be in the future';
  end if;
  if btrim(coalesce(p_remark, '')) = '' then
    raise exception 'Write what the vendor said';
  end if;
  insert into public.po_followups (po_id, followup_date, remark, promised_date, created_by)
  values (p_po_id, p_date, btrim(p_remark), p_promised_date, v_me);
end
$$;
revoke all on function public.add_po_followup(uuid, date, text, date) from public, anon;
grant execute on function public.add_po_followup(uuid, date, text, date) to authenticated;
