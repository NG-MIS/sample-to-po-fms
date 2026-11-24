-- =====================================================================
-- References and tags on a sample.
--   * A reference now carries its own picture, uploaded once in Masters.
--   * A sample can have several references (still optional). Their pictures
--     come from the master; the sample no longer has its own reference picture.
--   * New master: Tags. A sample can have several tags (optional). A tag that
--     is not in the list yet can be added while saving the sample.
-- =====================================================================

-- ---------- References get a picture ----------------------------------

alter table public.sample_reference_options
  add column image_path text check (image_path is null or btrim(image_path) <> '');
grant insert (image_path), update (image_path) on public.sample_reference_options to authenticated;

-- ---------- References of a sample ------------------------------------

create table public.sample_references (
  sample_id uuid not null references public.samples (id) on delete cascade,
  reference_id uuid not null references public.sample_reference_options (id),
  primary key (sample_id, reference_id)
);
create index sample_references_reference_id_idx on public.sample_references (reference_id);

alter table public.sample_references enable row level security;
create policy "People see references of samples they can see" on public.sample_references
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id));
revoke all on public.sample_references from anon, authenticated;
grant select on public.sample_references to authenticated;

-- Carry over what is already there: the one reference of each sample, and
-- the picture uploaded on a sample becomes the picture of that reference
-- (the newest one, when a reference has no picture yet).
insert into public.sample_references (sample_id, reference_id)
select id, reference_option_id from public.samples where reference_option_id is not null;

update public.sample_reference_options o
set image_path = (
  select s.reference_image_path
  from public.samples s
  where s.reference_option_id = o.id and s.reference_image_path is not null
  order by s.created_at desc
  limit 1
)
where o.image_path is null;

-- Reference pictures are visible to every signed-in person, like the list itself.
drop policy "People can view files of samples they can see" on storage.objects;
create policy "People can view files of samples they can see" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'samples'
    and (select private.current_app_user_id()) is not null
    and (
      owner_id = (select auth.uid())::text
      or (select private.is_admin())
      or exists (select 1 from public.samples s where s.concept_image_path = objects.name)
      or exists (select 1 from public.sample_reference_options o where o.image_path = objects.name)
      or exists (select 1 from public.sample_remarks r where r.file_path = objects.name)
      or exists (select 1 from public.sample_stage_images i where i.file_path = objects.name)
    )
  );

alter table public.samples drop column reference_option_id, drop column reference_image_path;

-- ---------- Tags master (a simple list) -------------------------------
-- Stored without the # sign; the screens show it with one.

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  sl_no bigint generated always as identity unique,
  name text not null check (btrim(name) <> '' and left(btrim(name), 1) <> '#' and char_length(name) <= 40),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users (id)
);
create unique index tags_name_key on public.tags (lower(btrim(name)));
create index tags_created_by_idx on public.tags (created_by);
create trigger stamp_row before insert on public.tags
  for each row execute function private.stamp_row();

alter table public.tags enable row level security;
create policy "Signed-in people can view" on public.tags
  for select to authenticated
  using ((select private.current_app_user_id()) is not null);
create policy "Authority All can add" on public.tags
  for insert to authenticated
  with check ((select private.is_admin()));
create policy "Authority All can change" on public.tags
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
revoke all on public.tags from anon, authenticated;
grant select, insert (name, is_active), update (name, is_active) on public.tags to authenticated;

-- ---------- Tags of a sample ------------------------------------------

create table public.sample_tags (
  sample_id uuid not null references public.samples (id) on delete cascade,
  tag_id uuid not null references public.tags (id),
  primary key (sample_id, tag_id)
);
create index sample_tags_tag_id_idx on public.sample_tags (tag_id);

alter table public.sample_tags enable row level security;
create policy "People see tags of samples they can see" on public.sample_tags
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id));
revoke all on public.sample_tags from anon, authenticated;
grant select on public.sample_tags to authenticated;

-- ---------- save_sample: several references, tags ---------------------
-- p_reference_ids -> the references of the sample (optional, any number).
-- p_tag_ids       -> tags picked from the list (optional, any number).
-- p_new_tags      -> tag names typed on the form. One that is already in the
--                    list is simply used; the others are added to the list.
-- A reference or tag being newly put on a sample must be active; one already
-- on the sample may stay even if it was switched inactive since.

drop function public.save_sample(uuid, uuid, date, uuid, text, uuid, text, jsonb, uuid[], text, uuid, uuid);

