-- Postfach-Datenhinweise: Mails und Anhänge, die Zahlen im Board verändern
-- (Mieterhöhung, Bescheid, Mahnung, Kaufvertrag …). Die KI legt Hinweise an,
-- unter Datenqualität werden sie übernommen oder verworfen.

alter table public.dokument_posteingang
  add column if not exists datenwirkung_geprueft_am timestamptz;

create table if not exists public.postfach_datenhinweise (
  id uuid primary key default gen_random_uuid(),
  posteingang_id uuid references public.dokument_posteingang (id) on delete set null,
  art text not null check (art in (
    'mieterhoehung', 'mieterwechsel', 'nebenkosten', 'feste_kosten',
    'zahlungsforderung', 'darlehen', 'transaktion', 'bank', 'sonstiges'
  )),
  titel text not null,
  beschreibung text,
  aktion text,
  gesellschaft_id text references public.gesellschaften (id) on update cascade on delete set null,
  objekt_id text references public.objekte (id) on update cascade on delete set null,
  mieter text,
  betrag numeric(14, 2),
  betrag_alt numeric(14, 2),
  gueltig_ab date,
  faellig_am date,
  konfidenz numeric(3, 2),
  -- Herkunft (Kopie, damit die Liste ohne Zugriff aufs Postfach lesbar ist)
  betreff text,
  absender text,
  anhang_name text,
  eingegangen_am timestamptz,
  status text not null default 'offen' check (status in ('offen', 'erledigt', 'ignoriert')),
  erledigt_am timestamptz,
  erledigt_von uuid,
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.postfach_datenhinweise is
  'Hinweise aus Postfach-Mails mit Auswirkung auf die Zahlen im Board';

create index if not exists postfach_datenhinweise_status_idx
  on public.postfach_datenhinweise (status, eingegangen_am desc);
create index if not exists postfach_datenhinweise_posteingang_idx
  on public.postfach_datenhinweise (posteingang_id);

drop trigger if exists postfach_datenhinweise_updated_at on public.postfach_datenhinweise;
create trigger postfach_datenhinweise_updated_at
  before update on public.postfach_datenhinweise
  for each row execute function public.set_updated_at();

alter table public.postfach_datenhinweise enable row level security;

drop policy if exists postfach_datenhinweise_select on public.postfach_datenhinweise;
create policy postfach_datenhinweise_select on public.postfach_datenhinweise
  for select to authenticated using (true);

-- Anlegen nur serverseitig (Service Role); Status ändern dürfen Schreibberechtigte
drop policy if exists postfach_datenhinweise_update on public.postfach_datenhinweise;
create policy postfach_datenhinweise_update on public.postfach_datenhinweise
  for update to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

revoke all on table public.postfach_datenhinweise from anon;
grant select, update on table public.postfach_datenhinweise to authenticated;
grant all on table public.postfach_datenhinweise to service_role;
