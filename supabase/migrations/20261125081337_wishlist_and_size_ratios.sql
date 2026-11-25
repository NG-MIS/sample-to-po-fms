-- =====================================================================
-- Wishlist: what an approved sample is to be produced in.
--   * Master "Sizes and ratios": every allowed size, and for a size that
--     is made in ratios, every allowed ratio (22-38 in 1:1, 1:2, 2:1).
--   * A wishlist entry = sample + size (+ ratio) + quantity in pieces.
--     The first entry of a sample is NEW (LB-3001-NEW), every later one
--     a repeat (LB-3001-REPEAT-1, -2, ...).
--   * Entries are added by department Management, the people who approve:
--     together with the final approval, or later.
-- =====================================================================

-- ---------- Sizes and ratios master -----------------------------------
-- One row per allowed combination. ratio is empty for a size that is not
-- made in ratios. pieces_per_set = pieces in one set of that combination.

create table public.size_ratios (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  size text not null check (btrim(size) <> '' and char_length(size) <= 30),
  ratio text check (ratio is null or ratio ~ '^[0-9]{1,2}:[0-9]{1,2}$'),
  pieces_per_set integer not null check (pieces_per_set >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index size_ratios_key on public.size_ratios (lower(btrim(size)), coalesce(ratio, ''));
create index size_ratios_created_by_idx on public.size_ratios (created_by);
create trigger stamp_row before insert on public.size_ratios
  for each row execute function private.stamp_row();

-- A size is either made in ratios or not: it cannot have both a row
-- without a ratio and rows with one.
create function private.guard_size_ratio_mix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.size_ratios o
    where o.id <> new.id
      and lower(btrim(o.size)) = lower(btrim(new.size))
      and (o.ratio is null) <> (new.ratio is null)
  ) then
    raise exception 'Size % is already in the list % a ratio. A size is either made in ratios or not', new.size,
      case when new.ratio is null then 'with' else 'without' end;
  end if;
  return new;
end
$$;
revoke all on function private.guard_size_ratio_mix() from public;
create trigger guard_mix before insert or update on public.size_ratios
  for each row execute function private.guard_size_ratio_mix();

alter table public.size_ratios enable row level security;
create policy "Signed-in people can view" on public.size_ratios
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.size_ratios
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.size_ratios
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.size_ratios from anon, authenticated;
grant select, insert (size, ratio, pieces_per_set, is_active), update (size, ratio, pieces_per_set, is_active)
  on public.size_ratios to authenticated;

insert into public.size_ratios (size, ratio, pieces_per_set) values
  ('22-38', '1:1', 9),
  ('22-38', '1:2', 13),
  ('22-38', '2:1', 14),
  ('22-30', null, 5),
  ('32-38', null, 4);

-- ---------- Wishlist entries ------------------------------------------
-- repeat_no 0 = the NEW entry of the sample; 1, 2, ... = its repeats.

create table public.wishlist_entries (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  wishlist_no text not null unique,
  sample_id uuid not null references public.samples (id),
  repeat_no integer not null check (repeat_no >= 0),
  size_ratio_id uuid not null references public.size_ratios (id),
  qty integer not null check (qty >= 1),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id),
  updated_at timestamptz,
  updated_by uuid references public.app_users (id),
  unique (sample_id, repeat_no)
);
create index wishlist_entries_size_ratio_id_idx on public.wishlist_entries (size_ratio_id);
create index wishlist_entries_created_by_idx on public.wishlist_entries (created_by);
create index wishlist_entries_updated_by_idx on public.wishlist_entries (updated_by);

alter table public.wishlist_entries enable row level security;
create policy "People see wishlist entries of samples they can see" on public.wishlist_entries
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id));
revoke all on public.wishlist_entries from anon, authenticated;
grant select on public.wishlist_entries to authenticated;