create function public.save_sample(
  p_id uuid,
  p_series_id uuid,
  p_creation_date date,
  p_designer_id uuid,
  p_concept_image_path text,
  p_reference_ids uuid[],
  p_remarks jsonb,
  p_component_ids uuid[],
  p_denim_type text,
  p_product_type_id uuid,
  p_collection_id uuid,
  p_tag_ids uuid[],
  p_new_tags text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_app_user_id();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_remarks jsonb := coalesce(p_remarks, '[]'::jsonb);
  v_concept text := nullif(btrim(p_concept_image_path), '');
  v_components uuid[];
  v_references uuid[];
  v_tags uuid[];
  v_new_tag text;
  v_tag public.tags;
  v_old public.samples;
  v_active boolean;
  v_prefix text;
  v_number bigint;
  v_id uuid;
  v_no text;
  v_keep uuid[];
begin
  if v_me is null then
    raise exception 'You are not signed in';
  end if;
  if p_creation_date is null then
    raise exception 'Creation date is required';
  end if;
  if p_creation_date > v_today then
    raise exception 'Creation date cannot be in the future';
  end if;
  if p_designer_id is null then
    raise exception 'Designer is required';
  end if;
  if v_concept is null then
    raise exception 'Concept image is required';
  end if;
  if jsonb_typeof(v_remarks) <> 'array' then
    raise exception 'Remarks are not in the expected form';
  end if;
  if p_denim_type is null or p_denim_type not in ('denim', 'non_denim') then
    raise exception 'Choose the denim type: Denim or Non denim';
  end if;
  if p_product_type_id is null then
    raise exception 'Product type is required';
  end if;
  if p_collection_id is null then
    raise exception 'Collection is required';
  end if;

  select coalesce(array_agg(distinct c), '{}') into v_components
  from unnest(coalesce(p_component_ids, '{}')) as c
  where c is not null;
  if cardinality(v_components) = 0 then
    raise exception 'Choose at least one component';
  end if;
  if (select count(*) from public.components where id = any (v_components)) <> cardinality(v_components) then
    raise exception 'A chosen component does not exist';
  end if;

  select coalesce(array_agg(distinct r), '{}') into v_references
  from unnest(coalesce(p_reference_ids, '{}')) as r
  where r is not null;
  if (select count(*) from public.sample_reference_options where id = any (v_references)) <> cardinality(v_references) then
    raise exception 'A chosen reference does not exist';
  end if;

  select coalesce(array_agg(distinct t), '{}') into v_tags
  from unnest(coalesce(p_tag_ids, '{}')) as t
  where t is not null;
  if (select count(*) from public.tags where id = any (v_tags)) <> cardinality(v_tags) then
    raise exception 'A chosen tag does not exist';
  end if;

  if p_id is not null then
    if not private.is_admin() then
      raise exception 'Only people with authority All can change a sample';
    end if;
    select * into v_old from public.samples where id = p_id for update;
    if not found then
      raise exception 'Sample not found';
    end if;
  elsif not private.can_create_samples() then
    raise exception 'Only people with the role Designer or authority All can create a sample';
  end if;

  if exists (
    select 1 from public.sample_reference_options o
    where o.id = any (v_references) and not o.is_active
      and not exists (select 1 from public.sample_references sr where sr.sample_id = p_id and sr.reference_id = o.id)
  ) then
    raise exception 'A newly chosen reference is inactive';
  end if;
  if exists (
    select 1 from public.tags t
    where t.id = any (v_tags) and not t.is_active
      and not exists (select 1 from public.sample_tags st where st.sample_id = p_id and st.tag_id = t.id)
  ) then
    raise exception 'A newly chosen tag is inactive';
  end if;

  -- Tags typed on the form: tidy the name, then use the one in the list or add it.
  for v_new_tag in
    select distinct on (lower(n)) n
    from (
      select btrim(regexp_replace(ltrim(btrim(raw), '#'), '\s+', ' ', 'g')) as n
      from unnest(coalesce(p_new_tags, '{}')) as raw
    ) as tidy
    where n <> ''
    order by lower(n), n
  loop
    if char_length(v_new_tag) > 40 then
      raise exception 'A tag can be at most 40 characters long';
    end if;
    insert into public.tags (name) values (v_new_tag)
    on conflict (lower(btrim(name))) do nothing;
    select * into v_tag from public.tags where lower(btrim(name)) = lower(v_new_tag);
    if not v_tag.is_active
      and not exists (select 1 from public.sample_tags st where st.sample_id = p_id and st.tag_id = v_tag.id) then
      raise exception 'The tag #% is in the list but inactive. A person with authority All can switch it on in Masters', v_tag.name;
    end if;
    if v_tag.id <> all (v_tags) then
      v_tags := v_tags || v_tag.id;
    end if;
  end loop;

  -- A product type or collection being newly chosen must be active. One already
  -- on the sample may stay even if it was switched inactive since.
  select is_active into v_active from public.product_types where id = p_product_type_id;
  if v_active is null then
    raise exception 'The chosen product type does not exist';
  end if;
  if not v_active and p_product_type_id is distinct from v_old.product_type_id then
    raise exception 'The chosen product type is inactive';
  end if;
  select is_active into v_active from public.collections where id = p_collection_id;
  if v_active is null then
    raise exception 'The chosen collection does not exist';
  end if;
  if not v_active and p_collection_id is distinct from v_old.collection_id then
    raise exception 'The chosen collection is inactive';
  end if;

  if p_id is null then
    if not private.is_sample_designer(p_designer_id) then
      raise exception 'The designer must be an active person in department Sample with the role Designer';
    end if;
    if exists (select 1 from public.components where id = any (v_components) and not is_active) then
      raise exception 'A chosen component is inactive';
    end if;

    update public.sample_series
    set last_number = coalesce(last_number, start_number - 1) + 1
    where id = p_series_id and is_active
    returning prefix, last_number into v_prefix, v_number;
    if v_prefix is null then
      raise exception 'Choose an active prefix';
    end if;

    v_no := v_prefix || '-' || v_number;
    insert into public.samples
      (sample_no, series_id, series_number, creation_date, designer_id, concept_image_path,
       denim_type, product_type_id, collection_id, created_by)
    values
      (v_no, p_series_id, v_number, p_creation_date, p_designer_id, v_concept,
       p_denim_type, p_product_type_id, p_collection_id, v_me)
    returning id into v_id;
  else
    if p_designer_id <> v_old.designer_id and not private.is_sample_designer(p_designer_id) then
      raise exception 'The designer must be an active person in department Sample with the role Designer';
    end if;
    if exists (
      select 1
      from public.components c
      where c.id = any (v_components)
        and not c.is_active
        and not exists (
          select 1 from public.sample_components sc
          where sc.sample_id = p_id and sc.component_id = c.id
        )
    ) then
      raise exception 'A newly chosen component is inactive';
    end if;

    update public.samples
    set creation_date = p_creation_date,
        designer_id = p_designer_id,
        concept_image_path = v_concept,
        denim_type = p_denim_type,
        product_type_id = p_product_type_id,
        collection_id = p_collection_id
    where id = p_id;
    v_id := p_id;
    v_no := v_old.sample_no;
  end if;

  delete from public.sample_components
  where sample_id = v_id and component_id <> all (v_components);
  insert into public.sample_components (sample_id, component_id)
  select v_id, c from unnest(v_components) as c
  on conflict do nothing;

  delete from public.sample_references
  where sample_id = v_id and reference_id <> all (v_references);
  insert into public.sample_references (sample_id, reference_id)
  select v_id, r from unnest(v_references) as r
  on conflict do nothing;

  delete from public.sample_tags
  where sample_id = v_id and tag_id <> all (v_tags);
  insert into public.sample_tags (sample_id, tag_id)
  select v_id, t from unnest(v_tags) as t
  on conflict do nothing;

  select coalesce(array_agg((e ->> 'id')::uuid), '{}')
  into v_keep
  from jsonb_array_elements(v_remarks) as e
  where nullif(e ->> 'id', '') is not null;

  delete from public.sample_remarks
  where sample_id = v_id and id <> all (v_keep);

  insert into public.sample_remarks (sample_id, kind, body, file_path, created_by)
  select v_id,
         e ->> 'kind',
         case when e ->> 'kind' = 'text' then btrim(e ->> 'body') end,
         case when e ->> 'kind' in ('voice', 'image') then e ->> 'file_path' end,
         v_me
  from jsonb_array_elements(v_remarks) as e
  where nullif(e ->> 'id', '') is null;

  return v_no;
end
$$;

revoke all on function public.save_sample(uuid, uuid, date, uuid, text, uuid[], jsonb, uuid[], text, uuid, uuid, uuid[], text[]) from public, anon;
grant execute on function public.save_sample(uuid, uuid, date, uuid, text, uuid[], jsonb, uuid[], text, uuid, uuid, uuid[], text[]) to authenticated;
