-- Process remarks: instructions for production on a sample, like the normal remarks
-- (typed notes, voice notes, pictures) but tagged to the departments and the processes
-- that must follow them. Written by the people who work on the sample; read by everyone
-- who can see the sample.

create table public.process_remarks (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  sample_id uuid not null references public.samples (id) on delete cascade,
  department_ids uuid[] not null default '{}',
  process_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id),
  updated_at timestamptz,
  updated_by uuid references public.app_users (id),
  constraint process_remarks_tagged check (cardinality(department_ids) + cardinality(process_ids) >= 1)
);
create index process_remarks_sample_id_idx on public.process_remarks (sample_id);
create index process_remarks_created_by_idx on public.process_remarks (created_by);
create index process_remarks_updated_by_idx on public.process_remarks (updated_by);

create table public.process_remark_items (
  id uuid primary key default gen_random_uuid(),
  remark_id uuid not null references public.process_remarks (id) on delete cascade,
  position integer not null,
  kind text not null constraint process_remark_items_kind_check check (kind = any (array['text'::text, 'voice'::text, 'image'::text])),
  body text,
  file_path text,
  constraint process_remark_items_content check (
    (kind = 'text' and btrim(coalesce(body, '')) <> '' and file_path is null)
    or (kind <> 'text' and btrim(coalesce(file_path, '')) <> '' and body is null)
  )
);
create index process_remark_items_remark_id_idx on public.process_remark_items (remark_id);
create index process_remark_items_file_path_idx on public.process_remark_items (file_path) where file_path is not null;

alter table public.process_remarks enable row level security;
alter table public.process_remark_items enable row level security;
revoke all on public.process_remarks, public.process_remark_items from public, anon, authenticated;
grant select on public.process_remarks, public.process_remark_items to authenticated;

create policy "People see process remarks of samples they can see" on public.process_remarks
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = process_remarks.sample_id));
create policy "People see the parts of process remarks they can see" on public.process_remark_items
  for select to authenticated
  using (exists (select 1 from public.process_remarks r where r.id = process_remark_items.remark_id));

-- The voice notes and pictures of a process remark can be opened by whoever can see the remark.
create policy "People can view files of process remarks they can see" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'samples'
    and (select private.current_app_user_id()) is not null
    and exists (select 1 from public.process_remark_items i where i.file_path = objects.name)
  );

-- Adds a process remark (p_id null) or changes one. Returns its id.
--   p_items: [{ kind: 'text', body }, { kind: 'voice' | 'image', file_path }]
create function public.save_process_remark(p_id uuid, p_sample_id uuid, p_department_ids uuid[], p_process_ids uuid[], p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := private.current_app_user_id();
  v_remark public.process_remarks;
  v_sample_id uuid := p_sample_id;
  v_departments uuid[] := coalesce((select array_agg(distinct d) from unnest(p_department_ids) as d where d is not null), '{}');
  v_processes uuid[] := coalesce((select array_agg(distinct p) from unnest(p_process_ids) as p where p is not null), '{}');
  e jsonb;
  v_kind text;
  v_body text;
  v_path text;
  v_position integer := 0;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if p_id is not null then
    select * into v_remark from public.process_remarks where id = p_id for update;
    if not found then
      raise exception 'Process remark not found';
    end if;
    v_sample_id := v_remark.sample_id;
  end if;
  if not exists (select 1 from public.samples where id = v_sample_id) then
    raise exception 'Choose the sample';
  end if;
  if not private.can_work_on_sample(v_sample_id) then
    raise exception 'Only the designer of this sample, or a person with department authority over Sample, can write its process remarks';
  end if;
  if cardinality(v_departments) + cardinality(v_processes) = 0 then
    raise exception 'Tag the remark to at least one department or process';
  end if;
  if exists (select 1 from unnest(v_departments) as d where not exists (select 1 from public.departments where id = d)) then
    raise exception 'A chosen department does not exist';
  end if;
  if exists (select 1 from unnest(v_processes) as p where not exists (select 1 from public.processes where id = p)) then
    raise exception 'A chosen process does not exist';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add a note, a voice note or a picture';
  end if;

  if p_id is null then
    insert into public.process_remarks (sample_id, department_ids, process_ids, created_by)
    values (v_sample_id, v_departments, v_processes, v_me)
    returning * into v_remark;
  else
    update public.process_remarks
    set department_ids = v_departments, process_ids = v_processes, updated_at = now(), updated_by = v_me
    where id = p_id;
    delete from public.process_remark_items where remark_id = p_id;
  end if;

  for e in select * from jsonb_array_elements(p_items) loop
    v_position := v_position + 1;
    v_kind := e ->> 'kind';
    v_body := nullif(btrim(e ->> 'body'), '');
    v_path := nullif(btrim(e ->> 'file_path'), '');
    if v_kind is null or v_kind not in ('text', 'voice', 'image') then
      raise exception 'A part of the remark is not a note, a voice note or a picture';
    end if;
    if v_kind = 'text' then
      if v_body is null then
        raise exception 'A typed note is empty';
      end if;
      if char_length(v_body) > 2000 then
        raise exception 'A typed note can be at most 2000 characters long';
      end if;
      insert into public.process_remark_items (remark_id, position, kind, body) values (v_remark.id, v_position, 'text', v_body);
    else
      if v_path is null then
        raise exception 'A voice note or picture was not uploaded. Try again';
      end if;
      insert into public.process_remark_items (remark_id, position, kind, file_path) values (v_remark.id, v_position, v_kind, v_path);
    end if;
  end loop;
  return v_remark.id;
end
$function$;
revoke all on function public.save_process_remark(uuid, uuid, uuid[], uuid[], jsonb) from public, anon;
grant execute on function public.save_process_remark(uuid, uuid, uuid[], uuid[], jsonb) to authenticated;

create function public.delete_process_remark(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := private.current_app_user_id();
  v_sample_id uuid;
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  select sample_id into v_sample_id from public.process_remarks where id = p_id for update;
  if not found then
    raise exception 'Process remark not found';
  end if;
  if not private.can_work_on_sample(v_sample_id) then
    raise exception 'Only the designer of this sample, or a person with department authority over Sample, can delete its process remarks';
  end if;
  delete from public.process_remarks where id = p_id;
end
$function$;
revoke all on function public.delete_process_remark(uuid) from public, anon;
grant execute on function public.delete_process_remark(uuid) to authenticated;
