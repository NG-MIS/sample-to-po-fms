-- =====================================================================
-- Numbering: every series gets a name. The sample form shows the name;
-- the sample number is still made from the prefix (PREFIX-NUMBER).
-- The name can be changed at any time, also after numbers were given out.
-- =====================================================================

alter table public.sample_series add column name text;

-- Existing series start with their prefix as the name.
update public.sample_series set name = prefix;

alter table public.sample_series
  alter column name set not null,
  add constraint sample_series_name_check check (btrim(name) <> '');
create unique index sample_series_name_key on public.sample_series (lower(btrim(name)));

grant insert (name), update (name) on public.sample_series to authenticated;
