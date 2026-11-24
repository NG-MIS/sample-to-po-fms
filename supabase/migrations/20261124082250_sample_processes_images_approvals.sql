-- =====================================================================
-- Step 3: what happens to a sample after it is created.
--   * Process log: each of the two physical pieces is sent out to
--     processes (process + vendor + sent date) and received back later.
--   * Completion of the 1st and the 2nd piece.
--   * Stage images: 1st sample, 2nd sample, photoshoot.
--   * Approval: 1st approval and final approval, for the sample as a whole.
-- =====================================================================

-- ---------- Two new masters (simple lists) ----------------------------

create table public.processes (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);

do $$
declare
  t text;
begin
  foreach t in array array['processes', 'vendors'] loop
    execute format('create unique index %I on public.%I (lower(btrim(name)))', t || '_name_key', t);
    execute format('create index %I on public.%I (created_by)', t || '_created_by_idx', t);
    execute format('create trigger stamp_row before insert on public.%I for each row execute function private.stamp_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Signed-in people can view" on public.%I for select to authenticated using ((select private.current_app_user_id()) is not null)', t);
    execute format('create policy "Authority All can add" on public.%I for insert to authenticated with check ((select private.is_admin()))', t);
    execute format('create policy "Authority All can change" on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert (name, is_active), update (name, is_active) on public.%I to authenticated', t);
  end loop;
end
$$;

-- ---------- Department "Management" is now a system name --------------
-- People in department Management approve samples.

insert into public.departments (name)
select 'Management'
where not exists (select 1 from public.departments where lower(btrim(name)) = 'management');

create or replace function private.guard_system_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_table_name = 'departments' and lower(btrim(old.name)) in ('sample', 'management'))
     or (tg_table_name = 'roles' and lower(btrim(old.name)) = 'designer')
  then
    if lower(btrim(new.name)) <> lower(btrim(old.name)) or not new.is_active then
      raise exception '"%" is used by the system to decide who may do what, so it cannot be renamed or switched inactive', old.name;
    end if;
  end if;
  return new;
end
$$;

-- ---------- Who may do what -------------------------------------------

-- Looks after the Sample department: authority All, or authority
-- Department(s) with Sample among the ticked departments.
create function private.manages_samples()
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
        or (
          me.authority = 'departments'
          and exists (
            select 1
            from public.user_authority_departments ad
            join public.departments d on d.id = ad.department_id
            where ad.user_id = me.id and lower(btrim(d.name)) = 'sample'
          )
        )
      )
  )
$$;

-- May update the process log and stage images of one sample:
-- the designer named on it, or anyone who looks after the Sample department.
create function private.can_work_on_sample(p_sample_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.manages_samples()
      or exists (
        select 1
        from public.samples s
        where s.id = p_sample_id and s.designer_id = private.current_app_user_id()
      )
$$;

-- May approve samples: department Management, or authority All.
create function private.is_management()
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
          where d.id = me.department_id and lower(btrim(d.name)) = 'management'
        )
      )
  )
$$;

-- People in Management see every sample, because they approve any sample.
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
          where d.id = me.department_id and lower(btrim(d.name)) = 'management'
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

revoke all on function private.manages_samples() from public;
revoke all on function private.can_work_on_sample(uuid) from public;
revoke all on function private.is_management() from public;
grant execute on function private.manages_samples() to authenticated;
grant execute on function private.can_work_on_sample(uuid) to authenticated;
grant execute on function private.is_management() to authenticated;

-- ---------- Tables ----------------------------------------------------

-- One row each time a piece is sent out to a process. RECD DATE is filled later.
create table public.sample_process_entries (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  sample_id uuid not null references public.samples (id) on delete cascade,
  piece smallint not null check (piece in (1, 2)),
  process_id uuid not null references public.processes (id),
  vendor_id uuid not null references public.vendors (id),
  sent_date date not null,
  received_date date,
  received_at timestamptz,
  received_by uuid references public.app_users (id),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.app_users (id),
  constraint sample_process_entries_dates check (received_date is null or received_date >= sent_date)
);
create index sample_process_entries_sample_id_idx on public.sample_process_entries (sample_id);
create index sample_process_entries_process_id_idx on public.sample_process_entries (process_id);
create index sample_process_entries_vendor_id_idx on public.sample_process_entries (vendor_id);
create index sample_process_entries_created_by_idx on public.sample_process_entries (created_by);
create index sample_process_entries_received_by_idx on public.sample_process_entries (received_by);

