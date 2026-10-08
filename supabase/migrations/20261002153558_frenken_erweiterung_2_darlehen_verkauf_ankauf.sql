-- Aus der Produktivdatenbank übernommen (08.10.2026): war angewendet, fehlte im Repo.
-- Erweiterung 2 FRENKEN Gruppe (02.10.2026): rein additiv.

-- Darlehen: Geber und Nehmer jeweils Gesellschaft ODER Person (Bank, Gesellschafter, HBF usw.)
create table if not exists public.darlehen (
  id text primary key check (id ~ '^(DL|BK)-[0-9]{4}-[0-9]{3}$'),
  art text not null check (art in ('intercompany','gesellschafter','bank','sonstige')),
  geber_gesellschaft_id text references public.gesellschaften(id),
  geber_person_id uuid references public.personen(id),
  nehmer_gesellschaft_id text references public.gesellschaften(id),
  nehmer_person_id uuid references public.personen(id),
  objekt_id text references public.objekte(id),
  betrag numeric not null check (betrag > 0),
  zins_pa numeric check (zins_pa is null or zins_pa >= 0),
  vertragsdatum date,
  auszahlung_am date,
  ende date,
  zinszahlung text check (zinszahlung is null or zinszahlung in ('monatlich','quartalsweise','jaehrlich','endfaellig')),
  tilgung text check (tilgung is null or tilgung in ('endfaellig','annuitaet','raten','jederzeit')),
  sicherheit text,
  vertrag_pfad text,
  status text not null default 'aktiv' check (status in ('entwurf','aktiv','beendet','ersetzt')),
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((geber_gesellschaft_id is not null)::int + (geber_person_id is not null)::int = 1),
  check ((nehmer_gesellschaft_id is not null)::int + (nehmer_person_id is not null)::int = 1),
  check (geber_gesellschaft_id is null or nehmer_gesellschaft_id is null or geber_gesellschaft_id <> nehmer_gesellschaft_id)
);
create trigger darlehen_set_updated_at before update on public.darlehen
  for each row execute function public.set_updated_at();

-- Abverkauf einzelner Einheiten
create table if not exists public.einheiten_verkauf (
  id uuid primary key default gen_random_uuid(),
  einheit_id text not null references public.einheiten(id) on delete cascade,
  stufe text not null default 'in_vermarktung'
    check (stufe in ('in_vermarktung','reserviert','kaufvertrag_in_vorbereitung','notartermin','beurkundet','uebergeben','abgebrochen')),
  angebotspreis numeric check (angebotspreis is null or angebotspreis >= 0),
  kaufpreis numeric check (kaufpreis is null or kaufpreis >= 0),
  kaeufer_person_id uuid references public.personen(id),
  makler text,
  notartermin date,
  beurkundet_am date,
  uebergabe_am date,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists einheiten_verkauf_einheit_idx on public.einheiten_verkauf(einheit_id);
create trigger einheiten_verkauf_set_updated_at before update on public.einheiten_verkauf
  for each row execute function public.set_updated_at();

-- Ankauf-Pipeline
create table if not exists public.ankauf_pipeline (
  id uuid primary key default gen_random_uuid(),
  bezeichnung text not null check (length(btrim(bezeichnung)) > 0),
  strasse text, plz text, ort text,
  quelle text,
  expose_id uuid references public.postfach_exposes(id),
  stufe text not null default 'expose'
    check (stufe in ('expose','bewertung','angebot','due_diligence','notar','gekauft','abgesagt')),
  kaufpreis_forderung numeric check (kaufpreis_forderung is null or kaufpreis_forderung >= 0),
  angebotspreis numeric check (angebotspreis is null or angebotspreis >= 0),
  ziel_gesellschaft_id text references public.gesellschaften(id),
  verantwortlich_id uuid references public.profiles(id),
  absagegrund text,
  objekt_id text references public.objekte(id),
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ankauf_pipeline_set_updated_at before update on public.ankauf_pipeline
  for each row execute function public.set_updated_at();

alter table public.darlehen enable row level security;
alter table public.einheiten_verkauf enable row level security;
alter table public.ankauf_pipeline enable row level security;

create policy darlehen_select on public.darlehen for select to authenticated using (true);
create policy darlehen_write on public.darlehen for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy einheiten_verkauf_select on public.einheiten_verkauf for select to authenticated using (true);
create policy einheiten_verkauf_write on public.einheiten_verkauf for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy ankauf_pipeline_select on public.ankauf_pipeline for select to authenticated using (true);
create policy ankauf_pipeline_write on public.ankauf_pipeline for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
