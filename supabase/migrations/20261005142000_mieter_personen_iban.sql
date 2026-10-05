-- Mieter-Stammdaten: personen (+ IBAN), Junction, Views, Backfill aus Mietverhältnissen.
-- Catch-up für lokale DBs, in denen frenken_erweiterung_1_* fehlt.

create table if not exists public.personen (
  id uuid primary key default gen_random_uuid(),
  typ text not null default 'mieter'
    check (typ = any (array[
      'mieter'::text,
      'kaeufer'::text,
      'makler'::text,
      'bank'::text,
      'gesellschafter'::text,
      'dienstleister'::text,
      'sonstige'::text
    ])),
  anrede text,
  vorname text,
  nachname text,
  firma text,
  telefon text,
  e_mail text,
  anschrift text,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personen_check check (
    coalesce(btrim(nachname), '') <> ''
    or coalesce(btrim(firma), '') <> ''
  )
);

create table if not exists public.mietverhaeltnis_personen (
  mietverhaeltnis_id uuid not null
    references public.mietverhaeltnisse (id) on delete cascade,
  person_id uuid not null
    references public.personen (id) on delete restrict,
  rolle text not null default 'hauptmieter'
    check (rolle = any (array[
      'hauptmieter'::text,
      'mitmieter'::text,
      'buerge'::text
    ])),
  created_at timestamptz not null default now(),
  primary key (mietverhaeltnis_id, person_id)
);

create table if not exists public.mieterhoehungen (
  id uuid primary key default gen_random_uuid(),
  mietverhaeltnis_id uuid not null
    references public.mietverhaeltnisse (id) on delete cascade,
  verlangt_am date,
  wirksam_ab date not null,
  alte_miete numeric check (alte_miete is null or alte_miete >= 0),
  neue_miete numeric not null check (neue_miete >= 0),
  grundlage text check (
    grundlage is null
    or grundlage = any (array[
      '558_vergleichsmiete'::text,
      'index'::text,
      'staffel'::text,
      'vereinbarung'::text,
      'modernisierung'::text
    ])
  ),
  status text not null default 'verlangt'
    check (status = any (array[
      'geplant'::text,
      'verlangt'::text,
      'zugestimmt'::text,
      'abgelehnt'::text,
      'ersetzt'::text,
      'wirksam'::text
    ])),
  beleg_pfad text,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists personen_set_updated_at on public.personen;
create trigger personen_set_updated_at
  before update on public.personen
  for each row execute function public.set_updated_at();

drop trigger if exists mieterhoehungen_set_updated_at on public.mieterhoehungen;
create trigger mieterhoehungen_set_updated_at
  before update on public.mieterhoehungen
  for each row execute function public.set_updated_at();

alter table public.personen enable row level security;
alter table public.mietverhaeltnis_personen enable row level security;
alter table public.mieterhoehungen enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'personen' and policyname = 'personen_select'
  ) then
    create policy personen_select on public.personen
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'personen' and policyname = 'personen_write'
  ) then
    create policy personen_write on public.personen
      for all to authenticated
      using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mietverhaeltnis_personen'
      and policyname = 'mietverhaeltnis_personen_select'
  ) then
    create policy mietverhaeltnis_personen_select on public.mietverhaeltnis_personen
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mietverhaeltnis_personen'
      and policyname = 'mietverhaeltnis_personen_write'
  ) then
    create policy mietverhaeltnis_personen_write on public.mietverhaeltnis_personen
      for all to authenticated
      using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mieterhoehungen'
      and policyname = 'mieterhoehungen_select'
  ) then
    create policy mieterhoehungen_select on public.mieterhoehungen
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mieterhoehungen'
      and policyname = 'mieterhoehungen_write'
  ) then
    create policy mieterhoehungen_write on public.mieterhoehungen
      for all to authenticated
      using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
  end if;
end $$;

-- IBAN am Mieter-Profil
alter table public.personen
  add column if not exists iban text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'personen_iban_format_check'
      and conrelid = 'public.personen'::regclass
  ) then
    alter table public.personen
      add constraint personen_iban_format_check check (
        iban is null
        or (
          length(iban) between 15 and 34
          and iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$'
        )
      );
  end if;
end $$;

comment on column public.personen.iban is
  'IBAN des Mieters (ohne Leerzeichen, Großbuchstaben); für Sollstellungs-Abgleich.';

create index if not exists personen_iban_idx
  on public.personen (iban)
  where iban is not null;

create index if not exists personen_typ_idx on public.personen (typ);

create index if not exists mietverhaeltnis_personen_person_id_idx
  on public.mietverhaeltnis_personen (person_id);

