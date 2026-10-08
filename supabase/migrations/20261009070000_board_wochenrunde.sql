-- Steuerung Phase 3: Wochenrunde der Geschäftsführung
-- Beschlüsse mit Verantwortlichem, Termin und Bezug. Rein additiv.
-- Nutzt die vorhandenen Funktionen public.set_updated_at() und public.jwt_darf_schreiben().

create table if not exists public.board_beschluesse (
  id text primary key,                         -- BE-JJJJ-NNN
  runde_am date not null,                      -- Datum der Wochenrunde
  text text not null,
  verantwortlich text,
  faellig_am date,
  bezug_typ text check (bezug_typ in ('darlehen','objekt','ankauf','maschine','gesellschaft')),
  bezug_id text,
  gesellschaft_id text references public.gesellschaften(id),
  status text not null default 'offen' check (status in ('offen','erledigt')),
  erledigt_am date,
  erstellt_von uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_beschluesse_status_idx on public.board_beschluesse (status, faellig_am);

drop trigger if exists board_beschluesse_set_updated_at on public.board_beschluesse;
create trigger board_beschluesse_set_updated_at before update on public.board_beschluesse
  for each row execute function public.set_updated_at();

alter table public.board_beschluesse enable row level security;

create policy board_beschluesse_select on public.board_beschluesse for select to authenticated using (true);
create policy board_beschluesse_write on public.board_beschluesse for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
