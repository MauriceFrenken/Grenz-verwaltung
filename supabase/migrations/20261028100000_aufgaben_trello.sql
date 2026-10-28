-- Aufgabenboard ↔ Trello: Verknüpfung je Spalte/Karte und Abgleichstand.
-- trello_hash ist der zuletzt abgeglichene Stand (gemeinsame Felder beider Seiten). Weicht nur
-- eine Seite davon ab, gewinnt diese; weichen beide ab, gewinnt die jüngere Änderung.

alter table public.aufgaben_spalten
  add column if not exists trello_id text,
  add column if not exists trello_hash text;
create unique index if not exists aufgaben_spalten_trello_id_key on public.aufgaben_spalten (trello_id);

alter table public.aufgaben
  add column if not exists trello_id text,
  add column if not exists trello_hash text;
create unique index if not exists aufgaben_trello_id_key on public.aufgaben (trello_id);

create table if not exists public.aufgaben_trello (
  id smallint primary key default 1 check (id = 1),
  letzter_abgleich timestamptz,
  fehler text,
  webhook_id text,
  updated_at timestamptz not null default now()
);
comment on table public.aufgaben_trello is 'Stand des Trello-Abgleichs (eine Zeile). Nur per service_role.';
insert into public.aufgaben_trello (id) values (1) on conflict (id) do nothing;

drop trigger if exists set_updated_at on public.aufgaben_trello;
create trigger set_updated_at before update on public.aufgaben_trello
  for each row execute function public.set_updated_at();

alter table public.aufgaben_trello enable row level security;
drop policy if exists aufgaben_trello_select on public.aufgaben_trello;
create policy aufgaben_trello_select on public.aufgaben_trello
  for select to authenticated using (true);
