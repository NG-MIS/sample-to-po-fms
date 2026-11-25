-- =====================================================================
-- CAD drawings and the primary accessory list.
--   * Department "CAD" (a fixed name): makes the CADs, assigns them to
--     wishlist items, and sets up the primary accessory lists.
--   * A CAD belongs to one sample + size (+ ratio) and has one row per
--     drawing. The CAD department fills the drawing part of a row; the
--     people who look after the sample fill its fabric, vendor and rate.
--   * A CAD is assigned to wishlist items of the same sample, size and
--     ratio. One assigned CAD is enough for "CAD assigned".
--   * Primary accessory list: one per sample + size (+ ratio). Each line
--     can give a different qty to different groups of sizes.
-- =====================================================================

-- ---------- Department CAD --------------------------------------------

insert into public.departments (name)
select 'CAD' where not exists (select 1 from public.departments where lower(btrim(name)) = 'cad');

create or replace function private.guard_system_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_table_name = 'departments' and lower(btrim(old.name)) in ('sample', 'management', 'cad'))
     or (tg_table_name = 'roles' and lower(btrim(old.name)) = 'designer')
  then
    if lower(btrim(new.name)) <> lower(btrim(old.name)) or not new.is_active then
      raise exception '"%" is used by the system to decide who may do what, so it cannot be renamed or switched inactive', old.name;
    end if;
  end if;
  return new;
end
$$;

-- In department CAD, or authority All.
create function private.is_cad()
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
          where d.id = me.department_id and lower(btrim(d.name)) = 'cad'
        )
      )
  )
$$;
revoke all on function private.is_cad() from public;

-- The CAD department sees every sample, as Management does.
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
          where d.id = me.department_id and lower(btrim(d.name)) in ('management', 'cad')
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

-- ---------- Single sizes of a size range ------------------------------
-- 22-38 -> 22, 24, ... 38. Needed to split an accessory qty by size.

alter table public.size_ratios add column sizes text[];
update public.size_ratios set sizes = array['22','24','26','28','30','32','34','36','38'] where size = '22-38';
update public.size_ratios set sizes = array['22','24','26','28','30'] where size = '22-30';
update public.size_ratios set sizes = array['32','34','36','38'] where size = '32-38';
update public.size_ratios set sizes = array[size] where sizes is null;
alter table public.size_ratios
  alter column sizes set not null,
  add constraint size_ratios_sizes_check check (cardinality(sizes) >= 1 and array_position(sizes, null) is null);
grant insert (sizes), update (sizes) on public.size_ratios to authenticated;

-- ---------- CAD particulars master (a simple list of names) -----------

create table public.cad_particulars (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index cad_particulars_name_key on public.cad_particulars (lower(btrim(name)));
create index cad_particulars_created_by_idx on public.cad_particulars (created_by);
create trigger stamp_row before insert on public.cad_particulars
  for each row execute function private.stamp_row();

alter table public.cad_particulars enable row level security;
create policy "Signed-in people can view" on public.cad_particulars
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.cad_particulars
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.cad_particulars
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.cad_particulars from anon, authenticated;
grant select, insert (name, is_active), update (name, is_active) on public.cad_particulars to authenticated;

-- ---------- CADs and their rows ---------------------------------------

create table public.cads (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  cad_no text not null unique,
  sample_id uuid not null references public.samples (id),
  seq integer not null check (seq >= 1),
  size_ratio_id uuid not null references public.size_ratios (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id),
  updated_at timestamptz,
  updated_by uuid references public.app_users (id),
  unique (sample_id, seq)
);
create index cads_size_ratio_id_idx on public.cads (size_ratio_id);
create index cads_created_by_idx on public.cads (created_by);
create index cads_updated_by_idx on public.cads (updated_by);

create table public.cad_rows (
  id uuid primary key default gen_random_uuid(),
  cad_id uuid not null references public.cads (id) on delete cascade,
  position integer not null,
  particular_id uuid not null references public.cad_particulars (id),
  fabric_type text not null check (fabric_type in ('primary', 'secondary')),
  msrmnt numeric(10, 2) check (msrmnt is null or msrmnt >= 0),
  paina numeric(6, 2) check (paina is null or paina >= 0),
  pcs_in_layer integer check (pcs_in_layer is null or pcs_in_layer >= 0),
  panels integer check (panels is null or panels >= 0),
  -- filled by the people who look after the sample
  fabric_id uuid references public.fabrics (id),
  vendor_id uuid references public.fabric_vendors (id),
  rate numeric(12, 2) check (rate is null or rate >= 0),
  fabric_updated_at timestamptz,
  fabric_updated_by uuid references public.app_users (id)
);
create index cad_rows_cad_id_idx on public.cad_rows (cad_id);
create index cad_rows_particular_id_idx on public.cad_rows (particular_id);
create index cad_rows_fabric_id_idx on public.cad_rows (fabric_id);
create index cad_rows_vendor_id_idx on public.cad_rows (vendor_id);
create index cad_rows_fabric_updated_by_idx on public.cad_rows (fabric_updated_by);

-- Which wishlist items a CAD is assigned to.
create table public.cad_wishlist (
  cad_id uuid not null references public.cads (id) on delete cascade,
  wishlist_entry_id uuid not null references public.wishlist_entries (id),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.app_users (id),
  primary key (cad_id, wishlist_entry_id)
);
create index cad_wishlist_wishlist_entry_id_idx on public.cad_wishlist (wishlist_entry_id);
create index cad_wishlist_assigned_by_idx on public.cad_wishlist (assigned_by);

alter table public.cads enable row level security;
create policy "People see CADs of samples they can see" on public.cads
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id));
alter table public.cad_rows enable row level security;
create policy "People see rows of CADs they can see" on public.cad_rows
  for select to authenticated
  using (exists (select 1 from public.cads c where c.id = cad_id));
