-- A wishlist item now uses every CAD of its sample, size and ratio by itself.
-- Nothing is assigned by hand any more, so the two "keep the size" rules no longer
-- look at assignments (cad_wishlist). They look at material lists instead:
--   * a CAD keeps its size and ratio once a material list was made from its rows
--   * a wishlist item keeps its size and ratio once it has a material list
-- The table cad_wishlist and the functions set_cad_wishlist / set_wishlist_cads are
-- left in place but are no longer used by the screens.

create or replace function private.keep_size_of_cad_wishlist()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.size_ratio_id is distinct from old.size_ratio_id
    and exists (select 1 from public.material_items where wishlist_entry_id = old.id) then
    raise exception 'This wishlist item has a material list, so its size and ratio cannot be changed';
  end if;
  return new;
end
$function$;

-- save_cad: only its size rule changes, so the stored function is patched in place.
do $patch$
declare
  v_def text := pg_get_functiondef('public.save_cad(uuid, uuid, uuid, jsonb)'::regprocedure);
  v_old text := $old$      and exists (select 1 from public.cad_wishlist where cad_id = p_id) then
      raise exception 'This CAD is assigned to wishlist items, so its size and ratio cannot be changed';$old$;
  v_new text := $new$      and exists (
        select 1 from public.material_items mi
        join public.cad_rows r on r.id = mi.cad_row_id
        where r.cad_id = p_id
      ) then
      raise exception 'A material list was made from this CAD, so its size and ratio cannot be changed';$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'save_cad does not have the expected size rule';
  end if;
  execute replace(v_def, v_old, v_new);
end
$patch$;
