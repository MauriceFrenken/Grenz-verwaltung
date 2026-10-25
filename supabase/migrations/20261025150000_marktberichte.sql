-- Marktbericht Zinshäuser Rheinland (Tool unter „Tools“): Berichte je Halbjahr/Gesamtjahr
-- und erweiterte Marktdaten für die eigene Datensammlung (Ring 1 bis 3 des Datenkonzepts).

create table if not exists public.marktberichte (
  id uuid primary key default gen_random_uuid(),
  periode text not null check (periode ~ '^\d{4}-(H1|GJ)$'),
  titel text not null,
  status text not null default 'entwurf' check (status in ('entwurf', 'freigegeben')),
  stichtag date not null,
  kennzahlen jsonb not null,
  inhalt jsonb not null default '{}'::jsonb,
  erstellt_von uuid references public.profiles (id) on delete set null,
  freigegeben_von uuid references public.profiles (id) on delete set null,
  freigegeben_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marktberichte_freigabe_mit_nutzer
    check (status <> 'freigegeben' or (freigegeben_von is not null and freigegeben_am is not null))
);
comment on table public.marktberichte is 'Marktberichte Zinshäuser Rheinland. Nur per Server-Funktion (service_role) geschrieben.';
comment on column public.marktberichte.kennzahlen is 'Eingefrorene Kennzahlen zum Stichtag (Exposé-Eingang, Ankaufsprofile, Salesforce, Bundesbank, Markt-Radar).';
comment on column public.marktberichte.inhalt is 'Texte je Seite und zitierte Vergleichswerte anderer Häuser (benchmarks) mit Quelle.';

create index if not exists marktberichte_periode_idx on public.marktberichte (periode, created_at desc);
create index if not exists marktberichte_erstellt_von_idx on public.marktberichte (erstellt_von);
create index if not exists marktberichte_freigegeben_von_idx on public.marktberichte (freigegeben_von);

drop trigger if exists set_updated_at on public.marktberichte;
create trigger set_updated_at before update on public.marktberichte
  for each row execute function public.set_updated_at();

alter table public.marktberichte enable row level security;
drop policy if exists marktberichte_select on public.marktberichte;
create policy marktberichte_select on public.marktberichte
  for select to authenticated using (true);

-- marktdaten wird die zentrale Datenbank für eigene und fremde Marktwerte.
alter table public.marktdaten drop constraint if exists marktdaten_quelle_check;
alter table public.marktdaten add constraint marktdaten_quelle_check check (quelle in (
  'imv', 'boris_nrw', 'kaufpreissammlung', 'mietinserate', 'manuell',
  'grenz_deal', 'expose_eingang', 'ankaufsprofil', 'umfrage', 'gutachterausschuss',
  'bundesbank', 'destatis', 'greix', 'research_bericht', 'markt_radar'
));
alter table public.marktdaten drop constraint if exists marktdaten_art_check;
alter table public.marktdaten add constraint marktdaten_art_check check (art in (
  'angebotsmiete', 'vergleichsmiete', 'kaufpreis', 'kaufpreisfaktor', 'bodenrichtwert', 'leerstand',
  'transaktionsvolumen', 'spitzenrendite', 'liegenschaftszins', 'zins', 'index', 'sonstiges'
));
alter table public.marktdaten
  add column if not exists teilmarkt text,
  add column if not exists lageklasse text check (lageklasse in ('sehr gut', 'gut', 'mittel', 'einfach')),
  add column if not exists periode text,
  add column if not exists beleg jsonb not null default '{}'::jsonb,
  add column if not exists lizenz text not null default 'intern' check (lizenz in ('open', 'zitat', 'intern'));
comment on column public.marktdaten.beleg is 'Herkunft je Wert: {dokument, seite, zitat, url}.';
comment on column public.marktdaten.lizenz is 'open = frei nutzbar (z. B. Bundesbank, BORIS), zitat = nur mit Quelle zitieren, intern = Grenz-Daten.';
create index if not exists marktdaten_teilmarkt_periode_idx on public.marktdaten (teilmarkt, periode);