-- Anzeigename-Hilfsfunktion
create or replace function public.person_anzeigename(
  p_vorname text,
  p_nachname text,
  p_firma text
) returns text
language sql
immutable
as $$
  select coalesce(
    nullif(btrim(concat_ws(' ', nullif(btrim(p_vorname), ''), nullif(btrim(p_nachname), ''))), ''),
    nullif(btrim(p_firma), ''),
    ''
  );
$$;

-- Backfill: ein Mieter-Profil je (Name, IBAN), dann Junction als Hauptmieter
with distinct_mieter as (
  select distinct on (lower(btrim(m.mieter_name)), coalesce(m.iban, ''))
    btrim(m.mieter_name) as name,
    m.iban
  from public.mietverhaeltnisse m
  where coalesce(btrim(m.mieter_name), '') <> ''
  order by lower(btrim(m.mieter_name)), coalesce(m.iban, ''), m.id
)
insert into public.personen (typ, nachname, iban)
select 'mieter', d.name, d.iban
from distinct_mieter d
where not exists (
  select 1
  from public.personen p
  where p.typ = 'mieter'
    and p.nachname = d.name
    and coalesce(p.iban, '') = coalesce(d.iban, '')
);

insert into public.mietverhaeltnis_personen (mietverhaeltnis_id, person_id, rolle)
select m.id, p.id, 'hauptmieter'
from public.mietverhaeltnisse m
join public.personen p
  on p.typ = 'mieter'
 and lower(p.nachname) = lower(btrim(m.mieter_name))
 and coalesce(p.iban, '') = coalesce(m.iban, '')
where coalesce(btrim(m.mieter_name), '') <> ''
  and not exists (
    select 1
    from public.mietverhaeltnis_personen mp
    where mp.mietverhaeltnis_id = m.id
      and mp.rolle = 'hauptmieter'
  );

create or replace view public.v_mieter with (security_invoker = on) as
select
  p.id,
  p.anrede,
  p.vorname,
  p.nachname,
  p.firma,
  public.person_anzeigename(p.vorname, p.nachname, p.firma) as anzeigename,
  p.iban,
  p.telefon,
  p.e_mail,
  p.anschrift,
  p.bemerkung,
  p.created_at,
  p.updated_at,
  coalesce(k.anzahl_mietverhaeltnisse, 0)::integer as anzahl_mietverhaeltnisse
from public.personen p
left join lateral (
  select count(*)::integer as anzahl_mietverhaeltnisse
  from public.mietverhaeltnis_personen mp
  where mp.person_id = p.id
) k on true
where p.typ = 'mieter';

drop view if exists public.v_mietverhaeltnisse;

create view public.v_mietverhaeltnisse with (security_invoker = on) as
select
  m.id,
  m.einheit_id,
  e.lage        as einheit_lage,
  e.hausteil,
  e.nutzungsart,
  e.flaeche_m2,
  o.id          as objekt_id,
  o.bezeichnung as objekt_bezeichnung,
  g.id          as gesellschaft_id,
  g.name        as gesellschaft_name,
  hp.person_id  as mieter_id,
  coalesce(
    nullif(public.person_anzeigename(hp.vorname, hp.nachname, hp.firma), ''),
    m.mieter_name
  )             as mieter_name,
  coalesce(hp.iban, m.iban) as iban,
  m.beginn,
  m.ende,
  m.letzte_mieterhoehung,
  m.kaltmiete,
  m.nk_vorauszahlung,
  m.kaltmiete * 12 as kaltmiete_jahr,
  case
    when coalesce(e.flaeche_m2, 0) > 0 and m.kaltmiete > 0
      then round(m.kaltmiete / e.flaeche_m2, 2)
  end           as miete_pro_m2,
  m.status,
  m.bemerkung,
  m.created_at,
  m.updated_at
from public.mietverhaeltnisse m
join public.einheiten e on e.id = m.einheit_id
join public.objekte o on o.id = e.objekt_id
join public.gesellschaften g on g.id = o.gesellschaft_id
left join lateral (
  select
    mp.person_id,
    p.vorname,
    p.nachname,
    p.firma,
    p.iban
  from public.mietverhaeltnis_personen mp
  join public.personen p on p.id = mp.person_id
  where mp.mietverhaeltnis_id = m.id
    and mp.rolle = 'hauptmieter'
  order by mp.created_at asc
  limit 1
) hp on true;

grant select on public.v_mieter, public.v_mietverhaeltnisse to authenticated;
grant select, insert, update, delete on public.personen to authenticated;
grant select, insert, update, delete on public.mietverhaeltnis_personen to authenticated;
grant select, insert, update, delete on public.mieterhoehungen to authenticated;
