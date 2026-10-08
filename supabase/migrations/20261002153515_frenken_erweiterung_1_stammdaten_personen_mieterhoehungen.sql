-- Aus der Produktivdatenbank übernommen (08.10.2026): war angewendet, fehlte im Repo.
-- Erweiterung 1 FRENKEN Gruppe (02.10.2026): rein additiv, keine bestehenden Daten werden geaendert oder geloescht.

-- Gesellschaften: Rechtsform
alter table public.gesellschaften
  add column if not exists rechtsform text
  check (rechtsform is null or rechtsform in ('GmbH','GbR','eGbR','privat'));

-- Objekte: Ablage-Nummer und Eckdaten
alter table public.objekte
  add column if not exists ablage_id text unique
    check (ablage_id is null or ablage_id ~ '^IM-[0-9]{4}-[0-9]{3}$'),
  add column if not exists strategie text
    check (strategie is null or strategie in ('bestand','aufteiler','gewerbe')),
  add column if not exists kaufdatum date,
  add column if not exists kaufpreis numeric check (kaufpreis is null or kaufpreis >= 0),
  add column if not exists verkaufsdatum date;
comment on column public.objekte.ablage_id is 'Objektnummer der OneDrive-Ablage (IM-JJJJ-NNN). Die interne id (O-01 usw.) bleibt unveraendert.';

-- Mietverhaeltnisse: Beleg-Verknuepfung
alter table public.mietverhaeltnisse
  add column if not exists beleg_pfad text,
  add column if not exists beleg_geprueft boolean not null default false;
comment on column public.mietverhaeltnisse.beleg_geprueft is 'true, sobald die Werte gegen den Mietvertrag geprueft sind. false = Beleg fehlt oder ungeprueft.';

-- Personen (gruppenweit)
create table if not exists public.personen (
  id uuid primary key default gen_random_uuid(),
  typ text not null default 'mieter'
    check (typ in ('mieter','kaeufer','makler','bank','gesellschafter','dienstleister','sonstige')),
  anrede text,
  vorname text,
  nachname text,
  firma text,
  telefon text,
  e_mail text,
  anschrift text,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(btrim(nachname),'') <> '' or coalesce(btrim(firma),'') <> '')
);
create trigger personen_set_updated_at before update on public.personen
  for each row execute function public.set_updated_at();

-- Mehrere Personen je Mietvertrag
create table if not exists public.mietverhaeltnis_personen (
  mietverhaeltnis_id uuid not null references public.mietverhaeltnisse(id) on delete cascade,
  person_id uuid not null references public.personen(id) on delete restrict,
  rolle text not null default 'hauptmieter' check (rolle in ('hauptmieter','mitmieter','buerge')),
  created_at timestamptz not null default now(),
  primary key (mietverhaeltnis_id, person_id)
);
create index if not exists mietverhaeltnis_personen_person_idx on public.mietverhaeltnis_personen(person_id);

-- Mieterhoehungen (Historie)
create table if not exists public.mieterhoehungen (
  id uuid primary key default gen_random_uuid(),
  mietverhaeltnis_id uuid not null references public.mietverhaeltnisse(id) on delete cascade,
  verlangt_am date,
  wirksam_ab date not null,
  alte_miete numeric check (alte_miete is null or alte_miete >= 0),
  neue_miete numeric not null check (neue_miete >= 0),
  grundlage text check (grundlage is null or grundlage in ('558_vergleichsmiete','index','staffel','vereinbarung','modernisierung')),
  status text not null default 'verlangt' check (status in ('geplant','verlangt','zugestimmt','abgelehnt','ersetzt','wirksam')),
  beleg_pfad text,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mieterhoehungen_mv_idx on public.mieterhoehungen(mietverhaeltnis_id);
create trigger mieterhoehungen_set_updated_at before update on public.mieterhoehungen
  for each row execute function public.set_updated_at();

-- Zugriffsregeln wie bei den bestehenden Tabellen
alter table public.personen enable row level security;
alter table public.mietverhaeltnis_personen enable row level security;
alter table public.mieterhoehungen enable row level security;

create policy personen_select on public.personen for select to authenticated using (true);
create policy personen_write on public.personen for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy mietverhaeltnis_personen_select on public.mietverhaeltnis_personen for select to authenticated using (true);
create policy mietverhaeltnis_personen_write on public.mietverhaeltnis_personen for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy mieterhoehungen_select on public.mieterhoehungen for select to authenticated using (true);
create policy mieterhoehungen_write on public.mieterhoehungen for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
