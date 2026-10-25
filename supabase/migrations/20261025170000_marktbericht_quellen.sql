-- Marktbericht: Research-Berichte anderer Häuser automatisch finden und auslesen.
-- marktbericht_quellen = beobachtete Häuser und öffentliche Stellen, marktbericht_dokumente = gefundene
-- Veröffentlichungen mit ausgelesenen Kennzahlen (Bibliothek). Geschrieben nur per Server-Funktion/Cron.

create table if not exists public.marktbericht_quellen (
  id uuid primary key default gen_random_uuid(),
  kuerzel text not null unique check (kuerzel ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  suchauftrag text not null,
  aktiv boolean not null default true,
  zuletzt_gesucht timestamptz,
  letzter_fehler text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.marktbericht_quellen is 'Häuser und öffentliche Stellen, deren Marktberichte automatisch gesucht werden.';
comment on column public.marktbericht_quellen.suchauftrag is 'Hinweis für die KI-Websuche: welche Berichte, welche Website.';

create table if not exists public.marktbericht_dokumente (
  id uuid primary key default gen_random_uuid(),
  quelle_id uuid not null references public.marktbericht_quellen (id) on delete cascade,
  url text not null unique,
  titel text not null,
  art text not null default 'pdf' check (art in ('pdf', 'html')),
  stichtag date,
  region text,
  status text not null default 'neu'
    check (status in ('neu', 'ausgelesen', 'gesperrt', 'fehler', 'ohne_werte')),
  fehler text,
  versuche integer not null default 0,
  sha256 text,
  seiten integer,
  kennzahlen jsonb not null default '[]'::jsonb,
  gefunden_am timestamptz not null default now(),
  ausgelesen_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.marktbericht_dokumente is 'Gefundene Marktberichte anderer Häuser. Die Datei selbst wird nicht gespeichert, nur URL, Prüfsumme und ausgelesene Kennzahlen mit Seite und Zitat.';
comment on column public.marktbericht_dokumente.status is 'neu = noch nicht ausgelesen, gesperrt = nur gegen Registrierung/Login, ohne_werte = keine passenden Kennzahlen.';

create index if not exists marktbericht_dokumente_quelle_idx on public.marktbericht_dokumente (quelle_id, stichtag desc);
create index if not exists marktbericht_dokumente_status_idx on public.marktbericht_dokumente (status, gefunden_am);

drop trigger if exists set_updated_at on public.marktbericht_quellen;
create trigger set_updated_at before update on public.marktbericht_quellen
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.marktbericht_dokumente;
create trigger set_updated_at before update on public.marktbericht_dokumente
  for each row execute function public.set_updated_at();

alter table public.marktbericht_quellen enable row level security;
alter table public.marktbericht_dokumente enable row level security;
drop policy if exists marktbericht_quellen_select on public.marktbericht_quellen;
create policy marktbericht_quellen_select on public.marktbericht_quellen
  for select to authenticated using (true);
drop policy if exists marktbericht_dokumente_select on public.marktbericht_dokumente;
create policy marktbericht_dokumente_select on public.marktbericht_dokumente
  for select to authenticated using (true);

insert into public.marktbericht_quellen (kuerzel, name, suchauftrag) values
  ('bnpp', 'BNP Paribas Real Estate', 'Wohninvestmentmarkt Deutschland (Residential Investment), Investmentmarkt Köln und Düsseldorf, Property Reports und At a Glance; realestate.bnpparibas.de'),
  ('jll', 'JLL', 'Wohnungsmarktüberblick Deutschland, Residential City Profile Köln und Düsseldorf, Investmentmarktüberblick; jll.com/de-de'),
  ('cbre', 'CBRE', 'Wohninvestment Deutschland (Residential Investment Germany), MarketView Köln und Düsseldorf; cbre.de'),
  ('cushman', 'Cushman & Wakefield', 'MarketBeat Investment Deutschland, MarketBeat Köln und Düsseldorf, Wohninvestment; cushmanwakefield.com/de-de'),
  ('savills', 'Savills', 'Wohnungsmarkt Deutschland, Market in Minutes Wohninvestment, Köln und Düsseldorf; savills.de'),
  ('colliers', 'Colliers', 'Residential Investment Deutschland, City Report Köln und Düsseldorf, Wohn- und Geschäftshäuser; colliers.de'),
  ('ev_commercial', 'Engel & Völkers Commercial', 'Marktreport Wohn- und Geschäftshäuser Köln und Düsseldorf (Zinshäuser), Kaufpreisfaktoren nach Lagen; engelvoelkers.com'),
  ('greif_contzen', 'Greif & Contzen', 'Marktbericht Köln, Wohn- und Geschäftshäuser, Investmentmarkt Köln; greif-contzen.de'),
  ('aengevelt', 'Aengevelt Research', 'City Report Düsseldorf, Investmentmarkt Düsseldorf, Wohnen; aengevelt.com'),
  ('gaa_koeln', 'Gutachterausschuss Köln', 'Grundstücksmarktbericht der Stadt Köln (Mehrfamilienhäuser, Liegenschaftszinssätze, Rohertragsfaktoren); boris.nrw.de, stadt-koeln.de'),
  ('gaa_duesseldorf', 'Gutachterausschuss Düsseldorf', 'Grundstücksmarktbericht der Landeshauptstadt Düsseldorf (Mehrfamilienhäuser, Liegenschaftszinssätze, Rohertragsfaktoren); boris.nrw.de, duesseldorf.de'),
  ('gaa_bonn', 'Gutachterausschuss Bonn', 'Grundstücksmarktbericht der Stadt Bonn (Mehrfamilienhäuser, Liegenschaftszinssätze); boris.nrw.de, bonn.de'),
  ('oga_nrw', 'Oberer Gutachterausschuss NRW', 'Grundstücksmarktbericht Nordrhein-Westfalen (Mehrfamilienhäuser, Umsätze, Liegenschaftszinssätze); boris.nrw.de'),
  ('ivd_west', 'IVD West', 'Wohn-Preisspiegel NRW (Mehrfamilienhäuser, Vervielfältiger, Mieten Köln, Düsseldorf, Bonn); ivd-west.de')
on conflict (kuerzel) do nothing;
