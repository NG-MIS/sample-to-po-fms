-- 1. Initial approval can be "Yes, and send to CAD": the CAD team can then make the
--    drawing and the primary accessory list before the final approval.
-- 2. Every column of a CAD drawing row is required.

alter table public.sample_approvals add column send_to_cad boolean not null default false;
alter table public.sample_approvals add constraint sample_approvals_send_to_cad
  check (not send_to_cad or (stage = 'initial' and decision = 'yes'));
grant select (send_to_cad) on public.sample_approvals to authenticated;

-- A sample is ready for CAD when its final approval is Yes, or, while there is no final
-- approval yet, when its latest initial approval is Yes and sent it to CAD.
create or replace function private.sample_ready_for_cad(p_sample_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select private.sample_is_approved(p_sample_id)
    or (
      not exists (select 1 from public.sample_approvals where sample_id = p_sample_id and stage = 'final')
      and coalesce((
        select decision = 'yes' and send_to_cad from public.sample_approvals
        where sample_id = p_sample_id and stage = 'initial'
        order by round desc limit 1
      ), false)
    )
$function$;
revoke all on function private.sample_ready_for_cad(uuid) from public, anon, authenticated;

drop function public.set_sample_approval(uuid, text, text, text, boolean);
create function public.set_sample_approval(
  p_sample_id uuid, p_stage text, p_decision text, p_remarks text, p_correct boolean, p_send_to_cad boolean default false
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := private.current_app_user_id();
  v_remarks text := nullif(btrim(p_remarks), '');
  v_latest public.sample_approvals;
  v_has_final boolean;
  v_round integer;
  -- only an initial approval of Yes can send the sample to CAD
  v_to_cad boolean := coalesce(p_send_to_cad, false) and p_stage = 'initial' and p_decision = 'yes';
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not exists (select 1 from public.samples where id = p_sample_id) then
    raise exception 'Sample not found';
  end if;
  if p_stage is null or p_stage not in ('initial', 'final') then
    raise exception 'Choose initial approval or final approval';
  end if;
  if p_stage = 'initial' and (p_decision is null or p_decision not in ('yes', 'no', 'maybe')) then
    raise exception 'Initial approval must be Yes, No or Maybe';
  end if;
  if p_stage = 'final' and (p_decision is null or p_decision not in ('yes', 'no')) then
    raise exception 'Final approval must be Yes or No';
  end if;

  select * into v_latest
  from public.sample_approvals
  where sample_id = p_sample_id and stage = p_stage
  order by round desc
  limit 1
  for update;
  v_has_final := exists (select 1 from public.sample_approvals where sample_id = p_sample_id and stage = 'final');

  if coalesce(p_correct, false) then
    if not private.is_admin() then
      raise exception 'Only a person with authority All can change an approval that has been given';
    end if;
    if v_latest.id is null then
      raise exception 'There is no approval to change yet';
    end if;
    if p_stage = 'initial' and p_decision = 'no' and v_has_final then
      raise exception 'This sample already has a final approval, so its initial approval cannot be changed to No';
    end if;

    update public.sample_approvals
    set decision = p_decision, send_to_cad = v_to_cad, remarks = v_remarks, decided_at = now(), decided_by = v_me
    where id = v_latest.id;
    insert into public.sample_approval_history (sample_id, stage, round, decision, remarks, action, changed_by)
    values (p_sample_id, p_stage, v_latest.round, p_decision, v_remarks, 'changed', v_me);
    return;
  end if;

  if not private.is_management() then
    raise exception 'Only people in department Management can approve a sample';
  end if;
  if private.is_sample_closed(p_sample_id) then
    raise exception 'This sample is closed because its initial approval is No. Nothing more can be done on it';
  end if;
  if v_has_final then
    raise exception 'The final approval has already been given. Only a person with authority All can change it';
  end if;
  if p_stage = 'initial' and v_latest.decision = 'yes' then
    raise exception 'The initial approval is already Yes. The next step is the final approval';
  end if;

  v_round := coalesce(v_latest.round, 0) + 1;
  insert into public.sample_approvals (sample_id, stage, round, decision, send_to_cad, remarks, decided_by)
  values (p_sample_id, p_stage, v_round, p_decision, v_to_cad, v_remarks, v_me);
  insert into public.sample_approval_history (sample_id, stage, round, decision, remarks, action, changed_by)
  values (p_sample_id, p_stage, v_round, p_decision, v_remarks, 'given', v_me);
end
$function$;
revoke all on function public.set_sample_approval(uuid, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.set_sample_approval(uuid, text, text, text, boolean, boolean) to authenticated;

-- save_cad and save_primary_accessories: patched in place, only the lines named here change.
do $patch$
declare
  v_def text;
  v_changes text[][] := array[
    ['save_cad',
     $a$    if not private.sample_is_approved(p_sample_id) then
      raise exception 'A CAD can be made only for a sample whose final approval is Yes';$a$,
     $b$    if not private.sample_ready_for_cad(p_sample_id) then
      raise exception 'A CAD can be made only for a sample whose final approval is Yes, or whose initial approval sent it to CAD';$b$],
    ['save_cad',
     $a$      raise exception 'Efficiency is a percentage from 0 to 100';
    end if;
$a$,
     $b$      raise exception 'Efficiency is a percentage from 0 to 100';
    end if;
    if nullif(btrim(e ->> 'msrmnt'), '') is null or nullif(btrim(e ->> 'paina'), '') is null
      or nullif(btrim(e ->> 'pcs_in_layer'), '') is null or nullif(btrim(e ->> 'panels'), '') is null
      or v_efficiency is null then
      raise exception 'Every drawing row needs its Msrmnt, Paina, No. of pcs in layer, No of panels and Efficiency';
    end if;
$b$],
    ['save_primary_accessories',
     $a$  if not private.sample_is_approved(p_sample_id) then
    raise exception 'A primary accessory list can be made only for a sample whose final approval is Yes';$a$,
     $b$  if not private.sample_ready_for_cad(p_sample_id) then
    raise exception 'A primary accessory list can be made only for a sample whose final approval is Yes, or whose initial approval sent it to CAD';$b$]
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
