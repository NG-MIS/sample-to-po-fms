-- Small per-person screen choices (which columns are shown, grouping), kept
-- with the person so they survive a refresh, another browser or a phone.
create table public.user_preferences (
  user_id uuid not null references public.app_users (id) on delete cascade,
  key text not null check (btrim(key) <> '' and char_length(key) <= 120),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_preferences enable row level security;
create policy "People see their own choices" on public.user_preferences
  for select to authenticated
  using (user_id = (select private.current_app_user_id()));
create policy "People save their own choices" on public.user_preferences
  for insert to authenticated
  with check (user_id = (select private.current_app_user_id()));
create policy "People change their own choices" on public.user_preferences
  for update to authenticated
  using (user_id = (select private.current_app_user_id()))
  with check (user_id = (select private.current_app_user_id()));
revoke all on public.user_preferences from anon, authenticated;
grant select, insert, update on public.user_preferences to authenticated;
