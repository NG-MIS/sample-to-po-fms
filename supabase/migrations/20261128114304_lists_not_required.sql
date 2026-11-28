-- A list that is not needed is marked "Not required" instead of waiting as pending.
--   * Primary accessory: the CAD team says a sample and size has no primary accessory.
--   * Secondary accessory: the people who look after the sample say a wishlist item has none.
-- (Secondary fabric needs no mark: the screens see that the drawing has no secondary fabric rows.)

-- 1. No primary accessory for a sample and size
create table public.primary_accessory_none (
  sample_id uuid not null references public.samples (id) on delete cascade,
  size_ratio_id uuid not null references public.size_ratios (id),
  marked_at timestamptz not null default now(),
  marked_by uuid references public.app_users (id),
  primary key (sample_id, size_ratio_id)
);
create index primary_accessory_none_size_ratio_id_idx on public.primary_accessory_none (size_ratio_id);
create index primary_accessory_none_marked_by_idx on public.primary_accessory_none (marked_by);
alter table public.primary_accessory_none enable row level security;
revoke all on public.primary_accessory_none from public, anon, authenticated;
grant select on public.primary_accessory_none to authenticated;
create policy "People see this for samples they can see" on public.primary_accessory_none
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = primary_accessory_none.sample_id));

create function public.set_primary_accessory_not_required(p_sample_id uuid, p_size_ratio_id uuid, p_not_required boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := private.current_app_user_id();
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
  if not exists (select 1 from public.size_ratios where id = p_size_ratio_id) then
    raise exception 'Choose the size, and the ratio when the size has ratios';
  end if;

  if not coalesce(p_not_required, false) then
    delete from public.primary_accessory_none where sample_id = p_sample_id and size_ratio_id = p_size_ratio_id;
    return;
  end if;

  if not private.sample_ready_for_cad(p_sample_id) then
    raise exception 'A primary accessory list can be made only for a sample whose final approval is Yes, or that was sent to CAD';
  end if;
  if exists (select 1 from public.primary_accessory_lines where sample_id = p_sample_id and size_ratio_id = p_size_ratio_id) then
    raise exception 'This list has accessories. Remove them first, then mark it as not required';
  end if;
  insert into public.primary_accessory_none (sample_id, size_ratio_id, marked_by)
  values (p_sample_id, p_size_ratio_id, v_me)
  on conflict do nothing;
end
$function$;
revoke all on function public.set_primary_accessory_not_required(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_primary_accessory_not_required(uuid, uuid, boolean) to authenticated;

-- 2. A material list marked not required (used for the secondary accessory list)
alter table public.material_lists
  add column not_required_at timestamptz,
  add column not_required_by uuid references public.app_users (id);
create index material_lists_not_required_by_idx on public.material_lists (not_required_by);

create function public.set_material_list_not_required(p_wishlist_id uuid, p_kind text, p_not_required boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := private.current_app_user_id();
  v_entry public.wishlist_entries;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if p_kind is distinct from 'secondary_accessory' then
    raise exception 'Only the secondary accessory list can be marked as not required here';
  end if;
  select * into v_entry from public.wishlist_entries where id = p_wishlist_id for update;
  if not found then
    raise exception 'Wishlist item not found';
  end if;
  if not private.can_work_on_sample(v_entry.sample_id) then
    raise exception 'Only the designer of this sample, or a person with department authority over Sample, can change its material lists';
  end if;

  if not coalesce(p_not_required, false) then
    update public.material_lists set not_required_at = null, not_required_by = null
    where wishlist_entry_id = p_wishlist_id and kind = p_kind;
    return;
  end if;

  if exists (select 1 from public.material_items where wishlist_entry_id = p_wishlist_id and kind = p_kind) then
    raise exception 'This list has accessories. Remove them first, then mark it as not required';
  end if;
  insert into public.material_lists (wishlist_entry_id, kind, not_required_at, not_required_by)
  values (p_wishlist_id, p_kind, now(), v_me)
  on conflict (wishlist_entry_id, kind) do update set not_required_at = now(), not_required_by = v_me;
end
$function$;
revoke all on function public.set_material_list_not_required(uuid, text, boolean) from public, anon;
grant execute on function public.set_material_list_not_required(uuid, text, boolean) to authenticated;

-- 3. Adding accessories to a list takes its "not required" mark away. Patched in place.
do $patch$
declare
  v_def text;
  v_changes text[][] := array[
    ['save_primary_accessories',
     $a$  delete from public.primary_accessory_lines where sample_id = p_sample_id and size_ratio_id = p_size_ratio_id;
$a$,
     $b$  delete from public.primary_accessory_lines where sample_id = p_sample_id and size_ratio_id = p_size_ratio_id;
  if jsonb_array_length(p_lines) > 0 then
    delete from public.primary_accessory_none where sample_id = p_sample_id and size_ratio_id = p_size_ratio_id;
  end if;
$b$],
    ['save_material_list',
     $a$  insert into public.material_lists (wishlist_entry_id, kind) values (p_wishlist_id, p_kind)
  on conflict do nothing;
$a$,
     $b$  insert into public.material_lists (wishlist_entry_id, kind) values (p_wishlist_id, p_kind)
  on conflict do nothing;
  if jsonb_array_length(p_items) > 0 then
    update public.material_lists set not_required_at = null, not_required_by = null
    where wishlist_entry_id = p_wishlist_id and kind = p_kind and not_required_at is not null;
  end if;
$b$]
  ];
  i integer;
begin
  for i in 1 .. array_length(v_changes, 1) loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_changes[i][1];
    if position(v_changes[i][2] in v_def) = 0 then
      raise exception '% does not have the expected lines (change %)', v_changes[i][1], i;
    end if;
    execute replace(v_def, v_changes[i][2], v_changes[i][3]);
  end loop;
end
$patch$;