-- A row here means that piece of the sample has been marked completed.
create table public.sample_piece_completions (
  sample_id uuid not null references public.samples (id) on delete cascade,
  piece smallint not null check (piece in (1, 2)),
  completed_at timestamptz not null default now(),
  completed_by uuid not null references public.app_users (id),
  primary key (sample_id, piece)
);
create index sample_piece_completions_completed_by_idx on public.sample_piece_completions (completed_by);

-- The later stage images. (The concept image stays on the sample itself.)
create table public.sample_stage_images (
  sample_id uuid not null references public.samples (id) on delete cascade,
  stage text not null check (stage in ('first', 'second', 'photoshoot')),
  file_path text not null check (btrim(file_path) <> ''),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.app_users (id),
  primary key (sample_id, stage)
);
create index sample_stage_images_file_path_idx on public.sample_stage_images (file_path);
create index sample_stage_images_created_by_idx on public.sample_stage_images (created_by);

-- The current 1st and final approval of a sample.
create table public.sample_approvals (
  sample_id uuid not null references public.samples (id) on delete cascade,
  stage text not null check (stage in ('first', 'final')),
  decision text not null,
  remarks text,
  decided_at timestamptz not null default now(),
  decided_by uuid not null references public.app_users (id),
  primary key (sample_id, stage),
  constraint sample_approvals_decision check (
    (stage = 'first' and decision in ('yes', 'no', 'maybe'))
    or (stage = 'final' and decision in ('yes', 'no'))
  )
);
create index sample_approvals_decided_by_idx on public.sample_approvals (decided_by);

-- Every approval ever given or changed, so nothing is lost when one is changed.
create table public.sample_approval_history (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.samples (id) on delete cascade,
  stage text not null,
  decision text not null,
  remarks text,
  action text not null check (action in ('given', 'changed')),
  changed_at timestamptz not null default now(),
  changed_by uuid not null references public.app_users (id)
);
create index sample_approval_history_sample_id_idx on public.sample_approval_history (sample_id);
create index sample_approval_history_changed_by_idx on public.sample_approval_history (changed_by);

-- Anyone who can see a sample can see these; nobody writes to them directly.
do $$
declare
  t text;
