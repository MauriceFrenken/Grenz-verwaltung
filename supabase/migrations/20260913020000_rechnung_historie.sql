-- Rechnungshistorie: an DATEV gesendete Rechnungen 30 Tage vorhalten
-- (Board-Spalte „An DATEV“ + Dublettenprüfung über die Rechnungsnummer).
-- Zugriff ausschließlich über Service Role (Server-Fns).

create table if not exists public.rechnung_historie (
  id uuid primary key default gen_random_uuid(),
  rechnungsnummer text,
  -- Normalisiert (Großbuchstaben, ohne Trenn-/Leerzeichen) für den Dublettenabgleich
  rechnungsnummer_norm text,
  rechnungssteller text,
  rechnungsbetrag text,
  waehrung text,
  rechnungsdatum text,
  gesellschaft_id text references public.gesellschaften (id) on delete set null,
  gesellschaft_name text,
  betreff text,
  anhang_name text,
  ablage_dateiname text,
  ordner_pfad text,
  quelle_eintrag_id uuid,
  an_datev_am timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists rechnung_historie_an_datev_am_idx
  on public.rechnung_historie (an_datev_am desc);

create index if not exists rechnung_historie_nummer_idx
  on public.rechnung_historie (rechnungsnummer_norm, an_datev_am desc)
  where rechnungsnummer_norm is not null;

-- Nicht partiell: wird für das Upsert beim erneuten Buchen zur Konflikterkennung gebraucht
create unique index if not exists rechnung_historie_quelle_idx
  on public.rechnung_historie (quelle_eintrag_id);

alter table public.rechnung_historie enable row level security;

revoke all on table public.rechnung_historie from public, anon, authenticated;
grant all on table public.rechnung_historie to service_role;

-- Hinweis auf eine mögliche Dublette, bei der KI-Analyse ermittelt
alter table public.dokument_posteingang
  add column if not exists duplikat_hinweis jsonb;