alter table public.cad_wishlist enable row level security;
create policy "People see assignments of CADs they can see" on public.cad_wishlist
  for select to authenticated
  using (exists (select 1 from public.cads c where c.id = cad_id));
revoke all on public.cads, public.cad_rows, public.cad_wishlist from anon, authenticated;
grant select on public.cads, public.cad_rows, public.cad_wishlist to authenticated;

-- ---------- Primary accessory list ------------------------------------
-- One list per sample + size (+ ratio). A line's qty is given per group
-- of sizes:  groups = [{ upto, pcs, qty, breadth }]
--   upto    - the last single size of the group; a group starts where the
--             one before it ended, and the last group ends at the last size
--   pcs     - number of pieces (the whole qty when the type is quantity)
--   qty     - length in inches (types length and dimension)
--   breadth - breadth in inches (type dimension)

create table public.primary_accessory_lines (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.samples (id),
  size_ratio_id uuid not null references public.size_ratios (id),
  position integer not null,
  accessory_id uuid not null references public.accessories (id),
  qty_type text not null check (qty_type in ('quantity', 'length', 'dimension')),
  groups jsonb not null check (jsonb_typeof(groups) = 'array' and jsonb_array_length(groups) >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id)
);
create index primary_accessory_lines_list_idx on public.primary_accessory_lines (sample_id, size_ratio_id);
create index primary_accessory_lines_size_ratio_id_idx on public.primary_accessory_lines (size_ratio_id);
create index primary_accessory_lines_accessory_id_idx on public.primary_accessory_lines (accessory_id);
create index primary_accessory_lines_updated_by_idx on public.primary_accessory_lines (updated_by);

alter table public.primary_accessory_lines enable row level security;
create policy "People see this for samples they can see" on public.primary_accessory_lines
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id));
revoke all on public.primary_accessory_lines from anon, authenticated;
grant select on public.primary_accessory_lines to authenticated;

-- ---------- Small helpers ---------------------------------------------

