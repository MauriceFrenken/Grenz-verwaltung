-- Verwaltungs-Stammdaten: Gesellschaften > Objekte > Einheiten > Mietverhaeltnisse.
-- Berechnete Kennzahlen (Anzahl, Summen, Miete/m2, Jahresmiete) liegen in Views,
-- damit sie nie gegenueber den Basisdaten veralten.

create type public.objekt_status as enum ('aktiv', 'inaktiv', 'in_ankauf', 'verkauft');
create type public.einheit_status as enum ('vermietet', 'leerstand', 'wartung', 'reserviert');
create type public.einheit_nutzungsart as enum ('wohnen', 'gewerbe', 'garage', 'stellplatz', 'sonstiges');
create type public.mietverhaeltnis_status as enum ('aktiv', 'gekuendigt', 'beendet', 'geplant');

-- ---------------------------------------------------------------- Gesellschaften

create table public.gesellschaften (
  id text primary key check (id ~ '^[A-Za-z][A-Za-z0-9_-]{1,48}$'),
  name text not null check (length(btrim(name)) > 0),
  kuerzel text not null check (length(btrim(kuerzel)) > 0),
  datev_postfach text,
  datev_postfach_bezeichnung text,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger gesellschaften_set_updated_at
  before update on public.gesellschaften
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- Objekte

create table public.objekte (
  id text primary key check (id ~ '^[A-Za-z][A-Za-z0-9_-]{1,63}$'),
  gesellschaft_id text not null
    references public.gesellschaften (id) on update cascade on delete restrict,
  bezeichnung text not null check (length(btrim(bezeichnung)) > 0),
  strasse text not null default '',
  plz text not null default '',
  ort text not null default '',
  land text not null default 'DE',
  status public.objekt_status not null default 'aktiv',
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index objekte_gesellschaft_id_idx on public.objekte (gesellschaft_id);

create trigger objekte_set_updated_at
  before update on public.objekte
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- Einheiten

create table public.einheiten (
  id text primary key check (id ~ '^[A-Za-z][A-Za-z0-9_-]{1,63}$'),
  objekt_id text not null
    references public.objekte (id) on update cascade on delete cascade,
  hausteil text,
  lage text not null check (length(btrim(lage)) > 0),
  nutzungsart public.einheit_nutzungsart not null default 'wohnen',
  status public.einheit_status not null default 'leerstand',
  flaeche_m2 numeric(10, 2) check (flaeche_m2 is null or flaeche_m2 >= 0),
  flaeche_aufmass_m2 numeric(10, 2) check (flaeche_aufmass_m2 is null or flaeche_aufmass_m2 >= 0),
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index einheiten_objekt_id_idx on public.einheiten (objekt_id);

create trigger einheiten_set_updated_at
  before update on public.einheiten
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- Mietverhaeltnisse

create table public.mietverhaeltnisse (
  id uuid primary key default gen_random_uuid(),
  einheit_id text not null
    references public.einheiten (id) on update cascade on delete cascade,
  mieter_name text not null check (length(btrim(mieter_name)) > 0),
  beginn date,
  ende date,
  letzte_mieterhoehung date,
  kaltmiete numeric(12, 2) not null default 0 check (kaltmiete >= 0),
  nk_vorauszahlung numeric(12, 2) check (nk_vorauszahlung is null or nk_vorauszahlung >= 0),
  status public.mietverhaeltnis_status not null default 'aktiv',
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mietverhaeltnisse_zeitraum_check check (ende is null or beginn is null or ende >= beginn)
);

create index mietverhaeltnisse_einheit_id_idx on public.mietverhaeltnisse (einheit_id);

-- Je Einheit darf hoechstens ein Mietverhaeltnis aktiv sein.
create unique index mietverhaeltnisse_ein_aktives_pro_einheit
  on public.mietverhaeltnisse (einheit_id)
  where status = 'aktiv';

create trigger mietverhaeltnisse_set_updated_at
  before update on public.mietverhaeltnisse
  for each row execute function public.set_updated_at();

-- Einheiten-Status folgt dem Mietverhaeltnis, damit beide nie auseinanderlaufen.
create or replace function public.einheit_status_synchronisieren()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_einheit text := coalesce(new.einheit_id, old.einheit_id);
begin
  update public.einheiten e
  set status = case
    when exists (
      select 1 from public.mietverhaeltnisse m
      where m.einheit_id = v_einheit and m.status = 'aktiv'
    ) then 'vermietet'::public.einheit_status
    when e.status in ('wartung', 'reserviert') then e.status
    else 'leerstand'::public.einheit_status
  end
  where e.id = v_einheit;

  return null;
end;
$function$;

create trigger mietverhaeltnisse_einheit_status
  after insert or update or delete on public.mietverhaeltnisse
  for each row execute function public.einheit_status_synchronisieren();

-- ---------------------------------------------------------------- Benutzer-Zuordnung

create table public.benutzer_gesellschaften (
  benutzer_id uuid not null references public.profiles (id) on delete cascade,
  gesellschaft_id text not null
    references public.gesellschaften (id) on update cascade on delete cascade,
  primary key (benutzer_id, gesellschaft_id)
);

create index benutzer_gesellschaften_gesellschaft_idx
  on public.benutzer_gesellschaften (gesellschaft_id);

-- ---------------------------------------------------------------- Views mit Kennzahlen

create view public.v_einheiten with (security_invoker = on) as
select
  e.id,
  e.objekt_id,
  o.bezeichnung                as objekt_bezeichnung,
  o.gesellschaft_id,
  g.name                       as gesellschaft_name,
  e.hausteil,
  e.lage,
  e.nutzungsart,
  e.status,
  e.flaeche_m2,
  e.flaeche_aufmass_m2,
  e.bemerkung,
  mv.id                        as mietverhaeltnis_id,
  mv.mieter_name,
  mv.beginn                    as vertragsbeginn,
  mv.letzte_mieterhoehung,
  coalesce(mv.kaltmiete, 0)    as kaltmiete,
  mv.nk_vorauszahlung,
  case
    when coalesce(e.flaeche_m2, 0) > 0 and coalesce(mv.kaltmiete, 0) > 0
      then round(mv.kaltmiete / e.flaeche_m2, 2)
  end                          as miete_pro_m2,
  coalesce(mv.kaltmiete, 0) * 12 as kaltmiete_jahr,
  e.created_at,
  e.updated_at
from public.einheiten e
join public.objekte o on o.id = e.objekt_id
join public.gesellschaften g on g.id = o.gesellschaft_id
left join public.mietverhaeltnisse mv
  on mv.einheit_id = e.id and mv.status = 'aktiv';

create view public.v_objekte with (security_invoker = on) as
select
  o.id,
  o.gesellschaft_id,
  g.name as gesellschaft_name,
  o.bezeichnung,
  o.strasse,
  o.plz,
  o.ort,
  o.land,
  o.status,
  o.bemerkung,
  coalesce(k.einheiten_gesamt, 0)    as einheiten_gesamt,
  coalesce(k.einheiten_wohnen, 0)    as einheiten_wohnen,
  coalesce(k.einheiten_stellplatz, 0) as einheiten_stellplatz,
  coalesce(k.einheiten_vermietet, 0) as einheiten_vermietet,
  coalesce(k.einheiten_leer, 0)      as einheiten_leer,
  coalesce(k.wohnflaeche_m2, 0)      as wohnflaeche_m2,
  coalesce(k.kaltmiete, 0)           as kaltmiete,
  coalesce(k.kaltmiete, 0) * 12      as kaltmiete_jahr,
  case
    when coalesce(k.wohnflaeche_wohnen_m2, 0) > 0
      then round(coalesce(k.kaltmiete_wohnen, 0) / k.wohnflaeche_wohnen_m2, 2)
  end                                as miete_pro_m2_wohnen,
  o.created_at,
  o.updated_at
from public.objekte o
join public.gesellschaften g on g.id = o.gesellschaft_id
left join lateral (
  select
    count(*)                                                          as einheiten_gesamt,
    count(*) filter (where e.nutzungsart = 'wohnen')                  as einheiten_wohnen,
    count(*) filter (where e.nutzungsart in ('garage', 'stellplatz')) as einheiten_stellplatz,
    count(*) filter (where e.status = 'vermietet')                    as einheiten_vermietet,
    count(*) filter (where e.status <> 'vermietet')                   as einheiten_leer,
    sum(e.flaeche_m2)                                                 as wohnflaeche_m2,
    sum(e.kaltmiete)                                                  as kaltmiete,
    sum(e.flaeche_m2) filter (where e.nutzungsart = 'wohnen')         as wohnflaeche_wohnen_m2,
    sum(e.kaltmiete) filter (where e.nutzungsart = 'wohnen')          as kaltmiete_wohnen
  from public.v_einheiten e
  where e.objekt_id = o.id
) k on true;

create view public.v_gesellschaften with (security_invoker = on) as
select
  g.id,
  g.name,
  g.kuerzel,
  g.datev_postfach,
  g.datev_postfach_bezeichnung,
  g.bemerkung,
  coalesce(k.objekte_liste, '')      as objekte_liste,
  coalesce(k.anzahl_objekte, 0)      as anzahl_objekte,
  coalesce(k.anzahl_einheiten, 0)    as anzahl_einheiten,
  coalesce(k.kaltmiete, 0)           as kaltmiete,
  coalesce(k.kaltmiete, 0) * 12      as kaltmiete_jahr,
  g.created_at,
  g.updated_at
from public.gesellschaften g
left join lateral (
  select
    count(*)                          as anzahl_objekte,
    sum(o.einheiten_gesamt)           as anzahl_einheiten,
    sum(o.kaltmiete)                  as kaltmiete,
    string_agg(
      o.bezeichnung || case when o.ort <> '' then ', ' || o.ort else '' end,
      '; ' order by o.id
    )                                 as objekte_liste
  from public.v_objekte o
  where o.gesellschaft_id = g.id
) k on true;

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
  m.mieter_name,
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
join public.gesellschaften g on g.id = o.gesellschaft_id;

-- ---------------------------------------------------------------- RLS

alter table public.gesellschaften enable row level security;
alter table public.objekte enable row level security;
alter table public.einheiten enable row level security;
alter table public.mietverhaeltnisse enable row level security;
alter table public.benutzer_gesellschaften enable row level security;

create policy gesellschaften_select on public.gesellschaften
  for select to authenticated using (true);
create policy gesellschaften_write on public.gesellschaften
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

create policy objekte_select on public.objekte
  for select to authenticated using (true);
create policy objekte_write on public.objekte
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

create policy einheiten_select on public.einheiten
  for select to authenticated using (true);
create policy einheiten_write on public.einheiten
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

create policy mietverhaeltnisse_select on public.mietverhaeltnisse
  for select to authenticated using (true);
create policy mietverhaeltnisse_write on public.mietverhaeltnisse
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

create policy benutzer_gesellschaften_select on public.benutzer_gesellschaften
  for select to authenticated
  using (
    auth.uid() = benutzer_id
    or public.jwt_rolle() in ('op_admin', 'administrator', 'manager')
  );
create policy benutzer_gesellschaften_write on public.benutzer_gesellschaften
  for all to authenticated
  using (public.jwt_rolle() in ('op_admin', 'administrator', 'manager'))
  with check (public.jwt_rolle() in ('op_admin', 'administrator', 'manager'));

grant select on public.v_gesellschaften, public.v_objekte, public.v_einheiten, public.v_mietverhaeltnisse
  to authenticated;

-- Fremdschluessel der Posteingangs-Dokumente auf die neuen Gesellschaften zeigen lassen.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posteingang_dokumente'
      and column_name = 'gesellschaft_id'
  ) then
    alter table public.posteingang_dokumente
      add constraint posteingang_dokumente_gesellschaft_id_fkey
      foreign key (gesellschaft_id) references public.gesellschaften (id) on delete set null;
  end if;
end
$$;