-- Checks one size / ratio / quantity. p_keep_id: the combination already on
-- the entry being corrected, which may stay even if it was switched inactive.
create function private.check_wishlist_values(p_size_ratio_id uuid, p_qty integer, p_keep_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
begin
  if p_size_ratio_id is null then
    raise exception 'Choose the size, and the ratio when the size has ratios';
  end if;
  select is_active into v_active from public.size_ratios where id = p_size_ratio_id;
  if v_active is null then
    raise exception 'The chosen size and ratio is not in the list';
  end if;
  if not v_active and p_size_ratio_id is distinct from p_keep_id then
    raise exception 'The chosen size and ratio is inactive';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'Quantity must be a whole number of pieces, 1 or more';
  end if;
end
$$;
revoke all on function private.check_wishlist_values(uuid, integer, uuid) from public;

-- Adds one or more wishlist entries to an approved sample.
--   p_entries: [{ size_ratio_id, qty }]
-- Returns the wishlist numbers given, in order.
create function public.add_wishlist_entries(p_sample_id uuid, p_entries jsonb)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_sample public.samples;
  e jsonb;
  v_size_ratio_id uuid;
  v_qty integer;
  v_next integer;
  v_no text;
  v_given text[] := '{}';
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not private.is_management() then
    raise exception 'Only people in department Management can add to the wishlist';
  end if;
  -- Locking the sample keeps two people from giving out the same number.
  select * into v_sample from public.samples where id = p_sample_id for update;
  if not found then
    raise exception 'Sample not found';
  end if;
  if not exists (
    select 1 from public.sample_approvals
    where sample_id = p_sample_id and stage = 'final' and decision = 'yes'
  ) then
    raise exception 'A sample can be added to the wishlist only after its final approval is Yes';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Add at least one wishlist entry';
  end if;

  select coalesce(max(repeat_no) + 1, 0) into v_next from public.wishlist_entries where sample_id = p_sample_id;

  for e in select * from jsonb_array_elements(p_entries) loop
    v_size_ratio_id := nullif(e ->> 'size_ratio_id', '')::uuid;
    if coalesce(e ->> 'qty', '') !~ '^[0-9]{1,9}$' then
      raise exception 'Quantity must be a whole number of pieces, 1 or more';
    end if;
    v_qty := (e ->> 'qty')::integer;
    perform private.check_wishlist_values(v_size_ratio_id, v_qty, null);

    v_no := v_sample.sample_no || case when v_next = 0 then '-NEW' else '-REPEAT-' || v_next end;
    insert into public.wishlist_entries (wishlist_no, sample_id, repeat_no, size_ratio_id, qty, created_by)
    values (v_no, p_sample_id, v_next, v_size_ratio_id, v_qty, v_me);
    v_given := v_given || v_no;
    v_next := v_next + 1;
  end loop;

  return v_given;
end
$$;
revoke all on function public.add_wishlist_entries(uuid, jsonb) from public, anon;
grant execute on function public.add_wishlist_entries(uuid, jsonb) to authenticated;

-- Final approval Yes and the wishlist entries, in one go.
create function public.approve_final_with_wishlist(p_sample_id uuid, p_remarks text, p_entries jsonb)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.set_sample_approval(p_sample_id, 'final', 'yes', p_remarks, false);
  return public.add_wishlist_entries(p_sample_id, p_entries);
end
$$;
revoke all on function public.approve_final_with_wishlist(uuid, text, jsonb) from public, anon;
grant execute on function public.approve_final_with_wishlist(uuid, text, jsonb) to authenticated;

-- Correcting the size, ratio or quantity of an entry: authority All only.
create function public.correct_wishlist_entry(p_id uuid, p_size_ratio_id uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_old public.wishlist_entries;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not private.is_admin() then
    raise exception 'Only a person with authority All can change a wishlist entry';
  end if;
  select * into v_old from public.wishlist_entries where id = p_id for update;
  if not found then
    raise exception 'Wishlist entry not found';
  end if;
  perform private.check_wishlist_values(p_size_ratio_id, p_qty, v_old.size_ratio_id);
  update public.wishlist_entries
  set size_ratio_id = p_size_ratio_id, qty = p_qty, updated_at = now(), updated_by = v_me
  where id = p_id;
end
$$;
revoke all on function public.correct_wishlist_entry(uuid, uuid, integer) from public, anon;
grant execute on function public.correct_wishlist_entry(uuid, uuid, integer) to authenticated;

-- A sample that is in the wishlist keeps its final approval.
create function private.keep_final_approval_of_wishlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.stage = 'final' and old.decision = 'yes' and new.decision <> 'yes'
    and exists (select 1 from public.wishlist_entries where sample_id = old.sample_id) then
    raise exception 'This sample is already in the wishlist, so its final approval cannot be changed';
  end if;
  return new;
end
$$;
revoke all on function private.keep_final_approval_of_wishlist() from public;
create trigger keep_final_approval_of_wishlist before update on public.sample_approvals
  for each row execute function private.keep_final_approval_of_wishlist();