create function private.tidy_name(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'))
$$;
revoke all on function private.tidy_name(text) from public;

create function private.sample_is_approved(p_sample_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sample_approvals
    where sample_id = p_sample_id and stage = 'final' and decision = 'yes'
  )
$$;
revoke all on function private.sample_is_approved(uuid) from public;

-- ---------- Saving a CAD (the CAD department) -------------------------
-- p_rows: [{ id, particular_id, new_particular, fabric_type, msrmnt, paina, pcs_in_layer, panels }]
-- A row that is kept keeps its fabric, vendor and rate. Returns the CAD number.

create function public.save_cad(p_id uuid, p_sample_id uuid, p_size_ratio_id uuid, p_rows jsonb)
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

    if v_row_id is null then
      insert into public.cad_rows (cad_id, position, particular_id, fabric_type, msrmnt, paina, pcs_in_layer, panels)
      values (
        v_cad.id, v_position, v_particular_id, v_type,
        nullif(btrim(e ->> 'msrmnt'), '')::numeric, nullif(btrim(e ->> 'paina'), '')::numeric,
        nullif(btrim(e ->> 'pcs_in_layer'), '')::integer, nullif(btrim(e ->> 'panels'), '')::integer
      )
      returning id into v_row_id;
    else
      update public.cad_rows
      set position = v_position, particular_id = v_particular_id, fabric_type = v_type,
          msrmnt = nullif(btrim(e ->> 'msrmnt'), '')::numeric, paina = nullif(btrim(e ->> 'paina'), '')::numeric,
          pcs_in_layer = nullif(btrim(e ->> 'pcs_in_layer'), '')::integer, panels = nullif(btrim(e ->> 'panels'), '')::integer
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
revoke all on function public.save_cad(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_cad(uuid, uuid, uuid, jsonb) to authenticated;

-- ---------- Fabric of the CAD rows (the people who look after the sample)
-- p_rows: [{ id, fabric_id, new_fabric, vendor_id, rate }]

create function public.save_cad_fabrics(p_cad_id uuid, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_cad public.cads;
  v_old public.cad_rows;
  e jsonb;
  v_fabric_id uuid;
  v_name text;
  v_vendor_id uuid;
  v_rate numeric;
  v_active boolean;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  select * into v_cad from public.cads where id = p_cad_id for update;
  if not found then
    raise exception 'CAD not found';
  end if;
  if not private.can_work_on_sample(v_cad.sample_id) then
    raise exception 'Only the designer of this sample, or a person with department authority over Sample, can fill in the fabric of its CADs';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'The fabric details are not in the expected form';
  end if;

  for e in select * from jsonb_array_elements(p_rows) loop
    select * into v_old from public.cad_rows where id = nullif(e ->> 'id', '')::uuid and cad_id = p_cad_id;
    if not found then
      raise exception 'A drawing row was not found. Reload the screen and try again';
    end if;
    v_fabric_id := nullif(e ->> 'fabric_id', '')::uuid;
    v_name := private.tidy_name(e ->> 'new_fabric');
    v_vendor_id := nullif(e ->> 'vendor_id', '')::uuid;
    v_rate := round(nullif(btrim(e ->> 'rate'), '')::numeric, 2);

    if v_fabric_id is null and v_name <> '' then
      if char_length(v_name) > 80 then
        raise exception 'A fabric name can be at most 80 characters long';
      end if;
      insert into public.fabrics (name) values (v_name)
      on conflict (lower(btrim(name))) do nothing;
      select id into v_fabric_id from public.fabrics where lower(btrim(name)) = lower(v_name);
    end if;
    if v_fabric_id is not null then
      select is_active into v_active from public.fabrics where id = v_fabric_id;
      if v_active is null then
        raise exception 'A chosen fabric does not exist';
      end if;
      if not v_active and v_fabric_id is distinct from v_old.fabric_id then
        raise exception 'A newly chosen fabric is inactive';
      end if;
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
    if v_rate < 0 then
      raise exception 'Rate cannot be less than zero';
    end if;

    if (v_old.fabric_id, v_old.vendor_id, v_old.rate) is distinct from (v_fabric_id, v_vendor_id, v_rate) then
      update public.cad_rows
      set fabric_id = v_fabric_id, vendor_id = v_vendor_id, rate = v_rate,
          fabric_updated_at = now(), fabric_updated_by = v_me
      where id = v_old.id;
    end if;
  end loop;
end
$$;
revoke all on function public.save_cad_fabrics(uuid, jsonb) from public, anon;
grant execute on function public.save_cad_fabrics(uuid, jsonb) to authenticated;

-- ---------- Assigning CADs to wishlist items (the CAD department) -----

-- The wishlist items a CAD is assigned to become exactly p_wishlist_ids.
create function public.set_cad_wishlist(p_cad_id uuid, p_wishlist_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_cad public.cads;
  v_ids uuid[] := coalesce(p_wishlist_ids, '{}');
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not private.is_cad() then
    raise exception 'Only people in department CAD can assign a CAD to wishlist items';
  end if;
  select * into v_cad from public.cads where id = p_cad_id for update;
  if not found then
    raise exception 'CAD not found';
  end if;
  if (
    select count(*) from public.wishlist_entries w
    where w.id = any (v_ids) and w.sample_id = v_cad.sample_id and w.size_ratio_id = v_cad.size_ratio_id
  ) <> (select count(distinct x) from unnest(v_ids) as x) then
    raise exception 'A CAD can be assigned only to wishlist items of the same sample, size and ratio';
  end if;

  delete from public.cad_wishlist where cad_id = p_cad_id and wishlist_entry_id <> all (v_ids);
  insert into public.cad_wishlist (cad_id, wishlist_entry_id, assigned_by)
  select p_cad_id, x, v_me from (select distinct x from unnest(v_ids) as x) as ids
  on conflict do nothing;
end
$$;
revoke all on function public.set_cad_wishlist(uuid, uuid[]) from public, anon;
grant execute on function public.set_cad_wishlist(uuid, uuid[]) to authenticated;

-- The CADs assigned to one wishlist item become exactly p_cad_ids.
create function public.set_wishlist_cads(p_wishlist_id uuid, p_cad_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_entry public.wishlist_entries;
  v_ids uuid[] := coalesce(p_cad_ids, '{}');
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not private.is_cad() then
    raise exception 'Only people in department CAD can assign a CAD to wishlist items';
  end if;
  select * into v_entry from public.wishlist_entries where id = p_wishlist_id for update;
  if not found then
    raise exception 'Wishlist item not found';
  end if;
  if (
    select count(*) from public.cads c
    where c.id = any (v_ids) and c.sample_id = v_entry.sample_id and c.size_ratio_id = v_entry.size_ratio_id
  ) <> (select count(distinct x) from unnest(v_ids) as x) then
    raise exception 'A CAD can be assigned only to wishlist items of the same sample, size and ratio';
  end if;

  delete from public.cad_wishlist where wishlist_entry_id = p_wishlist_id and cad_id <> all (v_ids);
  insert into public.cad_wishlist (cad_id, wishlist_entry_id, assigned_by)
  select x, p_wishlist_id, v_me from (select distinct x from unnest(v_ids) as x) as ids
  on conflict do nothing;
end
$$;
revoke all on function public.set_wishlist_cads(uuid, uuid[]) from public, anon;
grant execute on function public.set_wishlist_cads(uuid, uuid[]) to authenticated;

-- A wishlist item with a CAD keeps its size and ratio.
create function private.keep_size_of_cad_wishlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.size_ratio_id is distinct from old.size_ratio_id
    and exists (select 1 from public.cad_wishlist where wishlist_entry_id = old.id) then
    raise exception 'This wishlist item has a CAD assigned, so its size and ratio cannot be changed';
  end if;
  return new;
end
$$;
revoke all on function private.keep_size_of_cad_wishlist() from public;
create trigger keep_size_of_cad_wishlist before update on public.wishlist_entries
  for each row execute function private.keep_size_of_cad_wishlist();

-- ---------- Saving a primary accessory list (the CAD department) ------
-- p_lines is the whole list of the sample + size (+ ratio):
--   [{ accessory_id, new_accessory, qty_type, groups: [{ upto, pcs, qty, breadth }] }]

create function public.save_primary_accessories(p_sample_id uuid, p_size_ratio_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_sizes text[];
  e jsonb;
  g jsonb;
  v_accessory_id uuid;
  v_name text;
  v_type text;
  v_groups jsonb;
  v_position integer := 0;
  v_last integer;
  v_at integer;
  v_pcs numeric;
  v_qty numeric;
  v_breadth numeric;
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
    v_type := e ->> 'qty_type';

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
    if v_type is null or v_type not in ('quantity', 'length', 'dimension') then
      raise exception 'Choose the qty type of every accessory: Quantity, Length or Dimension';
    end if;
    if jsonb_typeof(e -> 'groups') is distinct from 'array' or jsonb_array_length(e -> 'groups') = 0 then
      raise exception 'Every accessory needs its qty';
    end if;

    v_groups := '[]'::jsonb;
    v_last := 0;
    for g in select * from jsonb_array_elements(e -> 'groups') loop
      v_at := array_position(v_sizes, g ->> 'upto');
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
      if v_type in ('length', 'dimension') and (v_qty is null or v_qty <= 0) then
        raise exception 'Enter the length, more than zero, for every size group';
      end if;
      if v_type = 'dimension' and (v_breadth is null or v_breadth <= 0) then
        raise exception 'Enter the breadth, more than zero, for every size group';
      end if;
      v_groups := v_groups || jsonb_build_object(
        'upto', g ->> 'upto',
        'pcs', v_pcs::integer,
        'qty', case when v_type in ('length', 'dimension') then v_qty end,
        'breadth', case when v_type = 'dimension' then v_breadth end
      );
    end loop;
    if v_last <> cardinality(v_sizes) then
      raise exception 'The size groups of every accessory must reach the last size, %', v_sizes[cardinality(v_sizes)];
    end if;

    insert into public.primary_accessory_lines (sample_id, size_ratio_id, position, accessory_id, qty_type, groups, updated_by)
    values (p_sample_id, p_size_ratio_id, v_position, v_accessory_id, v_type, v_groups, v_me);
  end loop;
end
$$;
revoke all on function public.save_primary_accessories(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_primary_accessories(uuid, uuid, jsonb) to authenticated;
