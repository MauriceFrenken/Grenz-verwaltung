-- Benutzer-Mandanten-Zuordnung (ergänzt bestehende profiles-Tabelle)

alter table public.profiles
  add column if not exists alle_mandanten boolean not null default true;

create table if not exists public.benutzer_mandanten (
  benutzer_id uuid not null references public.profiles (id) on delete cascade,
  mandant_id text not null references public.mandanten (id) on delete cascade,
  primary key (benutzer_id, mandant_id)
);

create index if not exists benutzer_mandanten_mandant_id_idx
  on public.benutzer_mandanten (mandant_id);

alter table public.benutzer_mandanten enable row level security;

drop policy if exists benutzer_mandanten_select on public.benutzer_mandanten;
create policy benutzer_mandanten_select on public.benutzer_mandanten
  for select to authenticated
  using (
    auth.uid() = benutzer_id
    or ((auth.jwt() -> 'app_metadata') ->> 'rolle') in ('op_admin', 'administrator', 'manager')
  );

drop policy if exists profiles_select_verwaltung on public.profiles;
create policy profiles_select_verwaltung on public.profiles
  for select to authenticated
  using (
    ((auth.jwt() -> 'app_metadata') ->> 'rolle') in ('administrator', 'manager')
  );

update public.profiles set alle_mandanten = true where alle_mandanten is distinct from true;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('mandanten', '*')
where id in (select id from public.profiles)
  and coalesce(raw_app_meta_data ->> 'mandanten', '') = '';
