create table public.marktdaten (
  id uuid primary key default gen_random_uuid(),
  quelle text not null check (quelle in ('imv', 'boris_nrw', 'kaufpreissammlung', 'mietinserate', 'manuell')),
  quelle_ref text,
  art text not null check (art in ('angebotsmiete', 'vergleichsmiete', 'kaufpreis', 'kaufpreisfaktor', 'bodenrichtwert', 'leerstand', 'sonstiges')),
  objektart text,
  plz text,
  ort text,
  gemeinde text,
  lage text,
  baujahr_von integer,
  baujahr_bis integer,
  flaeche_von numeric,
  flaeche_bis numeric,
  wert numeric not null,
  wert_min numeric,
  wert_max numeric,
  einheit text not null,
  stichtag date not null,
  geo_lat double precision,
  geo_lng double precision,
  rohdaten jsonb not null default '{}'::jsonb,
  abgerufen_am timestamptz not null default now(),
  unique (quelle, quelle_ref)
);
comment on table public.marktdaten is 'Marktdaten für die indikative Bewertung: IMV (Abo), BORIS NRW, Kaufpreissammlung. Nur per Server-Import (service_role) befüllt.';
comment on column public.marktdaten.einheit is 'z. B. EUR/m² Miete mtl., EUR/m² Kaufpreis, Faktor, EUR/m² Boden.';
create index on public.marktdaten (quelle, art);
create index on public.marktdaten (plz);
create index on public.marktdaten (stichtag);
alter table public.marktdaten enable row level security;
create policy marktdaten_select on public.marktdaten for select to authenticated using (true);
insert into public.sf_sync_stand (sf_objekt) values ('IMV'), ('BORIS_NRW') on conflict do nothing;
