-- Markt-Radar: täglicher KI-Lauf über Immobiliennews. Hält aktive Käufer (Investoren) und
-- mögliche Verkäufer fest, die für Grenz & Co. relevant sein könnten.
-- Schreiben nur serverseitig (service_role); Angemeldete lesen und setzen den Status.

create table if not exists public.markt_radar_laeufe (
  id uuid primary key default gen_random_uuid(),
  gestartet_am timestamptz not null default now(),
  beendet_am timestamptz,
  ausloeser text not null default 'cron' check (ausloeser in ('cron', 'manuell')),
  status text not null default 'laeuft' check (status in ('laeuft', 'fertig', 'fehler')),
  anzahl_neu integer not null default 0,
  anzahl_gesamt integer not null default 0,
  fehler text,
  kosten jsonb not null default '{}'::jsonb
);
comment on table public.markt_radar_laeufe is 'Protokoll der Markt-Radar-Läufe (täglich per Cron oder manuell).';

create table if not exists public.markt_radar_meldungen (
  id uuid primary key default gen_random_uuid(),
  seite text not null check (seite in ('kaeufer', 'verkaeufer')),
  akteur text not null,
  akteur_typ text,
  ereignis text not null,
  transaktion text,
  objektart text,
  ort text,
  volumen_eur numeric,
  ereignis_am date,
  quelle_url text not null,
  quelle_titel text,
  quelle_medium text,
  relevanz smallint not null check (relevanz between 0 and 100),
  begruendung text,
  sf_kontakt_sf_id text,
  sf_bekannt_als text,
  status text not null default 'neu' check (status in ('neu', 'gesehen', 'verworfen', 'in_salesforce')),
  status_von uuid references public.profiles(id) on delete set null,
  status_am timestamptz,
  lauf_id uuid references public.markt_radar_laeufe(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.markt_radar_meldungen is 'Aktive Käufer und mögliche Verkäufer aus Immobiliennews, je Meldung mit Quelle und Relevanz für Grenz & Co.';
comment on column public.markt_radar_meldungen.sf_kontakt_sf_id is 'Treffer im Salesforce-Cache (sf_kontakte) nach Firmenname; leer = noch nicht in Salesforce.';

-- Dieselbe Meldung (Akteur + Quelle) nur einmal je Seite.
create unique index if not exists markt_radar_meldungen_eindeutig
  on public.markt_radar_meldungen (seite, lower(akteur), quelle_url);
create index if not exists markt_radar_meldungen_liste
  on public.markt_radar_meldungen (seite, status, created_at desc);
create index if not exists markt_radar_meldungen_lauf_idx
  on public.markt_radar_meldungen (lauf_id);
create index if not exists markt_radar_meldungen_status_von_idx
  on public.markt_radar_meldungen (status_von);

alter table public.markt_radar_laeufe enable row level security;
alter table public.markt_radar_meldungen enable row level security;

drop policy if exists markt_radar_laeufe_select on public.markt_radar_laeufe;
create policy markt_radar_laeufe_select on public.markt_radar_laeufe
  for select to authenticated using (true);

drop policy if exists markt_radar_meldungen_select on public.markt_radar_meldungen;
create policy markt_radar_meldungen_select on public.markt_radar_meldungen
  for select to authenticated using (true);
