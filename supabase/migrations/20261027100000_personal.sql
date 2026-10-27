-- Personalbereich: Mitarbeiterakte, Abwesenheiten, Pflichtschulungen (§34c GewO, GwG),
-- Jahreswerte (Urlaubsübertrag, Provisionsziel) und On-/Offboarding-Checklisten.
-- Personaldaten sind vertraulich: kein Zugriff über die Data-API, nur serverseitig
-- (service_role). Die Server-Funktionen prüfen, wer was sehen darf.

create table if not exists public.personal_mitarbeiter (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid unique references public.profiles(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  email text,
  telefon text,
  position text,
  vertragsart text not null default 'vollzeit' check (vertragsart in (
    'geschaeftsfuehrung', 'vollzeit', 'teilzeit', 'minijob', 'werkstudent', 'praktikum', 'freie_mitarbeit'
  )),
  wochenstunden numeric check (wochenstunden is null or wochenstunden between 0 and 60),
  urlaubstage_jahr numeric not null default 30 check (urlaubstage_jahr between 0 and 60),
  eintritt_am date,
  probezeit_bis date,
  austritt_am date,
  geburtstag date,
  notfallkontakt text,
  sf_user_id text,
  weiterbildungspflichtig boolean not null default true,
  personalakte_url text,
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.personal_mitarbeiter is 'Mitarbeiterakte. Optional mit App-Benutzer (profil_id) und Salesforce-User (sf_user_id) verknüpft.';
comment on column public.personal_mitarbeiter.weiterbildungspflichtig is 'Wirkt an der Maklertätigkeit mit: Weiterbildungspflicht nach §34c Abs. 2a GewO / §15b MaBV (20 Stunden je drei Kalenderjahre).';

create trigger personal_mitarbeiter_set_updated_at
  before update on public.personal_mitarbeiter
  for each row execute function public.set_updated_at();

create table if not exists public.personal_abwesenheiten (
  id uuid primary key default gen_random_uuid(),
  mitarbeiter_id uuid not null references public.personal_mitarbeiter(id) on delete cascade,
  art text not null check (art in ('urlaub', 'krank', 'fortbildung', 'homeoffice', 'sonderurlaub', 'elternzeit')),
  von date not null,
  bis date not null,
  halbtag boolean not null default false,
  status text not null default 'beantragt' check (status in ('beantragt', 'genehmigt', 'abgelehnt')),
  notiz text,
  erfasst_von uuid references public.profiles(id) on delete set null,
  entschieden_von uuid references public.profiles(id) on delete set null,
  entschieden_am timestamptz,
  created_at timestamptz not null default now(),
  check (bis >= von)
);
create index if not exists personal_abwesenheiten_zeitraum_idx on public.personal_abwesenheiten (von, bis);
create index if not exists personal_abwesenheiten_mitarbeiter_idx on public.personal_abwesenheiten (mitarbeiter_id);
create index if not exists personal_abwesenheiten_erfasst_von_idx on public.personal_abwesenheiten (erfasst_von);
create index if not exists personal_abwesenheiten_entschieden_von_idx on public.personal_abwesenheiten (entschieden_von);
create index if not exists personal_abwesenheiten_offen_idx on public.personal_abwesenheiten (status) where status = 'beantragt';

create table if not exists public.personal_jahreswerte (
  mitarbeiter_id uuid not null references public.personal_mitarbeiter(id) on delete cascade,
  jahr integer not null check (jahr between 2000 and 2100),
  urlaub_uebertrag numeric not null default 0,
  provisionsziel_eur numeric,
  notiz text,
  primary key (mitarbeiter_id, jahr)
);
comment on table public.personal_jahreswerte is 'Je Mitarbeiter und Jahr: Resturlaub aus dem Vorjahr und Provisionsziel.';

create table if not exists public.personal_schulungen (
  id uuid primary key default gen_random_uuid(),
  mitarbeiter_id uuid not null references public.personal_mitarbeiter(id) on delete cascade,
  art text not null check (art in ('weiterbildung_34c', 'gwg', 'datenschutz', 'sonstige')),
  titel text not null check (length(btrim(titel)) > 0),
  anbieter text,
  datum date not null,
  stunden numeric check (stunden is null or stunden >= 0),
  nachweis_url text,
  notiz text,
  erfasst_von uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists personal_schulungen_mitarbeiter_idx on public.personal_schulungen (mitarbeiter_id, datum desc);
create index if not exists personal_schulungen_erfasst_von_idx on public.personal_schulungen (erfasst_von);

create table if not exists public.personal_checkpunkte (
  id uuid primary key default gen_random_uuid(),
  mitarbeiter_id uuid not null references public.personal_mitarbeiter(id) on delete cascade,
  typ text not null check (typ in ('onboarding', 'offboarding')),
  punkt text not null check (length(btrim(punkt)) > 0),
  reihenfolge integer not null default 0,
  erledigt_am timestamptz,
  erledigt_von uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists personal_checkpunkte_mitarbeiter_idx on public.personal_checkpunkte (mitarbeiter_id, typ, reihenfolge);
create index if not exists personal_checkpunkte_erledigt_von_idx on public.personal_checkpunkte (erledigt_von);

-- Nur serverseitig: RLS an, keine Policies für anon/authenticated.
alter table public.personal_mitarbeiter enable row level security;
alter table public.personal_abwesenheiten enable row level security;
alter table public.personal_jahreswerte enable row level security;
alter table public.personal_schulungen enable row level security;
alter table public.personal_checkpunkte enable row level security;

revoke all on public.personal_mitarbeiter, public.personal_abwesenheiten, public.personal_jahreswerte,
  public.personal_schulungen, public.personal_checkpunkte from anon, authenticated;
grant all on public.personal_mitarbeiter, public.personal_abwesenheiten, public.personal_jahreswerte,
  public.personal_schulungen, public.personal_checkpunkte to service_role;
