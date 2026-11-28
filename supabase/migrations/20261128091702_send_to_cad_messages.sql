-- The two "not ready for CAD" messages still spoke of the initial approval sending a
-- sample to CAD. Sending to CAD is its own step now, so the wording follows.
do $patch$
declare
  v_fn text;
  v_def text;
  v_old text := 'or whose initial approval sent it to CAD';
begin
  foreach v_fn in array array['save_cad', 'save_primary_accessories'] loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_fn;
    if position(v_old in v_def) = 0 then
      raise exception '% does not have the expected message', v_fn;
    end if;
    execute replace(v_def, v_old, 'or that was sent to CAD');
  end loop;
end
$patch$;

-- Number counters back in step with the lists (rule checks that were undone had moved them on).
do $reset$
declare
  v_table text;
  v_next bigint;
begin
  foreach v_table in array array['cads', 'accessories'] loop
    execute format('select coalesce(max(sl_no), 0) + 1 from public.%I', v_table) into v_next;
    execute format('alter table public.%I alter column sl_no restart with %s', v_table, v_next);
  end loop;
end
$reset$;
