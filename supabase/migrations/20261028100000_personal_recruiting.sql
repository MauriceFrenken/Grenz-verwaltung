-- Recruiting im Personalbereich: offene Stellen, Bewerber mit Pipeline-Phase und Verlauf.
-- Bewerberdaten sind vertraulich: kein Zugriff über die Data-API, nur serverseitig
-- (service_role). Nur Personalverantwortliche sehen sie (Prüfung in der Server-Funktion).
-- Löschfrist: 6 Monate nach Abschluss des Verfahrens (§15 Abs. 4 AGG, §61b ArbGG),
-- länger nur mit Einwilligung in den Talentpool (talentpool_bis).

create table if not exists public.personal_stellen (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (length(btrim(titel)) > 0),
  standort text,
  vertragsart text not null default 'vollzeit' check (vertragsart in (
    'geschaeftsfuehrung', 'vollzeit', 'teilzeit', 'minijob', 'werkstudent', 'praktikum', 'freie_mitarbeit'
  )),
  wochenstunden numeric check (wochenstunden is null or wochenstunden between 0 and 60),
  start_ab date,
  status text not null default 'entwurf' check (status in ('entwurf', 'offen', 'pausiert', 'besetzt', 'geschlossen')),
  aufgaben text,
  anforderungen text,
  angebot text,
  anzeige_text text,
  kanaele text,
  verantwortlich_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.personal_stellen is 'Ausgeschriebene oder geplante Stellen mit Anzeigentext.';
create index if not exists personal_stellen_verantwortlich_idx on public.personal_stellen (verantwortlich_id);

create trigger personal_stellen_set_updated_at
  before update on public.personal_stellen
  for each row execute function public.set_updated_at();

create table if not exists public.personal_bewerber (
  id uuid primary key default gen_random_uuid(),
  stelle_id uuid references public.personal_stellen(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  email text,
  telefon text,
  quelle text,
  phase text not null default 'eingang' check (phase in (
    'eingang', 'sichtung', 'gespraech', 'angebot', 'eingestellt', 'abgesagt'
  )),
  reihenfolge integer not null default 0,
  bewertung integer check (bewertung is null or bewertung between 1 and 5),
  eingegangen_am date not null default current_date,
  verfuegbar_ab date,
  gehaltsvorstellung text,
  unterlagen_url text,
  naechster_termin timestamptz,
  notizen text,
  absage_grund text,
  abgeschlossen_am timestamptz,
  talentpool_bis date,
  mitarbeiter_id uuid references public.personal_mitarbeiter(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.personal_bewerber is 'Bewerber. Löschen 6 Monate nach abgeschlossen_am, außer Einwilligung in den Talentpool bis talentpool_bis.';
comment on column public.personal_bewerber.unterlagen_url is 'Link auf die Unterlagen in OneDrive; die Dateien selbst liegen nicht in der App.';
create index if not exists personal_bewerber_stelle_idx on public.personal_bewerber (stelle_id);
create index if not exists personal_bewerber_phase_idx on public.personal_bewerber (phase, reihenfolge);
create index if not exists personal_bewerber_mitarbeiter_idx on public.personal_bewerber (mitarbeiter_id);

create trigger personal_bewerber_set_updated_at
  before update on public.personal_bewerber
  for each row execute function public.set_updated_at();

create table if not exists public.personal_bewerber_ereignisse (
  id uuid primary key default gen_random_uuid(),
  bewerber_id uuid not null references public.personal_bewerber(id) on delete cascade,
  art text not null default 'notiz' check (art in ('notiz', 'phase', 'termin')),
  text text not null check (length(btrim(text)) > 0),
  von_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists personal_bewerber_ereignisse_bewerber_idx on public.personal_bewerber_ereignisse (bewerber_id, created_at);
create index if not exists personal_bewerber_ereignisse_von_idx on public.personal_bewerber_ereignisse (von_id);

-- Nur serverseitig: RLS an, keine Policies für anon/authenticated.
alter table public.personal_stellen enable row level security;
alter table public.personal_bewerber enable row level security;
alter table public.personal_bewerber_ereignisse enable row level security;

revoke all on public.personal_stellen, public.personal_bewerber, public.personal_bewerber_ereignisse
  from anon, authenticated;
grant all on public.personal_stellen, public.personal_bewerber, public.personal_bewerber_ereignisse
  to service_role;
