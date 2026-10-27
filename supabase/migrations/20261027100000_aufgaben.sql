-- Aufgabenmanagement (Hauptmenü › Aufgaben): Kanban-Board im Trello-Stil für die Aufgaben,
-- die in Rücksprachen festgelegt werden. Spalten sind frei benennbar und sortierbar,
-- Karten tragen Verantwortlichen, Fälligkeit, Beschreibung, Checkliste und Rücksprache.

create table if not exists public.aufgaben_spalten (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (length(trim(titel)) > 0),
  position double precision not null default 0,
  -- Karten in dieser Spalte gelten als erledigt (zählen nicht als offen, kein Überfällig-Hinweis).
  erledigt boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.aufgaben_spalten is 'Spalten des Aufgabenboards. Nur per Server-Funktion (service_role) geschrieben.';

create table if not exists public.aufgaben (
  id uuid primary key default gen_random_uuid(),
  spalte_id uuid not null references public.aufgaben_spalten (id) on delete restrict,
  position double precision not null default 0,
  titel text not null check (length(trim(titel)) > 0),
  beschreibung text not null default '',
  verantwortlich_id uuid references public.profiles (id) on delete set null,
  faellig_am date,
  prioritaet text not null default 'normal' check (prioritaet in ('hoch', 'normal', 'niedrig')),
  ruecksprache text not null default '',
  ruecksprache_am date,
  mandat_sf_id text references public.sf_mandate (sf_id) on delete set null,
  checkliste jsonb not null default '[]'::jsonb check (jsonb_typeof(checkliste) = 'array'),
  archiviert boolean not null default false,
  erledigt_am timestamptz,
  erstellt_von uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.aufgaben is 'Karten des Aufgabenboards. Nur per Server-Funktion (service_role) geschrieben.';
comment on column public.aufgaben.ruecksprache is 'Rücksprache, in der die Aufgabe festgelegt wurde (z. B. „Jour fixe“).';
comment on column public.aufgaben.checkliste is 'Teilschritte: [{id, text, erledigt}].';

create index if not exists aufgaben_spalte_idx on public.aufgaben (spalte_id, position) where not archiviert;
create index if not exists aufgaben_verantwortlich_idx on public.aufgaben (verantwortlich_id);
create index if not exists aufgaben_erstellt_von_idx on public.aufgaben (erstellt_von);
create index if not exists aufgaben_mandat_idx on public.aufgaben (mandat_sf_id);

drop trigger if exists set_updated_at on public.aufgaben_spalten;
create trigger set_updated_at before update on public.aufgaben_spalten
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.aufgaben;
create trigger set_updated_at before update on public.aufgaben
  for each row execute function public.set_updated_at();

alter table public.aufgaben_spalten enable row level security;
alter table public.aufgaben enable row level security;
drop policy if exists aufgaben_spalten_select on public.aufgaben_spalten;
create policy aufgaben_spalten_select on public.aufgaben_spalten
  for select to authenticated using (true);
drop policy if exists aufgaben_select on public.aufgaben;
create policy aufgaben_select on public.aufgaben
  for select to authenticated using (true);

insert into public.aufgaben_spalten (titel, position, erledigt)
select v.titel, v.position, v.erledigt
from (values
  ('Offen', 1000::double precision, false),
  ('In Arbeit', 2000, false),
  ('Wartet auf Rückmeldung', 3000, false),
  ('Erledigt', 4000, true)
) as v (titel, position, erledigt)
where not exists (select 1 from public.aufgaben_spalten);
