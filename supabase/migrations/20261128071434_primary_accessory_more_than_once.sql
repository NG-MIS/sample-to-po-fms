-- The same accessory can be on a primary accessory list more than once
-- (for example two chains of different lengths), so the "twice" rule is taken out.
do $patch$
declare
  v_def text := pg_get_functiondef('public.save_primary_accessories(uuid, uuid, jsonb)'::regprocedure);
  v_old text := $old$    if exists (
      select 1 from public.primary_accessory_lines
      where sample_id = p_sample_id and size_ratio_id = p_size_ratio_id and accessory_id = v_accessory_id
    ) then
      raise exception 'An accessory is on the list twice. Keep it once';
    end if;
$old$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'save_primary_accessories does not have the expected rule';
  end if;
  execute replace(v_def, v_old, '');
end
$patch$;