begin
  foreach t in array array['sample_process_entries', 'sample_piece_completions', 'sample_stage_images',
                           'sample_approvals', 'sample_approval_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "People see this for samples they can see" on public.%I for select to authenticated using (exists (select 1 from public.samples s where s.id = sample_id))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end
$$;

-- ---------- Process log ------------------------------------------------

create function public.send_sample_process(
  p_sample_id uuid,
  p_piece smallint,
  p_process_id uuid,
  p_vendor_id uuid,
  p_sent_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not exists (select 1 from public.samples where id = p_sample_id) then
    raise exception 'Sample not found';
  end if;
  if not private.can_work_on_sample(p_sample_id) then
    raise exception 'Only the designer of this sample, or a person with Department(s) authority that includes Sample, can update its process log';
  end if;
  if p_piece is null or p_piece not in (1, 2) then
    raise exception 'Choose the piece: 1st sample or 2nd sample';
  end if;
  if exists (select 1 from public.sample_piece_completions where sample_id = p_sample_id and piece = p_piece) then
    raise exception 'This piece is already completed, so nothing more can be sent';
  end if;
  if not exists (select 1 from public.processes where id = p_process_id and is_active) then
    raise exception 'Choose an active process';
  end if;
  if not exists (select 1 from public.vendors where id = p_vendor_id and is_active) then
    raise exception 'Choose an active vendor';
  end if;
  if p_sent_date is null then
    raise exception 'Sent date is required';
  end if;
  if p_sent_date > v_today then
    raise exception 'Sent date cannot be in the future';
  end if;

  insert into public.sample_process_entries (sample_id, piece, process_id, vendor_id, sent_date, created_by)
  values (p_sample_id, p_piece, p_process_id, p_vendor_id, p_sent_date, v_me)
  returning id into v_id;
  return v_id;
end
$$;

create function public.receive_sample_process(p_entry_id uuid, p_received_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_entry public.sample_process_entries;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  select * into v_entry from public.sample_process_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Process entry not found';
  end if;
  if not private.can_work_on_sample(v_entry.sample_id) then
    raise exception 'Only the designer of this sample, or a person with Department(s) authority that includes Sample, can update its process log';
  end if;
  if v_entry.received_date is not null then
    raise exception 'This entry has already been received';
  end if;
  if p_received_date is null then
    raise exception 'Received date is required';
  end if;
  if p_received_date < v_entry.sent_date then
    raise exception 'Received date cannot be before the sent date';
  end if;
  if p_received_date > v_today then
    raise exception 'Received date cannot be in the future';
  end if;

  update public.sample_process_entries
  set received_date = p_received_date, received_at = now(), received_by = v_me
  where id = p_entry_id;
end
$$;

-- Correcting a mistake in an entry: authority All only.
create function public.correct_sample_process(
  p_entry_id uuid,
  p_piece smallint,
  p_process_id uuid,
  p_vendor_id uuid,
  p_sent_date date,
  p_received_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_entry public.sample_process_entries;
begin
  if not private.is_admin() then
    raise exception 'Only people with authority All can correct a process entry';
  end if;
  select * into v_entry from public.sample_process_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Process entry not found';
  end if;
  if p_piece is null or p_piece not in (1, 2) then
    raise exception 'Choose the piece: 1st sample or 2nd sample';
  end if;
  if not exists (select 1 from public.processes where id = p_process_id) then
    raise exception 'Choose a process';
  end if;
  if not exists (select 1 from public.vendors where id = p_vendor_id) then
    raise exception 'Choose a vendor';
  end if;
  if p_sent_date is null then
    raise exception 'Sent date is required';
  end if;
  if p_sent_date > v_today or p_received_date > v_today then
    raise exception 'Dates cannot be in the future';
  end if;
  if p_received_date < p_sent_date then
    raise exception 'Received date cannot be before the sent date';
  end if;
  if p_received_date is null
     and exists (select 1 from public.sample_piece_completions where sample_id = v_entry.sample_id and piece = p_piece)
  then
    raise exception 'That piece is completed, so its entries must have a received date. Reopen the piece first';
  end if;

  update public.sample_process_entries
  set piece = p_piece,
      process_id = p_process_id,
      vendor_id = p_vendor_id,
      sent_date = p_sent_date,
      received_date = p_received_date,
      received_at = case when p_received_date is null then null else coalesce(received_at, now()) end,
      received_by = case when p_received_date is null then null else coalesce(received_by, v_me) end
  where id = p_entry_id;
end
$$;

-- ---------- Completion of a piece --------------------------------------

create function public.complete_sample_piece(p_sample_id uuid, p_piece smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not private.manages_samples() then
    raise exception 'Only a person with Department(s) authority that includes Sample can mark a piece completed';
  end if;
  if not exists (select 1 from public.samples where id = p_sample_id) then
    raise exception 'Sample not found';
  end if;
  if p_piece is null or p_piece not in (1, 2) then
    raise exception 'Choose the piece: 1st sample or 2nd sample';
  end if;
  if exists (select 1 from public.sample_piece_completions where sample_id = p_sample_id and piece = p_piece) then
    raise exception 'This piece is already completed';
  end if;
  if exists (
    select 1 from public.sample_process_entries
    where sample_id = p_sample_id and piece = p_piece and received_date is null
  ) then
    raise exception 'This piece is at a vendor. Receive it back before marking it completed';
  end if;

  insert into public.sample_piece_completions (sample_id, piece, completed_by)
  values (p_sample_id, p_piece, v_me);
end
$$;

-- Undoing a completion: authority All only.
create function public.reopen_sample_piece(p_sample_id uuid, p_piece smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only people with authority All can reopen a completed piece';
  end if;
  delete from public.sample_piece_completions where sample_id = p_sample_id and piece = p_piece;
  if not found then
    raise exception 'This piece is not completed';
  end if;
end
$$;

-- ---------- Stage images ------------------------------------------------

create function public.set_sample_stage_image(p_sample_id uuid, p_stage text, p_file_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_path text := nullif(btrim(p_file_path), '');
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not exists (select 1 from public.samples where id = p_sample_id) then
    raise exception 'Sample not found';
  end if;
  if not private.can_work_on_sample(p_sample_id) then
    raise exception 'Only the designer of this sample, or a person with Department(s) authority that includes Sample, can update its images';
  end if;
  if p_stage is null or p_stage not in ('first', 'second', 'photoshoot') then
    raise exception 'Choose the image: 1st sample, 2nd sample or photoshoot';
  end if;
  if v_path is null then
    raise exception 'A picture is required';
  end if;

  insert into public.sample_stage_images (sample_id, stage, file_path, created_by)
  values (p_sample_id, p_stage, v_path, v_me)
  on conflict (sample_id, stage)
  do update set file_path = excluded.file_path, created_at = now(), created_by = excluded.created_by;
end
$$;

-- ---------- Approval ----------------------------------------------------
-- Given once by a person in Management. After that, only authority All can change it.

create function public.set_sample_approval(p_sample_id uuid, p_stage text, p_decision text, p_remarks text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_remarks text := nullif(btrim(p_remarks), '');
  v_exists boolean;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if not exists (select 1 from public.samples where id = p_sample_id) then
    raise exception 'Sample not found';
  end if;
  if p_stage is null or p_stage not in ('first', 'final') then
    raise exception 'Choose 1st approval or final approval';
  end if;
  if p_stage = 'first' and (p_decision is null or p_decision not in ('yes', 'no', 'maybe')) then
    raise exception '1st approval must be Yes, No or Maybe';
  end if;
  if p_stage = 'final' and (p_decision is null or p_decision not in ('yes', 'no')) then
    raise exception 'Final approval must be Yes or No';
  end if;

  v_exists := exists (select 1 from public.sample_approvals where sample_id = p_sample_id and stage = p_stage);

  if v_exists then
    if not private.is_admin() then
      raise exception 'This approval has already been given. Only a person with authority All can change it';
    end if;
  else
    if not private.is_management() then
      raise exception 'Only people in department Management can approve a sample';
    end if;
    if p_stage = 'first'
       and exists (select 1 from public.sample_approvals where sample_id = p_sample_id and stage = 'final')
    then
      raise exception 'The final approval has already been given, so a 1st approval can no longer be added';
    end if;
  end if;

  insert into public.sample_approvals (sample_id, stage, decision, remarks, decided_by)
  values (p_sample_id, p_stage, p_decision, v_remarks, v_me)
  on conflict (sample_id, stage)
  do update set decision = excluded.decision, remarks = excluded.remarks,
                decided_at = now(), decided_by = excluded.decided_by;

  insert into public.sample_approval_history (sample_id, stage, decision, remarks, action, changed_by)
  values (p_sample_id, p_stage, p_decision, v_remarks, case when v_exists then 'changed' else 'given' end, v_me);
end
$$;

revoke all on function public.send_sample_process(uuid, smallint, uuid, uuid, date) from public, anon;
revoke all on function public.receive_sample_process(uuid, date) from public, anon;
revoke all on function public.correct_sample_process(uuid, smallint, uuid, uuid, date, date) from public, anon;
revoke all on function public.complete_sample_piece(uuid, smallint) from public, anon;
revoke all on function public.reopen_sample_piece(uuid, smallint) from public, anon;
revoke all on function public.set_sample_stage_image(uuid, text, text) from public, anon;
revoke all on function public.set_sample_approval(uuid, text, text, text) from public, anon;
grant execute on function public.send_sample_process(uuid, smallint, uuid, uuid, date) to authenticated;
grant execute on function public.receive_sample_process(uuid, date) to authenticated;
grant execute on function public.correct_sample_process(uuid, smallint, uuid, uuid, date, date) to authenticated;
grant execute on function public.complete_sample_piece(uuid, smallint) to authenticated;
grant execute on function public.reopen_sample_piece(uuid, smallint) to authenticated;
grant execute on function public.set_sample_stage_image(uuid, text, text) to authenticated;
grant execute on function public.set_sample_approval(uuid, text, text, text) to authenticated;

-- ---------- File store: stage images -----------------------------------
-- Uploading is now also open to people who look after the Sample department,
-- and stage images can be viewed by anyone who can see their sample.

drop policy "People can view files of samples they can see" on storage.objects;
drop policy "Sample creators can add files" on storage.objects;

create policy "People can view files of samples they can see" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'samples'
    and (select private.current_app_user_id()) is not null
    and (
      owner_id = (select auth.uid())::text
      or (select private.is_admin())
      or exists (
        select 1 from public.samples s
        where s.concept_image_path = storage.objects.name
           or s.reference_image_path = storage.objects.name
      )
      or exists (
        select 1 from public.sample_remarks r
        where r.file_path = storage.objects.name
      )
      or exists (
        select 1 from public.sample_stage_images i
        where i.file_path = storage.objects.name
      )
    )
  );
create policy "People who work on samples can add files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'samples'
    and ((select private.can_create_samples()) or (select private.manages_samples()))
  );
