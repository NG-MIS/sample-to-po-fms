-- 1. The pieces of a sample are completed in order: the 2nd sample only after the 1st.
--    Reopening goes the other way round: the 1st cannot be reopened while the 2nd is completed.
-- 2. A colour specific accessory can also follow the Neutral colour (besides Base and Alternate).
-- The stored functions are patched in place: only the lines named here change.

alter table public.primary_accessory_lines drop constraint primary_accessory_lines_colour_follows_check;
alter table public.primary_accessory_lines add constraint primary_accessory_lines_colour_follows_check
  check (colour_follows = any (array['base'::text, 'alternate'::text, 'neutral'::text]));
alter table public.material_items drop constraint material_items_colour_follows_check;
alter table public.material_items add constraint material_items_colour_follows_check
  check (colour_follows = any (array['base'::text, 'alternate'::text, 'neutral'::text]));

do $patch$
declare
  v_fn record;
  v_def text;
  v_changes text[][] := array[
    ['complete_sample_piece',
     $a$    raise exception 'This piece is already completed';
  end if;$a$,
     $b$    raise exception 'This piece is already completed';
  end if;
  if p_piece = 2 and not exists (select 1 from public.sample_piece_completions where sample_id = p_sample_id and piece = 1) then
    raise exception 'Complete the 1st sample first. The 2nd sample can be marked completed only after it';
  end if;$b$],
    ['reopen_sample_piece',
     $a$  delete from public.sample_piece_completions where sample_id = p_sample_id and piece = p_piece;$a$,
     $b$  if p_piece = 1 and exists (select 1 from public.sample_piece_completions where sample_id = p_sample_id and piece = 2) then
    raise exception 'Reopen the 2nd sample first. The 1st sample cannot be reopened while the 2nd is completed';
  end if;
  delete from public.sample_piece_completions where sample_id = p_sample_id and piece = p_piece;$b$],
    ['save_material_list',
     $a$not in ('base', 'alternate') then
        raise exception 'For every colour specific accessory, choose Base colour or Alternate colour';$a$,
     $b$not in ('base', 'alternate', 'neutral') then
        raise exception 'For every colour specific accessory, choose Base colour, Alternate colour or Neutral colour';$b$],
    ['save_primary_accessories',
     $a$not in ('base', 'alternate') then
      raise exception 'For every colour specific accessory, choose Base colour or Alternate colour';$a$,
     $b$not in ('base', 'alternate', 'neutral') then
      raise exception 'For every colour specific accessory, choose Base colour, Alternate colour or Neutral colour';$b$]
  ];
  i integer;
begin
  for i in 1 .. array_length(v_changes, 1) loop
    select p.oid into v_fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_changes[i][1];
    v_def := pg_get_functiondef(v_fn.oid);
    if position(v_changes[i][2] in v_def) = 0 then
      raise exception '% does not have the expected lines', v_changes[i][1];
    end if;
    execute replace(v_def, v_changes[i][2], v_changes[i][3]);
  end loop;
end
$patch$;
