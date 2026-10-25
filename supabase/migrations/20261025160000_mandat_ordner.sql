-- OneDrive-Objektordner je Mandat und der daraus ausgelesene Steckbrief.
-- Ohne Eintrag sucht die App den Ordner automatisch nach Adresse; ein Eintrag hier
-- legt den Ordner fest (von Hand verknüpft) und speichert den letzten Steckbrief.

create table if not exists public.mandat_ordner (
  mandat_sf_id text primary key,
  item_id text,
  name text,
  web_url text,
  verknuepft_von uuid references public.profiles(id) on delete set null,
  verknuepft_am timestamptz,
  steckbrief jsonb,
  steckbrief_am timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.mandat_ordner is 'OneDrive-Ordner eines Mandats (sf_mandate.sf_id) und der KI-Steckbrief aus den Unterlagen darin.';
comment on column public.mandat_ordner.item_id is 'driveItem-Id im OneDrive von MICROSOFT_ONEDRIVE_USER; leer = automatische Suche.';

create index if not exists mandat_ordner_verknuepft_von_idx
  on public.mandat_ordner (verknuepft_von);

alter table public.mandat_ordner enable row level security;

-- Lesen für angemeldete Nutzer; geschrieben wird nur serverseitig (Service Role).
drop policy if exists mandat_ordner_select on public.mandat_ordner;
create policy mandat_ordner_select on public.mandat_ordner
  for select to authenticated using (true);
