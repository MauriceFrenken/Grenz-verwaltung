-- Zuordnung EBICS-Bankbuchung -> Darlehen
create table if not exists public.darlehen_buchungen (
  id uuid primary key default gen_random_uuid(),
  darlehen_id text not null references public.darlehen(id) on delete cascade,
  bankbuchung_id uuid not null references public.bankbuchungen(id) on delete cascade,
  fingerprint text,
  buchungsdatum date not null,
  betrag numeric not null,
  gesellschaft_id text,
  seite text check (seite in ('geber','nehmer','bank')),
  typ text not null check (typ in ('Auszahlung','Rückzahlung','Zinsen','Tilgung','Rate','unklar')),
  zins_anteil numeric,
  tilgung_anteil numeric,
  zuordnung text not null default 'auto' check (zuordnung in ('auto','manuell')),
  regel text,
  created_at timestamptz not null default now()
);
create unique index if not exists darlehen_buchungen_uniq on public.darlehen_buchungen (darlehen_id, coalesce(fingerprint, bankbuchung_id::text));
create index if not exists darlehen_buchungen_darlehen on public.darlehen_buchungen (darlehen_id, buchungsdatum);
create index if not exists darlehen_buchungen_bankbuchung on public.darlehen_buchungen (bankbuchung_id);
alter table public.darlehen_buchungen enable row level security;
create policy darlehen_buchungen_select on public.darlehen_buchungen for select to authenticated using (true);
create policy darlehen_buchungen_write on public.darlehen_buchungen for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

create or replace function public.norm_name(t text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(lower(coalesce(t,'')), '[^a-zäöüß0-9]', '', 'g')
$$;
create or replace function public.de_betrag(t text) returns numeric
language sql immutable set search_path = public as $$
  select nullif(replace(replace(t,'.',''),',','.'),'')::numeric
$$;
