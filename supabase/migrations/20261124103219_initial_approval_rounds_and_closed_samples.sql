-- =====================================================================
-- Approval rules, revised.
--   * "1st approval" is now "initial approval".
--   * Initial approval can be given again and again while it is Maybe
--     ("changes requested"). Every round is kept.
--   * An initial approval of No closes the sample: no more approvals,
--     and all further work on the sample stops.
--   * Final approval is unchanged: Yes or No, given once.
-- =====================================================================

-- ---------- Approvals become rounds -----------------------------------

alter table public.sample_approvals drop constraint sample_approvals_pkey;
alter table public.sample_approvals drop constraint sample_approvals_decision;
alter table public.sample_approvals drop constraint sample_approvals_stage_check;

update public.sample_approvals set stage = 'initial' where stage = 'first';
update public.sample_approval_history set stage = 'initial' where stage = 'first';

alter table public.sample_approvals
  add column id uuid not null default gen_random_uuid(),
  add column round integer not null default 1 check (round >= 1);
alter table public.sample_approvals add primary key (id);
alter table public.sample_approvals
  add constraint sample_approvals_round_key unique (sample_id, stage, round),
  add constraint sample_approvals_stage_check check (stage in ('initial', 'final')),
  add constraint sample_approvals_decision check (
    (stage = 'initial' and decision in ('yes', 'no', 'maybe'))
    or (stage = 'final' and decision in ('yes', 'no') and round = 1)
  );

alter table public.sample_approval_history add column round integer;
update public.sample_approval_history set round = 1 where round is null;

-- ---------- A closed sample -------------------------------------------

-- The latest initial approval of a sample, or null when none was given.
create function private.latest_initial_decision(p_sample_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decision
  from public.sample_approvals
  where sample_id = p_sample_id and stage = 'initial'
  order by round desc
  limit 1
$$;

-- Closed = its latest initial approval is No.
create function private.is_sample_closed(p_sample_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.latest_initial_decision(p_sample_id) = 'no', false)
$$;

revoke all on function private.latest_initial_decision(uuid) from public;
revoke all on function private.is_sample_closed(uuid) from public;

-- Everything stops on a closed sample: nothing new can be sent to a process,
-- no piece can be marked completed, and no stage image can be added or replaced.
-- (Receiving back a piece that is already at a vendor is still allowed, so the
-- record of where the piece is stays true.)
create function private.block_closed_sample()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_sample_closed(new.sample_id) then
    raise exception 'This sample is closed because its initial approval is No. Nothing more can be done on it';
  end if;
  return new;
end
$$;
revoke all on function private.block_closed_sample() from public;

create trigger block_closed_sample before insert on public.sample_process_entries
  for each row execute function private.block_closed_sample();
create trigger block_closed_sample before insert on public.sample_piece_completions
  for each row execute function private.block_closed_sample();
create trigger block_closed_sample before insert or update on public.sample_stage_images
  for each row execute function private.block_closed_sample();

-- ---------- Giving and correcting approvals ---------------------------
-- p_correct false -> a person in Management gives an approval.
--                    Initial: allowed while there is none yet, or the latest is Maybe.
--                    Final:   allowed once, at any time before the sample is closed.
-- p_correct true  -> authority All corrects the latest decision of that stage.

drop function public.set_sample_approval(uuid, text, text, text);

create function public.set_sample_approval(
  p_sample_id uuid,
  p_stage text,
  p_decision text,
  p_remarks text,
  p_correct boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_remarks text := nullif(btrim(p_remarks), '');
  v_latest public.sample_approvals;
  v_has_final boolean;
  v_round integer;
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
    set decision = p_decision, remarks = v_remarks, decided_at = now(), decided_by = v_me
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
  insert into public.sample_approvals (sample_id, stage, round, decision, remarks, decided_by)
  values (p_sample_id, p_stage, v_round, p_decision, v_remarks, v_me);
  insert into public.sample_approval_history (sample_id, stage, round, decision, remarks, action, changed_by)
  values (p_sample_id, p_stage, v_round, p_decision, v_remarks, 'given', v_me);
end
$$;

revoke all on function public.set_sample_approval(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.set_sample_approval(uuid, text, text, text, boolean) to authenticated;
