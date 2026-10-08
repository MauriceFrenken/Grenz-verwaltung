-- Management Board, Phase 2 (08.10.2026): Steuerung auf Bens Datenmodell.
-- Rein additiv: neue Spalten, Tabellen und Views. Bestehende Daten werden nur dort
-- ergänzt, wo ein Feld bisher leer ist (Segmentzuordnung der Gesellschaften).
-- Ersetzt das nie angewendete Schema `board` aus 20261007120000.

-- ---------------------------------------------------------------------------
-- Gesellschaften: Segment, Mindestliquidität, getrennter Bereich
-- ---------------------------------------------------------------------------
alter table public.gesellschaften
  add column if not exists segment text
    check (segment is null or segment in (
      'holding','immobilien_bestand','immobilien_aufteiler','baumaschinen_handel','baumaschinen_plattform','makler'
    )),
  add column if not exists mindestliquiditaet numeric
    check (mindestliquiditaet is null or mindestliquiditaet >= 0),
  add column if not exists getrennter_bereich boolean not null default false;

comment on column public.gesellschaften.segment is 'Geschäftsfeld für das Management Board. Annahme vom 08.10.2026, in der App änderbar.';
comment on column public.gesellschaften.mindestliquiditaet is 'Puffer, unter dem das Board warnt. null = noch nicht festgelegt.';
comment on column public.gesellschaften.getrennter_bereich is 'true = nicht Teil der freien Gruppenliquidität (z. B. Maklergesellschaft).';

update public.gesellschaften set segment = case id
    when 'G-01' then 'immobilien_bestand'
    when 'G-02' then 'immobilien_bestand'
    when 'G-03' then 'immobilien_bestand'
    when 'G-04' then 'immobilien_bestand'
    when 'G-05' then 'holding'
    when 'G-06' then 'baumaschinen_plattform'
    when 'G-07' then 'immobilien_bestand'
    when 'G-08' then 'immobilien_bestand'
    when 'G-09' then 'baumaschinen_handel'
    when 'G-10' then 'makler'
  end
where segment is null and id in ('G-01','G-02','G-03','G-04','G-05','G-06','G-07','G-08','G-09','G-10');

update public.gesellschaften set getrennter_bereich = true where id = 'G-10';

