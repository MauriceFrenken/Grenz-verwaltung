-- Gesellschafterbericht (Hauptmenü › Gesellschafterbericht): Protokoll der monatlichen
-- Kennzahlenberichte an die FRENKEN Management App (Schnittstelle Beteiligungsbericht, Version 1).
-- Jede Zeile ist ein Sendeversuch: exakt gesendeter Inhalt, Freigabe und Antwort der Gegenseite.
-- Geschrieben wird nur per Server-Funktion (service_role); lesen dürfen direkt nur
-- Administratoren. Der Inhalt enthält nur zusammengefasste Kennzahlen, keine Personendaten Dritter.

create table if not exists public.gesellschafter_berichte (
  id uuid primary key default gen_random_uuid(),
  periode text not null check (periode ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  art text not null check (art in ('ist', 'plan')),
  inhalt jsonb not null check (jsonb_typeof(inhalt) = 'object'),
  freigegeben_von text not null check (length(btrim(freigegeben_von)) > 0),
  freigegeben_von_id uuid references public.profiles (id) on delete set null,
  freigegeben_am timestamptz not null,
  -- Zeitpunkt des Sendeversuchs; null nur, solange die Anfrage läuft.
  gesendet_am timestamptz,
  -- HTTP-Status der FRENKEN-App; null, wenn keine Antwort kam (Netzwerkfehler, Zeitüberschreitung).
  antwort_status integer,
  antwort_text text,
  erfolgreich boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.gesellschafter_berichte is 'Gesendete Gesellschafterberichte an die FRENKEN Management App mit Inhalt und Antwort. Nur per Server-Funktion (service_role) geschrieben.';
comment on column public.gesellschafter_berichte.inhalt is 'Exakt gesendetes JSON laut Schnittstelle Beteiligungsbericht (Version 1).';

create index if not exists gesellschafter_berichte_periode_idx
  on public.gesellschafter_berichte (periode desc, art, created_at desc);
create index if not exists gesellschafter_berichte_freigegeben_von_id_idx
  on public.gesellschafter_berichte (freigegeben_von_id);

alter table public.gesellschafter_berichte enable row level security;

drop policy if exists gesellschafter_berichte_select on public.gesellschafter_berichte;
create policy gesellschafter_berichte_select on public.gesellschafter_berichte
  for select to authenticated
  using ((select public.jwt_rolle()) in ('op_admin', 'administrator'));

revoke insert, update, delete, truncate on public.gesellschafter_berichte from anon, authenticated;
revoke all on public.gesellschafter_berichte from anon;
grant select on public.gesellschafter_berichte to authenticated;
grant all on public.gesellschafter_berichte to service_role;
