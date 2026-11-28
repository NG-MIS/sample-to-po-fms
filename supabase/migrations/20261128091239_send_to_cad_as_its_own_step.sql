-- "Send to CAD" is its own step beside the initial and final approval, not a choice of
-- the initial approval: a sample that is not final approved yet, but needs its CAD
-- drawing, is sent to CAD and is then ready for the CAD team.

alter table public.samples
  add column sent_to_cad_at timestamptz,
  add column sent_to_cad_by uuid references public.app_users (id);
create index samples_sent_to_cad_by_idx on public.samples (sent_to_cad_by);

alter table public.sample_approvals drop constraint sample_approvals_send_to_cad;
alter table public.sample_approvals drop column send_to_cad;

-- Ready for CAD: the final approval is Yes, or the sample was sent to CAD (and is not closed).
create or replace function private.sample_ready_for_cad(p_sample_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select private.sample_is_approved(p_sample_id)
    or (
      not private.is_sample_closed(p_sample_id)
      and exists (select 1 from public.samples where id = p_sample_id and sent_to_cad_at is not null)
    )
$function$;

-- set_sample_approval keeps its six values so a screen that still sends the sixth keeps
-- working, but the sixth (p_send_to_cad) is no longer used.
do $patch$
declare
  v_def text := pg_get_functiondef('public.set_sample_approval(uuid, text, text, text, boolean, boolean)'::regprocedure);
  v_changes text[][] := array[
    [$a$set decision = p_decision, send_to_cad = v_to_cad, remarks = v_remarks$a$, $b$set decision = p_decision, remarks = v_remarks$b$],
    [$a$(sample_id, stage, round, decision, send_to_cad, remarks, decided_by)
  values (p_sample_id, p_stage, v_round, p_decision, v_to_cad, v_remarks, v_me);$a$,
     $b$(sample_id, stage, round, decision, remarks, decided_by)
  values (p_sample_id, p_stage, v_round, p_decision, v_remarks, v_me);$b$],
    [$a$  -- only an initial approval of Yes can send the sample to CAD
  v_to_cad boolean := coalesce(p_send_to_cad, false) and p_stage = 'initial' and p_decision = 'yes';
$a$, $b$$b$]
  ];
  i integer;
begin
  for i in 1 .. array_length(v_changes, 1) loop
    if position(v_changes[i][1] in v_def) = 0 then
      raise exception 'set_sample_approval does not have the expected lines (change %)', i;
    end if;
    v_def := replace(v_def, v_changes[i][1], v_changes[i][2]);
  end loop;
  execute v_def;
end
$patch$;

-- Sends a sample to CAD, or (p_undo, authority All only) takes it back.
create function public.send_sample_to_cad(p_sample_id uuid, p_undo boolean default false)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := private.current_app_user_id();
  v_sample public.samples;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  select * into v_sample from public.samples where id = p_sample_id for update;
  if not found then
    raise exception 'Sample not found';
  end if;

  if coalesce(p_undo, false) then
    if not private.is_admin() then
      raise exception 'Only a person with authority All can take a sample back from CAD';
    end if;
    if v_sample.sent_to_cad_at is null then
      raise exception 'This sample has not been sent to CAD';
    end if;
    if not private.sample_is_approved(p_sample_id) and exists (select 1 from public.cads where sample_id = p_sample_id) then
      raise exception 'A CAD has already been made for this sample, so it cannot be taken back from CAD';
    end if;
    update public.samples set sent_to_cad_at = null, sent_to_cad_by = null where id = p_sample_id;
    return;
  end if;

  if not (private.is_management() or private.is_admin()) then
    raise exception 'Only people in department Management can send a sample to CAD';
  end if;
  if private.is_sample_closed(p_sample_id) then
    raise exception 'This sample is closed because its initial approval is No. Nothing more can be done on it';
  end if;
  if private.sample_is_approved(p_sample_id) then
    raise exception 'This sample has its final approval, so it is with CAD already';
  end if;
  if v_sample.sent_to_cad_at is not null then
    raise exception 'This sample has already been sent to CAD';
  end if;
  update public.samples set sent_to_cad_at = now(), sent_to_cad_by = v_me where id = p_sample_id;
end
$function$;
revoke all on function public.send_sample_to_cad(uuid, boolean) from public, anon;
grant execute on function public.send_sample_to_cad(uuid, boolean) to authenticated;