-- ---------------------------------------------------------------------------
-- Bankkonten aller Gesellschaften (auch ohne EBICS) und Kontosalden
-- ---------------------------------------------------------------------------
create table if not exists public.bankkonten (
  iban text primary key check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  gesellschaft_id text not null references public.gesellschaften(id),
  bank text,
  bezeichnung text,
  zugang text not null default 'manuell' check (zugang in ('ebics','qonto','csv','manuell')),
  aktiv boolean not null default true,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger bankkonten_set_updated_at before update on public.bankkonten
  for each row execute function public.set_updated_at();

-- EBICS-Konten übernehmen (Gesellschaft über den EBICS-Kunden)
insert into public.bankkonten (iban, gesellschaft_id, bank, zugang, aktiv)
select upper(replace(c.iban, ' ', '')), k.gesellschaft_id, k.bank_name, 'ebics', c.aktiv
from public.ebics_konten c
join public.ebics_kunden k on k.id = c.ebics_kunde_id
where c.iban is not null
on conflict (iban) do nothing;

create table if not exists public.kontosalden (
  id uuid primary key default gen_random_uuid(),
  iban text not null references public.bankkonten(iban) on delete cascade,
  stichtag date not null,
  saldo numeric not null,
  quelle text not null check (quelle in ('camt053','manuell','import')),
  erfasst_von uuid references public.profiles(id),
  bemerkung text,
  created_at timestamptz not null default now(),
  unique (iban, stichtag, quelle)
);
create index if not exists kontosalden_iban_stichtag_idx on public.kontosalden(iban, stichtag desc);
comment on table public.kontosalden is 'Tagesendsalden je Konto: aus camt.053 (CLBD) beim EBICS-Abruf oder manuell erfasst.';

-- ---------------------------------------------------------------------------
-- Eindeutige Bankbuchungen (Dubletten über Sollstellungsläufe hinweg)
-- ---------------------------------------------------------------------------
-- Ursache: Der EBICS-Abruf prüft Fingerprints nur je Sollstellungslauf. Ein Lauf
-- „alle Gesellschaften“ und ein Lauf für eine einzelne Gesellschaft im selben
-- Monat holen dieselben Buchungen doppelt. Das Board rechnet nur hiermit.
create or replace view public.bankbuchungen_eindeutig with (security_invoker = true) as
select distinct on (coalesce(nullif(split_part(a.dateiname, ' ', 3), ''), a.gesellschaft_id), b.fingerprint)
  b.id,
  b.bankauszug_id,
  a.gesellschaft_id,
  case when split_part(a.dateiname, ' ', 3) ~ '^[A-Z]{2}[0-9]{2}' then split_part(a.dateiname, ' ', 3) end as konto_iban,
  b.buchungsdatum,
  b.betrag,
  b.gegenkonto_iban,
  b.auftraggeber_name,
  b.verwendungszweck,
  b.fingerprint,
  b.created_at
from public.bankbuchungen b
join public.bankauszuege a on a.id = b.bankauszug_id
order by coalesce(nullif(split_part(a.dateiname, ' ', 3), ''), a.gesellschaft_id), b.fingerprint, b.created_at;
grant select on public.bankbuchungen_eindeutig to authenticated;
revoke all on public.bankbuchungen_eindeutig from anon;

-- ---------------------------------------------------------------------------
-- Planposten für die Liquiditätsplanung
-- ---------------------------------------------------------------------------
create table if not exists public.planposten (
  id uuid primary key default gen_random_uuid(),
  gesellschaft_id text not null references public.gesellschaften(id),
  datum date not null,
  betrag numeric not null,
  bezeichnung text not null check (length(btrim(bezeichnung)) > 0),
  kategorie text not null default 'sonstiges'
    check (kategorie in ('personal','steuern','rechnung','ankauf','verkauf','projekt','intercompany','sonstiges')),
  monatlich_bis date,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger planposten_set_updated_at before update on public.planposten
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Transaktionspipeline: Ankauf um Steuerungsfelder ergänzen
-- ---------------------------------------------------------------------------
alter table public.ankauf_pipeline
  add column if not exists stufe_seit date,
  add column if not exists naechster_schritt text,
  add column if not exists naechster_schritt_am date,
  add column if not exists strategie text check (strategie is null or strategie in ('bestand','aufteiler','gewerbe')),
  add column if not exists einheiten_anzahl integer check (einheiten_anzahl is null or einheiten_anzahl >= 0),
  add column if not exists flaeche_m2 numeric check (flaeche_m2 is null or flaeche_m2 > 0),
  add column if not exists jahresnettokaltmiete numeric check (jahresnettokaltmiete is null or jahresnettokaltmiete >= 0),
  add column if not exists makler text,
  add column if not exists ek_quote numeric check (ek_quote is null or (ek_quote >= 0 and ek_quote <= 1)),
  add column if not exists notartermin date,
  add column if not exists salesforce_transaktion_id text;

update public.ankauf_pipeline set stufe_seit = coalesce(stufe_seit, updated_at::date);

create or replace function public.ankauf_pipeline_stufe_seit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.stufe is distinct from old.stufe then
    new.stufe_seit := current_date;
  end if;
  return new;
end;
$$;
drop trigger if exists ankauf_pipeline_stufe_seit on public.ankauf_pipeline;
create trigger ankauf_pipeline_stufe_seit before insert or update on public.ankauf_pipeline
  for each row execute function public.ankauf_pipeline_stufe_seit();

-- Verkauf ganzer Objekte (Einheiten laufen über einheiten_verkauf)
create table if not exists public.objekt_verkauf (
  id uuid primary key default gen_random_uuid(),
  objekt_id text not null references public.objekte(id) on delete cascade,
  stufe text not null default 'vorbereitung'
    check (stufe in ('vorbereitung','vermarktung','angebot','due_diligence','notar','verkauft','abgebrochen')),
  stufe_seit date not null default current_date,
  angebotspreis numeric check (angebotspreis is null or angebotspreis >= 0),
  kaufpreis numeric check (kaufpreis is null or kaufpreis >= 0),
  kaeufer_person_id uuid references public.personen(id),
  makler text,
  notartermin date,
  naechster_schritt text,
  naechster_schritt_am date,
  salesforce_transaktion_id text,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger objekt_verkauf_set_updated_at before update on public.objekt_verkauf
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Baumaschinen: Bestand, Kosten, Verkauf
-- ---------------------------------------------------------------------------
create table if not exists public.maschinen (
  id text primary key check (id ~ '^BM-[0-9]{4}-[0-9]{3}$'),
  gesellschaft_id text not null references public.gesellschaften(id),
  hersteller text not null,
  modell text not null,
  kategorie text,
  baujahr integer check (baujahr is null or baujahr between 1950 and 2100),
  betriebsstunden integer check (betriebsstunden is null or betriebsstunden >= 0),
  seriennummer text,
  standort text,
  status text not null default 'lager'
    check (status in ('einkauf','lager','inseriert','reserviert','verkauft')),
  ankauf_am date,
  einkaufspreis numeric check (einkaufspreis is null or einkaufspreis >= 0),
  lieferant text,
  angebotspreis numeric check (angebotspreis is null or angebotspreis >= 0),
  inserat_url text,
  verkauf_am date,
  verkaufspreis numeric check (verkaufspreis is null or verkaufspreis >= 0),
  kaeufer text,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists maschinen_status_idx on public.maschinen(status);
create trigger maschinen_set_updated_at before update on public.maschinen
  for each row execute function public.set_updated_at();

create table if not exists public.maschinen_kosten (
  id uuid primary key default gen_random_uuid(),
  maschine_id text not null references public.maschinen(id) on delete cascade,
  datum date not null,
  art text not null default 'sonstiges'
    check (art in ('transport','aufbereitung','reparatur','pruefung','provision','sonstiges')),
  betrag numeric not null check (betrag >= 0),
  bemerkung text,
  created_at timestamptz not null default now()
);
create index if not exists maschinen_kosten_maschine_idx on public.maschinen_kosten(maschine_id);

-- ---------------------------------------------------------------------------
-- Prüfliste: Status der aus der Fachlogik erzeugten Prüffälle
-- ---------------------------------------------------------------------------
create table if not exists public.pruefliste_status (
  pruef_id text primary key,
  status text not null check (status in ('offen','erledigt')),
  bemerkung text,
  geaendert_von uuid references public.profiles(id),
  geaendert_am timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Zugriffsregeln wie bei den bestehenden Tabellen
-- ---------------------------------------------------------------------------
alter table public.bankkonten enable row level security;
alter table public.kontosalden enable row level security;
alter table public.planposten enable row level security;
alter table public.objekt_verkauf enable row level security;
alter table public.maschinen enable row level security;
alter table public.maschinen_kosten enable row level security;
alter table public.pruefliste_status enable row level security;

create policy bankkonten_select on public.bankkonten for select to authenticated using (true);
create policy bankkonten_write on public.bankkonten for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy kontosalden_select on public.kontosalden for select to authenticated using (true);
create policy kontosalden_write on public.kontosalden for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy planposten_select on public.planposten for select to authenticated using (true);
create policy planposten_write on public.planposten for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy objekt_verkauf_select on public.objekt_verkauf for select to authenticated using (true);
create policy objekt_verkauf_write on public.objekt_verkauf for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy maschinen_select on public.maschinen for select to authenticated using (true);
create policy maschinen_write on public.maschinen for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy maschinen_kosten_select on public.maschinen_kosten for select to authenticated using (true);
create policy maschinen_kosten_write on public.maschinen_kosten for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy pruefliste_status_select on public.pruefliste_status for select to authenticated using (true);
create policy pruefliste_status_write on public.pruefliste_status for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
