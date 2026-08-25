-- Sollstellung: Monatsabgleich Soll (Mietverhaeltnisse) vs. Ist (Bankauszuege via IBAN).

create type public.sollstellung_lauf_status as enum ('offen', 'abgeschlossen', 'storniert');
create type public.sollstellung_position_status as enum (
  'fehlt',
  'teilweise',
  'ausgeglichen',
  'ueberzahlung',
  'ohne_iban'
);

-- ---------------------------------------------------------------- Laeufe

create table public.sollstellung_laeufe (
  id uuid primary key default gen_random_uuid(),
  zeitraum text not null check (zeitraum ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  gesellschaft_id text
    references public.gesellschaften (id) on update cascade on delete restrict,
  status public.sollstellung_lauf_status not null default 'offen',
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ein Lauf pro Monat und Gesellschaft-Scope (NULL = alle Gesellschaften).
create unique index sollstellung_laeufe_zeitraum_gesellschaft_uidx
  on public.sollstellung_laeufe (zeitraum, coalesce(gesellschaft_id, ''));

create index sollstellung_laeufe_zeitraum_idx
  on public.sollstellung_laeufe (zeitraum desc);

create trigger sollstellung_laeufe_set_updated_at
  before update on public.sollstellung_laeufe
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- Bankauszuege

create table public.bankauszuege (
  id uuid primary key default gen_random_uuid(),
  lauf_id uuid not null
    references public.sollstellung_laeufe (id) on delete cascade,
  gesellschaft_id text not null
    references public.gesellschaften (id) on update cascade on delete restrict,
  dateiname text not null check (length(btrim(dateiname)) > 0),
  zeitraum_von date,
  zeitraum_bis date,
  anzahl_buchungen integer not null default 0 check (anzahl_buchungen >= 0),
  created_at timestamptz not null default now(),
  constraint bankauszuege_zeitraum_check
    check (zeitraum_bis is null or zeitraum_von is null or zeitraum_bis >= zeitraum_von)
);

create index bankauszuege_lauf_id_idx on public.bankauszuege (lauf_id);
create index bankauszuege_gesellschaft_id_idx on public.bankauszuege (gesellschaft_id);

-- ---------------------------------------------------------------- Bankbuchungen

create table public.bankbuchungen (
  id uuid primary key default gen_random_uuid(),
  bankauszug_id uuid not null
    references public.bankauszuege (id) on delete cascade,
  buchungsdatum date not null,
  betrag numeric(12, 2) not null,
  gegenkonto_iban text
    check (
      gegenkonto_iban is null
      or (
        length(gegenkonto_iban) between 15 and 34
        and gegenkonto_iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$'
      )
    ),
  auftraggeber_name text,
  verwendungszweck text,
  fingerprint text not null,
  created_at timestamptz not null default now()
);

create index bankbuchungen_bankauszug_id_idx on public.bankbuchungen (bankauszug_id);
create index bankbuchungen_iban_datum_idx
  on public.bankbuchungen (gegenkonto_iban, buchungsdatum)
  where gegenkonto_iban is not null;
create unique index bankbuchungen_fingerprint_uidx
  on public.bankbuchungen (bankauszug_id, fingerprint);

-- ---------------------------------------------------------------- Positionen (Soll je Mietverhaeltnis)

create table public.sollstellung_positionen (
  id uuid primary key default gen_random_uuid(),
  lauf_id uuid not null
    references public.sollstellung_laeufe (id) on delete cascade,
  mietverhaeltnis_id uuid not null
    references public.mietverhaeltnisse (id) on update cascade on delete restrict,
  mieter_name text not null,
  iban text,
  einheit_id text not null,
  einheit_lage text not null,
  objekt_id text not null,
  objekt_bezeichnung text not null,
  gesellschaft_id text not null,
  gesellschaft_name text not null,
  kaltmiete numeric(12, 2) not null check (kaltmiete >= 0),
  nk_vorauszahlung numeric(12, 2) check (nk_vorauszahlung is null or nk_vorauszahlung >= 0),
  soll_betrag numeric(12, 2) not null check (soll_betrag >= 0),
  ist_betrag numeric(12, 2) not null default 0,
  differenz numeric(12, 2) not null default 0,
  status public.sollstellung_position_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lauf_id, mietverhaeltnis_id)
);

create index sollstellung_positionen_lauf_id_idx
  on public.sollstellung_positionen (lauf_id);
create index sollstellung_positionen_status_idx
  on public.sollstellung_positionen (lauf_id, status);
create index sollstellung_positionen_gesellschaft_idx
  on public.sollstellung_positionen (lauf_id, gesellschaft_id);
create index sollstellung_positionen_objekt_idx
  on public.sollstellung_positionen (lauf_id, objekt_id);

create trigger sollstellung_positionen_set_updated_at
  before update on public.sollstellung_positionen
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- Zuordnungen Bankbuchung ↔ Position

create table public.sollstellung_zuordnungen (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null
    references public.sollstellung_positionen (id) on delete cascade,
  bankbuchung_id uuid not null
    references public.bankbuchungen (id) on delete cascade,
  betrag numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  unique (position_id, bankbuchung_id)
);

create index sollstellung_zuordnungen_position_id_idx
  on public.sollstellung_zuordnungen (position_id);
create index sollstellung_zuordnungen_bankbuchung_id_idx
  on public.sollstellung_zuordnungen (bankbuchung_id);

-- ---------------------------------------------------------------- Views

create or replace view public.v_sollstellung_laeufe
with (security_invoker = true) as
select
  l.id,
  l.zeitraum,
  l.gesellschaft_id,
  g.name as gesellschaft_name,
  g.kuerzel as gesellschaft_kuerzel,
  l.status,
  l.bemerkung,
  l.created_at,
  l.updated_at,
  coalesce(p.anzahl_positionen, 0)::integer as anzahl_positionen,
  coalesce(p.soll_summe, 0)::numeric as soll_summe,
  coalesce(p.ist_summe, 0)::numeric as ist_summe,
  coalesce(p.differenz_summe, 0)::numeric as differenz_summe,
  coalesce(p.anzahl_fehlt, 0)::integer as anzahl_fehlt,
  coalesce(p.anzahl_teilweise, 0)::integer as anzahl_teilweise,
  coalesce(p.anzahl_ausgeglichen, 0)::integer as anzahl_ausgeglichen,
  coalesce(p.anzahl_ueberzahlung, 0)::integer as anzahl_ueberzahlung,
  coalesce(p.anzahl_ohne_iban, 0)::integer as anzahl_ohne_iban,
  coalesce(b.anzahl_bankauszuege, 0)::integer as anzahl_bankauszuege
from public.sollstellung_laeufe l
left join public.gesellschaften g on g.id = l.gesellschaft_id
left join lateral (
  select
    count(*)::integer as anzahl_positionen,
    coalesce(sum(sp.soll_betrag), 0) as soll_summe,
    coalesce(sum(sp.ist_betrag), 0) as ist_summe,
    coalesce(sum(sp.differenz), 0) as differenz_summe,
    count(*) filter (where sp.status = 'fehlt')::integer as anzahl_fehlt,
    count(*) filter (where sp.status = 'teilweise')::integer as anzahl_teilweise,
    count(*) filter (where sp.status = 'ausgeglichen')::integer as anzahl_ausgeglichen,
    count(*) filter (where sp.status = 'ueberzahlung')::integer as anzahl_ueberzahlung,
    count(*) filter (where sp.status = 'ohne_iban')::integer as anzahl_ohne_iban
  from public.sollstellung_positionen sp
  where sp.lauf_id = l.id
) p on true
left join lateral (
  select count(*)::integer as anzahl_bankauszuege
  from public.bankauszuege ba
  where ba.lauf_id = l.id
) b on true;

create or replace view public.v_bankauszuege
with (security_invoker = true) as
select
  ba.id,
  ba.lauf_id,
  ba.gesellschaft_id,
  g.name as gesellschaft_name,
  g.kuerzel as gesellschaft_kuerzel,
  ba.dateiname,
  ba.zeitraum_von,
  ba.zeitraum_bis,
  ba.anzahl_buchungen,
  ba.created_at
from public.bankauszuege ba
join public.gesellschaften g on g.id = ba.gesellschaft_id;

-- ---------------------------------------------------------------- Hilfsfunktionen

create or replace function public.sollstellung_position_status_berechnen(
  p_iban text,
  p_soll numeric,
  p_ist numeric
) returns public.sollstellung_position_status
language sql
immutable
set search_path = public
as $$
  select case
    when p_iban is null or btrim(p_iban) = '' then 'ohne_iban'::public.sollstellung_position_status
    when abs(coalesce(p_soll, 0) - coalesce(p_ist, 0)) < 0.01 then 'ausgeglichen'::public.sollstellung_position_status
    when coalesce(p_ist, 0) <= 0 then 'fehlt'::public.sollstellung_position_status
    when coalesce(p_ist, 0) < coalesce(p_soll, 0) then 'teilweise'::public.sollstellung_position_status
    else 'ueberzahlung'::public.sollstellung_position_status
  end;
$$;

create or replace function public.erzeuge_sollstellung_lauf(
  p_zeitraum text,
  p_gesellschaft_id text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lauf_id uuid;
  v_monat_start date;
  v_monat_ende date;
begin
  if not public.jwt_darf_schreiben() then
    raise exception 'Keine Berechtigung';
  end if;

  if p_zeitraum is null or p_zeitraum !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Ungültiger Zeitraum (erwartet YYYY-MM)';
  end if;

  v_monat_start := (p_zeitraum || '-01')::date;
  v_monat_ende := (v_monat_start + interval '1 month - 1 day')::date;

  if p_gesellschaft_id is not null and not exists (
    select 1 from public.gesellschaften g where g.id = p_gesellschaft_id
  ) then
    raise exception 'Gesellschaft nicht gefunden';
  end if;

  if exists (
    select 1
    from public.sollstellung_laeufe l
    where l.zeitraum = p_zeitraum
      and coalesce(l.gesellschaft_id, '') = coalesce(p_gesellschaft_id, '')
  ) then
    raise exception 'Für diesen Monat existiert bereits eine Sollstellung';
  end if;

  insert into public.sollstellung_laeufe (zeitraum, gesellschaft_id)
  values (p_zeitraum, p_gesellschaft_id)
  returning id into v_lauf_id;

  insert into public.sollstellung_positionen (
    lauf_id,
    mietverhaeltnis_id,
    mieter_name,
    iban,
    einheit_id,
    einheit_lage,
    objekt_id,
    objekt_bezeichnung,
    gesellschaft_id,
    gesellschaft_name,
    kaltmiete,
    nk_vorauszahlung,
    soll_betrag,
    ist_betrag,
    differenz,
    status
  )
  select
    v_lauf_id,
    m.id,
    m.mieter_name,
    m.iban,
    e.id,
    e.lage,
    o.id,
    o.bezeichnung,
    g.id,
    g.name,
    m.kaltmiete,
    m.nk_vorauszahlung,
    m.kaltmiete + coalesce(m.nk_vorauszahlung, 0),
    0,
    m.kaltmiete + coalesce(m.nk_vorauszahlung, 0),
    public.sollstellung_position_status_berechnen(
      m.iban,
      m.kaltmiete + coalesce(m.nk_vorauszahlung, 0),
      0
    )
  from public.mietverhaeltnisse m
  join public.einheiten e on e.id = m.einheit_id
  join public.objekte o on o.id = e.objekt_id
  join public.gesellschaften g on g.id = o.gesellschaft_id
  where m.status in ('aktiv', 'gekuendigt')
    and (m.beginn is null or m.beginn <= v_monat_ende)
    and (m.ende is null or m.ende >= v_monat_start)
    and (p_gesellschaft_id is null or g.id = p_gesellschaft_id);

  return v_lauf_id;
end;
$$;

create or replace function public.gleiche_sollstellung_ab(p_lauf_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_zeitraum text;
  v_monat_start date;
  v_monat_ende date;
begin
  if not public.jwt_darf_schreiben() then
    raise exception 'Keine Berechtigung';
  end if;

  select l.zeitraum into v_zeitraum
  from public.sollstellung_laeufe l
  where l.id = p_lauf_id;

  if v_zeitraum is null then
    raise exception 'Sollstellung nicht gefunden';
  end if;

  v_monat_start := (v_zeitraum || '-01')::date;
  v_monat_ende := (v_monat_start + interval '1 month - 1 day')::date;

  delete from public.sollstellung_zuordnungen z
  using public.sollstellung_positionen p
  where z.position_id = p.id
    and p.lauf_id = p_lauf_id;

  insert into public.sollstellung_zuordnungen (position_id, bankbuchung_id, betrag)
  select
    p.id,
    b.id,
    b.betrag
  from public.sollstellung_positionen p
  join public.bankauszuege ba
    on ba.lauf_id = p.lauf_id
   and ba.gesellschaft_id = p.gesellschaft_id
  join public.bankbuchungen b on b.bankauszug_id = ba.id
  where p.lauf_id = p_lauf_id
    and p.iban is not null
    and b.gegenkonto_iban = p.iban
    and b.betrag > 0
    and b.buchungsdatum between v_monat_start and v_monat_ende;

  update public.sollstellung_positionen p
  set
    ist_betrag = coalesce(s.ist, 0),
    differenz = p.soll_betrag - coalesce(s.ist, 0),
    status = public.sollstellung_position_status_berechnen(
      p.iban,
      p.soll_betrag,
      coalesce(s.ist, 0)
    ),
    updated_at = now()
  from (
    select
      p2.id as position_id,
      coalesce(sum(z.betrag), 0) as ist
    from public.sollstellung_positionen p2
    left join public.sollstellung_zuordnungen z on z.position_id = p2.id
    where p2.lauf_id = p_lauf_id
    group by p2.id
  ) s
  where p.id = s.position_id
    and p.lauf_id = p_lauf_id;
end;
$$;

revoke all on function public.erzeuge_sollstellung_lauf(text, text) from public;
revoke all on function public.gleiche_sollstellung_ab(uuid) from public;
grant execute on function public.erzeuge_sollstellung_lauf(text, text) to authenticated;
grant execute on function public.gleiche_sollstellung_ab(uuid) to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.sollstellung_laeufe enable row level security;
alter table public.bankauszuege enable row level security;
alter table public.bankbuchungen enable row level security;
alter table public.sollstellung_positionen enable row level security;
alter table public.sollstellung_zuordnungen enable row level security;

create policy sollstellung_laeufe_select on public.sollstellung_laeufe
  for select to authenticated using (true);
create policy sollstellung_laeufe_write on public.sollstellung_laeufe
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

create policy bankauszuege_select on public.bankauszuege
  for select to authenticated using (true);
create policy bankauszuege_write on public.bankauszuege
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

create policy bankbuchungen_select on public.bankbuchungen
  for select to authenticated using (true);
create policy bankbuchungen_write on public.bankbuchungen
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

create policy sollstellung_positionen_select on public.sollstellung_positionen
  for select to authenticated using (true);
create policy sollstellung_positionen_write on public.sollstellung_positionen
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

create policy sollstellung_zuordnungen_select on public.sollstellung_zuordnungen
  for select to authenticated using (true);
create policy sollstellung_zuordnungen_write on public.sollstellung_zuordnungen
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
