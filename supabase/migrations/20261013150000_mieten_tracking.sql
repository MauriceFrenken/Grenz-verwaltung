-- Mieten-Tracking: Mietkonto je Mietvertrag, ohne monatliche Handarbeit.
--
-- 1. Sollstellung: Für jeden laufenden Mietvertrag entsteht automatisch je Monat
--    eine Soll-Zeile (Kaltmiete inkl. Mieterhöhungen + NK-Vorauszahlung,
--    fällig am 3. Werktag, anteilig bei Beginn/Ende im Monat).
-- 2. Zuordnung: Jeder Mieteingang aus EBICS wird automatisch einem Vertrag
--    zugeordnet: per IBAN, per gelerntem Zahler oder per Mietername.
--    Was nicht eindeutig ist, landet in der Prüfliste. Eine Zuordnung von Hand
--    merkt sich IBAN und Zahlername für alle weiteren Zahlungen.
-- 3. Mietkonto: Zahlungen tilgen immer die älteste offene Monatsmiete zuerst.
--    Daraus folgen Rückstand, offene Monate und Mahnstufe je Mieter.
--
-- Die bisherigen Sollstellungs-Läufe (sollstellung_*) bleiben unverändert bestehen.

-- ---------------------------------------------------------------- Stammdaten

-- Auf Produktiv ggf. manuell vorhanden; für Greenfield hier nachziehen.
alter table public.bankkonten
  add column if not exists objekt_id text
    references public.objekte (id) on update cascade on delete set null;

alter table public.objekte add column if not exists mieten_ab date;
comment on column public.objekte.mieten_ab is
  'Erster Monat, ab dem Mieten im Mietkonto erwartet werden (Übernahme bzw. Beginn der Bankdaten). Leer = 01.11.2025.';

-- Startwerte: erster voller Monat mit Bankdaten auf dem Mietkonto der Liegenschaft.
-- Die Bankhistorie beginnt am 01.10.2025; wer zum Monatsende vorauszahlt, hat die
-- Oktobermiete 2025 schon im September überwiesen. Deshalb gilt allgemein der November.
update public.objekte set mieten_ab = date '2026-10-01'
where id in ('O-01', 'O-05') and mieten_ab is null;

-- ---------------------------------------------------------------- Hilfsfunktionen

-- Text für Namensvergleiche: klein, ohne Umlaute/Akzente, nur Buchstaben/Ziffern.
-- "Müller", "Mueller" und "MULLER" ergeben dasselbe.
create or replace function public.mieten_text_norm(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    replace(replace(replace(
      translate(
        replace(lower(coalesce(p, '')), 'ß', 'ss'),
        'äöüáàâãåéèêëíìîïóòôõøúùûýçñčšžćđłńśźżěřů',
        'aouaaaaaeeeeiiiiooooouuuycncszcdlnszzeru'
      ),
      'ae', 'a'), 'oe', 'o'), 'ue', 'u'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- Ämter und Sammelzahler (Jobcenter, Sozialamt ...): eine IBAN zahlt für viele Mieter.
-- Hier zählt nur der Verwendungszweck, nie IBAN oder Auftraggebername.
create or replace function public.mieten_sammelzahler(p_name text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.mieten_text_norm(p_name) ~
    '(bundesagentur|jobcenter|agentur fur arbeit|arbeitsagentur|sozialamt|grundsicherung|wohngeld|stadtkasse|kreiskasse|landeshauptstadt|^stadt |^kreis |kommunal|rentenversicherung|landschaftsverband)';
$$;

create or replace function public.mieten_ostersonntag(p_jahr integer)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  a int := p_jahr % 19;
  b int := p_jahr / 100;
  c int := p_jahr % 100;
  d int; e int; f int; g int; h int; i int; k int; l int; m int; x int;
begin
  d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  x := h + l - 7 * m + 114;
  return make_date(p_jahr, x / 31, (x % 31) + 1);
end;
$$;

-- Gesetzliche Feiertage NRW
create or replace function public.mieten_feiertag_nrw(p_tag date)
returns boolean
language sql
immutable
set search_path = public
as $$
  with o as (select public.mieten_ostersonntag(extract(year from p_tag)::int) as os)
  select to_char(p_tag, 'MM-DD') in ('01-01', '05-01', '10-03', '11-01', '12-25', '12-26')
      or p_tag in (os - 2, os + 1, os + 39, os + 50, os + 60)
  from o;
$$;

-- Fälligkeit der Miete: 3. Werktag des Monats (§ 556b BGB). Samstag zählt für die
-- Mietzahlung nicht als Werktag (BGH VIII ZR 129/09), Feiertage NRW auch nicht.
create or replace function public.mieten_faellig_am(p_monat date)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  d date := date_trunc('month', p_monat)::date;
  n int := 0;
begin
  loop
    if extract(isodow from d) < 6 and not public.mieten_feiertag_nrw(d) then
      n := n + 1;
      if n = 3 then return d; end if;
    end if;
    d := d + 1;
  end loop;
end;
$$;

-- Heute in Deutschland
create or replace function public.mieten_heute()
returns date
language sql
stable
set search_path = public
as $$ select (now() at time zone 'Europe/Berlin')::date; $$;

-- Namensbestandteile eines Vertrags für den Abgleich (mind. 4 Zeichen, ohne Anreden).
create or replace function public.mieten_namensteile(p_text text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct w), '{}')
  from regexp_split_to_table(public.mieten_text_norm(p_text), ' ') w
  where length(w) >= 4
    and w not in ('herr', 'frau', 'herrn', 'familie', 'eheleute', 'oder', 'gmbh',
                  'mieter', 'miete', 'service', 'verwaltung', 'immobilien', 'garage',
                  'stellplatz');
$$;

-- ---------------------------------------------------------------- Verträge (Sicht)

-- Alle Verträge, die Miete erwarten lassen, mit Mietkonto-Beginn und Namensteilen.
create or replace view public.v_mieten_vertraege
with (security_invoker = true) as
select
  m.id as mietverhaeltnis_id,
  m.mieter_name,
  nullif(upper(replace(m.iban, ' ', '')), '') as iban,
  m.status,
  m.beginn,
  m.ende,
  m.kaltmiete,
  coalesce(m.nk_vorauszahlung, 0) as nk_vorauszahlung,
  e.id as einheit_id,
  e.lage as einheit_lage,
  e.nutzungsart::text as nutzungsart,
  o.id as objekt_id,
  o.bezeichnung as objekt_bezeichnung,
  o.gesellschaft_id,
  greatest(
    coalesce(o.mieten_ab, date '2025-11-01'),
    coalesce(date_trunc('month', m.beginn)::date, date '1900-01-01')
  ) as erfasst_ab,
  public.mieten_namensteile(
    m.mieter_name || ' ' || coalesce((
      select string_agg(concat_ws(' ', p.vorname, p.nachname, p.firma), ' ')
      from public.mietverhaeltnis_personen mp
      join public.personen p on p.id = mp.person_id
      where mp.mietverhaeltnis_id = m.id
    ), '')
  ) as namensteile
from public.mietverhaeltnisse m
join public.einheiten e on e.id = m.einheit_id
join public.objekte o on o.id = e.objekt_id
where m.status in ('aktiv', 'gekuendigt')
   or (m.status = 'beendet' and m.ende is not null);

-- ---------------------------------------------------------------- Tabellen

create table if not exists public.mietsoll (
  id uuid primary key default gen_random_uuid(),
  mietverhaeltnis_id uuid not null
    references public.mietverhaeltnisse (id) on delete cascade,
  monat date not null check (monat = date_trunc('month', monat)::date),
  faellig_am date not null,
  kaltmiete numeric(12, 2) not null,
  nk_vorauszahlung numeric(12, 2) not null default 0,
  betrag numeric(12, 2) generated always as (kaltmiete + nk_vorauszahlung) stored,
  -- vertrag = automatisch aus dem Mietvertrag; manuell = von Hand korrigiert (z. B. Minderung)
  quelle text not null default 'vertrag' check (quelle in ('vertrag', 'manuell')),
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mietverhaeltnis_id, monat)
);
create index if not exists mietsoll_monat_idx on public.mietsoll (monat);

-- Gelernte Zahler: IBAN, Auftraggebername oder Referenz (z. B. Jobcenter-Nummer im
-- Verwendungszweck), die zu einem Vertrag gehören. Ohne Vertrag = zahlt keine Miete
-- (z. B. Stadtwerke-Erstattungen); solche Eingänge erscheinen nicht mehr in der Prüfliste.
create table if not exists public.mietzahler (
  id uuid primary key default gen_random_uuid(),
  mietverhaeltnis_id uuid
    references public.mietverhaeltnisse (id) on delete cascade,
  iban text,
  name_norm text,
  referenz text,
  quelle text not null check (quelle in ('iban_treffer', 'manuell')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (iban is not null or name_norm is not null or referenz is not null)
);
create unique index if not exists mietzahler_uidx
  on public.mietzahler (
    coalesce(mietverhaeltnis_id::text, ''), coalesce(iban, ''),
    coalesce(name_norm, ''), coalesce(referenz, '')
  );
create index if not exists mietzahler_iban_idx on public.mietzahler (iban) where iban is not null;
create index if not exists mietzahler_name_idx on public.mietzahler (name_norm) where name_norm is not null;

-- Mieteingänge je Vertrag (eine Bankbuchung kann auf mehrere Verträge aufgeteilt sein,
-- z. B. Wohnung + Stellplatz in einer Überweisung).
create table if not exists public.mietzahlungen (
  id uuid primary key default gen_random_uuid(),
  bankbuchung_id uuid not null
    references public.bankbuchungen (id) on delete cascade,
  mietverhaeltnis_id uuid not null
    references public.mietverhaeltnisse (id) on delete cascade,
  buchungsdatum date not null,
  betrag numeric(12, 2) not null,
  -- iban = IBAN aus Vertrag/gelernt, zahler = gelernter Zahlername, name = Mietername im Text
  methode text not null check (methode in ('iban', 'zahler', 'name', 'manuell')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (bankbuchung_id, mietverhaeltnis_id)
);
create index if not exists mietzahlungen_mv_idx on public.mietzahlungen (mietverhaeltnis_id, buchungsdatum);

-- Eingänge, die keine Miete sind (Kaution, Erstattung ...) oder bewusst von Hand
-- geprüft werden sollen. Beide werden nie automatisch zugeordnet.
create table if not exists public.mieteingang_entscheidungen (
  bankbuchung_id uuid primary key
    references public.bankbuchungen (id) on delete cascade,
  art text not null check (art in ('keine_miete', 'pruefen')),
  grund text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- Zahler, die laut Regel keine Miete zahlen (nie für Ämter, die für viele Mieter zahlen)
create or replace function public.mieten_zahler_ignoriert(
  p_iban text, p_name_norm text, p_sammelzahler boolean
) returns boolean
language sql
stable
set search_path = public
as $$
  select not coalesce(p_sammelzahler, false) and exists (
    select 1 from public.mietzahler z
    where z.mietverhaeltnis_id is null
      and ((p_iban is not null and z.iban = p_iban)
           or (length(coalesce(p_name_norm, '')) >= 4 and z.name_norm = p_name_norm))
  );
$$;

-- Referenzen aus dem Verwendungszweck: Ziffernfolgen ab 7 Stellen (Aktenzeichen, BG-Nummer)
create or replace function public.mieten_referenzen(p_zweck text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct m[1]), '{}')
  from regexp_matches(public.mieten_text_norm(p_zweck), '(?:^| )([0-9]{7,})(?= |$)', 'g') m;
$$;

create or replace trigger mietsoll_set_updated_at
  before update on public.mietsoll
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- Mögliche Mieteingänge

-- Eingänge auf aktiven Konten, ohne eigene Konten, Darlehen und Gruppengesellschaften.
create or replace view public.v_mieteingaenge
with (security_invoker = true) as
select
  b.id as bankbuchung_id,
  b.gesellschaft_id,
  b.konto_iban,
  k.objekt_id as konto_objekt_id,
  b.buchungsdatum,
  b.betrag,
  b.gegenkonto_iban,
  b.auftraggeber_name,
  b.verwendungszweck,
  public.mieten_text_norm(b.auftraggeber_name) as name_norm,
  public.mieten_text_norm(b.verwendungszweck) as zweck_norm,
  public.mieten_sammelzahler(b.auftraggeber_name) as sammelzahler,
  public.mieten_text_norm(b.verwendungszweck) ~ 'kaution' as kaution
from public.bankbuchungen_eindeutig b
left join public.bankkonten k on k.iban = b.konto_iban
where b.betrag > 0
  and b.betrag < 20000
  and coalesce(k.aktiv, true)
  and (b.gegenkonto_iban is null
       or not exists (select 1 from public.bankkonten k2 where k2.iban = b.gegenkonto_iban))
  and not exists (
    select 1 from public.darlehen_buchungen d
    where d.bankbuchung_id = b.id or d.fingerprint = b.fingerprint
  )
  and public.mieten_text_norm(b.auftraggeber_name) !~ '(^| )frenken( |$)';

-- ---------------------------------------------------------------- Sollstellung

create or replace function public.mietsoll_fortschreiben()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heute date := public.mieten_heute();
  v_n integer := 0;
  v_d integer;
begin
  create temp table if not exists _mietsoll_neu (
    mietverhaeltnis_id uuid, monat date, faellig_am date,
    kaltmiete numeric(12, 2), nk_vorauszahlung numeric(12, 2)
  ) on commit drop;
  truncate _mietsoll_neu;

  insert into _mietsoll_neu
  select
    v.mietverhaeltnis_id,
    mon.monat,
    public.mieten_faellig_am(mon.monat),
    round(kalt.miete * anteil.faktor, 2),
    round(v.nk_vorauszahlung * anteil.faktor, 2)
  from public.v_mieten_vertraege v
  cross join lateral (
    select gs::date as monat
    from generate_series(
      v.erfasst_ab,
      least(date_trunc('month', v_heute), date_trunc('month', coalesce(v.ende, v_heute))),
      interval '1 month'
    ) gs
  ) mon
  cross join lateral (
    -- Kaltmiete im Monat: letzte wirksame Mieterhöhung, sonst Miete vor der ersten künftigen
    select coalesce(
      (select mh.neue_miete from public.mieterhoehungen mh
       where mh.mietverhaeltnis_id = v.mietverhaeltnis_id
         and mh.status in ('zugestimmt', 'wirksam')
         and date_trunc('month', mh.wirksam_ab) <= mon.monat
       order by mh.wirksam_ab desc limit 1),
      (select mh.alte_miete from public.mieterhoehungen mh
       where mh.mietverhaeltnis_id = v.mietverhaeltnis_id
         and mh.status in ('zugestimmt', 'wirksam')
         and date_trunc('month', mh.wirksam_ab) > mon.monat
         and mh.alte_miete is not null
       order by mh.wirksam_ab asc limit 1),
      v.kaltmiete
    ) as miete
  ) kalt
  cross join lateral (
    -- anteilig, wenn der Vertrag im Monat beginnt oder endet
    select (
      least(coalesce(v.ende, mon.monat + 40), (mon.monat + interval '1 month - 1 day')::date)
      - greatest(coalesce(v.beginn, mon.monat), mon.monat) + 1
    )::numeric
    / extract(day from (mon.monat + interval '1 month - 1 day'))::numeric as faktor
  ) anteil
  where anteil.faktor > 0;

  insert into public.mietsoll as s (mietverhaeltnis_id, monat, faellig_am, kaltmiete, nk_vorauszahlung)
  select mietverhaeltnis_id, monat, faellig_am, kaltmiete, nk_vorauszahlung from _mietsoll_neu
  on conflict (mietverhaeltnis_id, monat) do update
    set kaltmiete = excluded.kaltmiete,
        nk_vorauszahlung = excluded.nk_vorauszahlung,
        faellig_am = excluded.faellig_am
    where s.quelle = 'vertrag'
      and (s.kaltmiete, s.nk_vorauszahlung, s.faellig_am)
          is distinct from (excluded.kaltmiete, excluded.nk_vorauszahlung, excluded.faellig_am);
  get diagnostics v_n = row_count;

  -- Monate, die laut Vertrag nicht (mehr) geschuldet sind
  delete from public.mietsoll s
  where s.quelle = 'vertrag'
    and not exists (
      select 1 from _mietsoll_neu n
      where n.mietverhaeltnis_id = s.mietverhaeltnis_id and n.monat = s.monat
    );
  get diagnostics v_d = row_count;

  return v_n + v_d;
end;
$$;

-- ---------------------------------------------------------------- Zuordnung

-- Kandidaten einer Runde auf die Verträge verteilen: anteilig nach Monatssoll,
-- Rundungsrest auf den Vertrag mit dem größten Soll.
create or replace function public.mietzahlungen_kandidaten_buchen(p_methode text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  insert into public.mietzahlungen (bankbuchung_id, mietverhaeltnis_id, buchungsdatum, betrag, methode)
  select
    x.bankbuchung_id,
    x.mietverhaeltnis_id,
    x.buchungsdatum,
    case
      when x.rn = 1 then x.gesamt - (sum(x.anteil) over (partition by x.bankbuchung_id) - x.anteil)
      else x.anteil
    end,
    p_methode
  from (
    select
      k.bankbuchung_id,
      k.mietverhaeltnis_id,
      e.buchungsdatum,
      e.betrag as gesamt,
      round(e.betrag * k.gewicht / sum(k.gewicht) over (partition by k.bankbuchung_id), 2) as anteil,
      row_number() over (partition by k.bankbuchung_id order by k.gewicht desc, k.mietverhaeltnis_id) as rn
    from (
      select distinct bankbuchung_id, mietverhaeltnis_id, gewicht from _mieten_kand
    ) k
    join public.bankbuchungen e on e.id = k.bankbuchung_id
  ) x
  on conflict (bankbuchung_id, mietverhaeltnis_id) do nothing;
  get diagnostics v_n = row_count;
  truncate _mieten_kand;
  return v_n;
end;
$$;

create or replace function public.mietzahlungen_zuordnen()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_iban integer := 0;
  v_zahler integer := 0;
  v_name integer := 0;
begin
  create temp table if not exists _mieten_kand (
    bankbuchung_id uuid, mietverhaeltnis_id uuid, gewicht numeric
  ) on commit drop;
  truncate _mieten_kand;

  -- Freie Eingänge und mögliche Verträge (gleiche Gesellschaft, Objekt des Kontos, Laufzeit)
  create temp table if not exists _mieten_paare (
    bankbuchung_id uuid, mietverhaeltnis_id uuid, gewicht numeric,
    gegenkonto_iban text, name_norm text, zweck_norm text, sammelzahler boolean,
    betrag numeric, vertrag_iban text, namensteile text[]
  ) on commit drop;
  truncate _mieten_paare;

  insert into _mieten_paare
  select
    e.bankbuchung_id, v.mietverhaeltnis_id,
    greatest(v.kaltmiete + v.nk_vorauszahlung, 0.01),
    e.gegenkonto_iban, e.name_norm, e.zweck_norm, e.sammelzahler,
    e.betrag, v.iban, v.namensteile
  from public.v_mieteingaenge e
  join public.v_mieten_vertraege v
    on v.gesellschaft_id = e.gesellschaft_id
   and (e.konto_objekt_id is null or v.objekt_id = e.konto_objekt_id)
   and e.buchungsdatum >= v.erfasst_ab - 10
   and (v.ende is null or e.buchungsdatum <= v.ende + 120)
  where not e.kaution
    and not exists (select 1 from public.mietzahlungen z where z.bankbuchung_id = e.bankbuchung_id)
    and not exists (select 1 from public.mieteingang_entscheidungen x where x.bankbuchung_id = e.bankbuchung_id)
    and not public.mieten_zahler_ignoriert(e.gegenkonto_iban, e.name_norm, e.sammelzahler);

  -- 1) IBAN: aus dem Mietvertrag oder gelernt
  insert into _mieten_kand
  select p.bankbuchung_id, p.mietverhaeltnis_id, p.gewicht
  from _mieten_paare p
  where not p.sammelzahler
    and p.gegenkonto_iban is not null
    and (p.vertrag_iban = p.gegenkonto_iban
         or exists (select 1 from public.mietzahler z
                    where z.mietverhaeltnis_id = p.mietverhaeltnis_id
                      and z.iban = p.gegenkonto_iban));
  v_iban := public.mietzahlungen_kandidaten_buchen('iban');

  -- Aus IBAN-Treffern den Zahlernamen lernen: so werden auch ältere Buchungen
  -- (Bankhistorie aus PDF, dort fehlt die IBAN) und spätere Namensbuchungen erkannt.
  insert into public.mietzahler (mietverhaeltnis_id, name_norm, quelle)
  select distinct z.mietverhaeltnis_id, e.name_norm, 'iban_treffer'
  from public.mietzahlungen z
  join public.v_mieteingaenge e on e.bankbuchung_id = z.bankbuchung_id
  where z.methode = 'iban'
    and not e.sammelzahler
    and length(e.name_norm) >= 4
  on conflict do nothing;

  delete from _mieten_paare p
  where exists (select 1 from public.mietzahlungen z where z.bankbuchung_id = p.bankbuchung_id);

  -- 2) Gelernter Zahlername (exakt, nach Normalisierung) oder bei Ämtern die gelernte
  --    Referenz im Verwendungszweck (z. B. Nummer der Bedarfsgemeinschaft)
  insert into _mieten_kand
  select p.bankbuchung_id, p.mietverhaeltnis_id, p.gewicht
  from _mieten_paare p
  where (not p.sammelzahler
         and length(p.name_norm) >= 4
         and exists (select 1 from public.mietzahler z
                     where z.mietverhaeltnis_id = p.mietverhaeltnis_id
                       and z.name_norm = p.name_norm))
     or (p.sammelzahler
         and exists (select 1 from public.mietzahler z
                     where z.mietverhaeltnis_id = p.mietverhaeltnis_id
                       and z.referenz is not null
                       and (' ' || p.zweck_norm || ' ') like ('% ' || z.referenz || ' %')));
  v_zahler := public.mietzahlungen_kandidaten_buchen('zahler');

  delete from _mieten_paare p
  where exists (select 1 from public.mietzahlungen z where z.bankbuchung_id = p.bankbuchung_id);

  -- 3) Mietername in Auftraggeber (zählt doppelt) oder Verwendungszweck.
  --    Nur eindeutige Treffer; Wohnung + Stellplatz mit derselben IBAN werden aufgeteilt.
  insert into _mieten_kand
  with punkte as (
    select
      p.*,
      (select coalesce(sum(
         case when not p.sammelzahler and (' ' || p.name_norm || ' ') like ('% ' || t || ' %') then 2 else 0 end
         + case when (' ' || p.zweck_norm || ' ') like ('% ' || t || ' %')
                then case when p.sammelzahler then 2 else 1 end else 0 end), 0)
       from unnest(p.namensteile) t) as score
    from _mieten_paare p
  ),
  beste as (
    select pk.*,
      max(pk.score) over (partition by pk.bankbuchung_id) as max_score
    from punkte pk
    where pk.score >= 2
  ),
  top as (
    select * from beste where score = max_score
  ),
  -- Mehrere gleich gute Treffer: passt genau ein Soll zum Betrag, gewinnt dieser
  betragstreffer as (
    select t.bankbuchung_id, count(*) as n
    from top t
    where abs(t.betrag - t.gewicht) <= greatest(1, t.gewicht * 0.01)
    group by t.bankbuchung_id
  ),
  auswahl as (
    select t.*
    from top t
    left join betragstreffer bt on bt.bankbuchung_id = t.bankbuchung_id
    where (select count(*) from top t2 where t2.bankbuchung_id = t.bankbuchung_id) = 1
       or (bt.n = 1 and abs(t.betrag - t.gewicht) <= greatest(1, t.gewicht * 0.01))
       or (coalesce(bt.n, 0) <> 1 and t.vertrag_iban is not null
           and (select count(distinct coalesce(t2.vertrag_iban, t2.mietverhaeltnis_id::text))
                from top t2 where t2.bankbuchung_id = t.bankbuchung_id) = 1)
  ),
  -- Verträge mit derselben IBAN (Wohnung + Stellplatz) gehören dazu
  erweitert as (
    select a.bankbuchung_id, a.mietverhaeltnis_id, a.gewicht, a.betrag from auswahl a
    union
    select a.bankbuchung_id, p.mietverhaeltnis_id, p.gewicht, a.betrag
    from auswahl a
    join _mieten_paare p
      on p.bankbuchung_id = a.bankbuchung_id
     and a.vertrag_iban is not null
     and p.vertrag_iban = a.vertrag_iban
  )
  select x.bankbuchung_id, x.mietverhaeltnis_id, x.gewicht
  from erweitert x
  -- Plausibel: höchstens sechs Monatsmieten in einer Zahlung
  where (select sum(x2.gewicht) from erweitert x2 where x2.bankbuchung_id = x.bankbuchung_id) * 6
        >= x.betrag;
  v_name := public.mietzahlungen_kandidaten_buchen('name');

  return jsonb_build_object('iban', v_iban, 'zahler', v_zahler, 'name', v_name);
end;
$$;

-- Alles aktualisieren: Soll fortschreiben und neue Eingänge zuordnen (Cron, Trigger, Knopf).
create or replace function public.mieten_aktualisieren()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soll integer;
  v_zuordnung jsonb;
begin
  if not public.jwt_darf_schreiben() then
    raise exception 'Keine Berechtigung';
  end if;
  v_soll := public.mietsoll_fortschreiben();
  v_zuordnung := public.mietzahlungen_zuordnen();
  return jsonb_build_object('soll_geaendert', v_soll) || v_zuordnung;
end;
$$;

-- Nach Stammdaten-Korrekturen: alle automatischen Zuordnungen neu rechnen.
-- Zuordnungen und Entscheidungen von Hand bleiben.
create or replace function public.mieten_neu_zuordnen()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.jwt_darf_schreiben() then
    raise exception 'Keine Berechtigung';
  end if;
  delete from public.mietzahlungen where methode <> 'manuell';
  delete from public.mietzahler where quelle = 'iban_treffer';
  return public.mieten_aktualisieren();
end;
$$;

-- Eingang von Hand einem oder mehreren Verträgen zuordnen. Mit p_merken werden IBAN
-- und Zahlername gelernt, und weitere Zahlungen dieses Zahlers werden sofort zugeordnet.
create or replace function public.mieteingang_zuordnen(
  p_bankbuchung_id uuid,
  p_mietverhaeltnis_ids uuid[],
  p_merken boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  if not public.jwt_darf_schreiben() then
    raise exception 'Keine Berechtigung';
  end if;
  if p_mietverhaeltnis_ids is null or cardinality(p_mietverhaeltnis_ids) = 0 then
    raise exception 'Kein Mietvertrag gewählt';
  end if;

  select b.id, b.betrag, b.gegenkonto_iban, b.auftraggeber_name, b.verwendungszweck
    into e
  from public.bankbuchungen b where b.id = p_bankbuchung_id;
  if e.id is null then
    raise exception 'Buchung nicht gefunden';
  end if;
  if e.betrag <= 0 then
    raise exception 'Nur Zahlungseingänge können Mieten sein';
  end if;

  delete from public.mietzahlungen where bankbuchung_id = p_bankbuchung_id;
  delete from public.mieteingang_entscheidungen where bankbuchung_id = p_bankbuchung_id;

  create temp table if not exists _mieten_kand (
    bankbuchung_id uuid, mietverhaeltnis_id uuid, gewicht numeric
  ) on commit drop;
  truncate _mieten_kand;
  insert into _mieten_kand
  select p_bankbuchung_id, m.id, greatest(m.kaltmiete + coalesce(m.nk_vorauszahlung, 0), 0.01)
  from public.mietverhaeltnisse m
  where m.id = any (p_mietverhaeltnis_ids);
  perform public.mietzahlungen_kandidaten_buchen('manuell');

  if p_merken and public.mieten_sammelzahler(e.auftraggeber_name) then
    insert into public.mietzahler (mietverhaeltnis_id, referenz, quelle)
    select m_id, r, 'manuell'
    from unnest(p_mietverhaeltnis_ids) m_id
    cross join unnest(public.mieten_referenzen(e.verwendungszweck)) r
    on conflict do nothing;
  elsif p_merken then
    insert into public.mietzahler (mietverhaeltnis_id, iban, name_norm, quelle)
    select m_id, nullif(upper(replace(e.gegenkonto_iban, ' ', '')), ''), null, 'manuell'
    from unnest(p_mietverhaeltnis_ids) m_id
    where nullif(e.gegenkonto_iban, '') is not null
    on conflict do nothing;
    insert into public.mietzahler (mietverhaeltnis_id, iban, name_norm, quelle)
    select m_id, null, public.mieten_text_norm(e.auftraggeber_name), 'manuell'
    from unnest(p_mietverhaeltnis_ids) m_id
    where length(public.mieten_text_norm(e.auftraggeber_name)) >= 4
    on conflict do nothing;
  end if;

  return public.mietzahlungen_zuordnen();
end;
$$;

-- Eingang ist keine Miete (art = keine_miete) oder soll von Hand geprüft werden (art = pruefen).
-- Mit p_zahler_merken gilt "keine Miete" auch für alle Eingänge dieses Zahlers (nicht für Ämter).
create or replace function public.mieteingang_entscheiden(
  p_bankbuchung_id uuid,
  p_art text,
  p_grund text default null,
  p_zahler_merken boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  if not public.jwt_darf_schreiben() then
    raise exception 'Keine Berechtigung';
  end if;
  if p_art not in ('keine_miete', 'pruefen') then
    raise exception 'Unbekannte Entscheidung';
  end if;
  delete from public.mietzahlungen where bankbuchung_id = p_bankbuchung_id;
  insert into public.mieteingang_entscheidungen (bankbuchung_id, art, grund)
  values (p_bankbuchung_id, p_art, p_grund)
  on conflict (bankbuchung_id) do update
    set art = excluded.art, grund = excluded.grund,
        created_at = now(), created_by = auth.uid();

  if p_art = 'keine_miete' and p_zahler_merken then
    select b.gegenkonto_iban, b.auftraggeber_name into e
    from public.bankbuchungen b where b.id = p_bankbuchung_id;
    if not public.mieten_sammelzahler(e.auftraggeber_name) then
      insert into public.mietzahler (mietverhaeltnis_id, iban, quelle)
      select null, upper(replace(e.gegenkonto_iban, ' ', '')), 'manuell'
      where nullif(e.gegenkonto_iban, '') is not null
      on conflict do nothing;
      insert into public.mietzahler (mietverhaeltnis_id, name_norm, quelle)
      select null, public.mieten_text_norm(e.auftraggeber_name), 'manuell'
      where length(public.mieten_text_norm(e.auftraggeber_name)) >= 4
      on conflict do nothing;
    end if;
  end if;
end;
$$;

-- Entscheidung zurücknehmen: der Eingang läuft wieder durch die Automatik.
create or replace function public.mieteingang_freigeben(p_bankbuchung_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.jwt_darf_schreiben() then
    raise exception 'Keine Berechtigung';
  end if;
  delete from public.mietzahler z
  using public.bankbuchungen b
  where b.id = p_bankbuchung_id
    and z.mietverhaeltnis_id is null
    and (z.iban = b.gegenkonto_iban or z.name_norm = public.mieten_text_norm(b.auftraggeber_name));
  delete from public.mieteingang_entscheidungen where bankbuchung_id = p_bankbuchung_id;
  delete from public.mietzahlungen where bankbuchung_id = p_bankbuchung_id;
  return public.mietzahlungen_zuordnen();
end;
$$;

-- ---------------------------------------------------------------- Mietkonto (Sichten)

-- Je Vertrag und Monat: Soll, bezahlt (älteste Miete zuerst getilgt), offen, Status.
create or replace view public.v_mietkonto_monate
with (security_invoker = true) as
with soll as (
  select
    s.mietverhaeltnis_id, s.monat, s.faellig_am, s.kaltmiete, s.nk_vorauszahlung,
    s.betrag as soll, s.quelle,
    sum(s.betrag) over (partition by s.mietverhaeltnis_id order by s.monat) as soll_kumuliert
  from public.mietsoll s
),
gezahlt as (
  select z.mietverhaeltnis_id, sum(z.betrag) as summe
  from public.mietzahlungen z
  group by z.mietverhaeltnis_id
),
basis as (
  select
    s.*,
    least(s.soll, greatest(0, coalesce(g.summe, 0) - (s.soll_kumuliert - s.soll))) as bezahlt,
    -- drei Tage Kulanz nach Fälligkeit für Banklaufzeit
    s.faellig_am + 3 as ueberfaellig_ab
  from soll s
  left join gezahlt g on g.mietverhaeltnis_id = s.mietverhaeltnis_id
)
select
  b.mietverhaeltnis_id,
  b.monat,
  b.faellig_am,
  b.ueberfaellig_ab,
  b.kaltmiete,
  b.nk_vorauszahlung,
  b.soll,
  b.bezahlt,
  b.soll - b.bezahlt as offen,
  b.quelle,
  case
    when b.soll - b.bezahlt < 0.01 then 'bezahlt'
    when public.mieten_heute() < b.ueberfaellig_ab then 'noch_nicht_faellig'
    when b.bezahlt > 0 then 'teilweise'
    else 'ueberfaellig'
  end as status
from basis b;

-- Je Vertrag: Kontostand, Rückstand, offene Monate, letzte Zahlung, Mahnstufe.
create or replace view public.v_mietkonten
with (security_invoker = true) as
with monate as (
  select
    m.mietverhaeltnis_id,
    sum(m.soll) filter (where m.ueberfaellig_ab <= public.mieten_heute()) as soll_faellig,
    sum(m.soll) as soll_gesamt,
    count(*) filter (where m.status in ('ueberfaellig', 'teilweise')) as offene_monate,
    min(m.monat) filter (where m.status in ('ueberfaellig', 'teilweise')) as aeltester_offener_monat,
    min(m.monat) as erster_monat,
    (array_agg(m.soll order by m.monat desc))[1] as monatssoll
  from public.v_mietkonto_monate m
  group by m.mietverhaeltnis_id
),
zahlungen as (
  select
    z.mietverhaeltnis_id,
    sum(z.betrag) as gezahlt,
    max(z.buchungsdatum) as letzte_zahlung_am,
    count(*) as anzahl_zahlungen
  from public.mietzahlungen z
  group by z.mietverhaeltnis_id
),
konto as (
  select
    v.mietverhaeltnis_id, v.mieter_name, v.iban, v.status as vertrag_status,
    v.beginn, v.ende, v.erfasst_ab,
    v.einheit_id, v.einheit_lage, v.nutzungsart,
    v.objekt_id, v.objekt_bezeichnung, v.gesellschaft_id,
    v.kaltmiete + v.nk_vorauszahlung as vertragsmiete,
    coalesce(mo.monatssoll, v.kaltmiete + v.nk_vorauszahlung) as monatssoll,
    coalesce(mo.soll_faellig, 0) as soll_faellig,
    coalesce(z.gezahlt, 0) as gezahlt,
    coalesce(mo.soll_faellig, 0) - coalesce(z.gezahlt, 0) as saldo,
    coalesce(mo.offene_monate, 0)::integer as offene_monate,
    mo.aeltester_offener_monat,
    mo.erster_monat,
    z.letzte_zahlung_am,
    (select sum(z2.betrag) from public.mietzahlungen z2
     where z2.mietverhaeltnis_id = v.mietverhaeltnis_id
       and z2.buchungsdatum = z.letzte_zahlung_am) as letzte_zahlung_betrag,
    coalesce(z.anzahl_zahlungen, 0)::integer as anzahl_zahlungen,
    (v.iban is not null
     or exists (select 1 from public.mietzahler mz where mz.mietverhaeltnis_id = v.mietverhaeltnis_id)
    ) as zahler_bekannt
  from public.v_mieten_vertraege v
  left join monate mo on mo.mietverhaeltnis_id = v.mietverhaeltnis_id
  left join zahlungen z on z.mietverhaeltnis_id = v.mietverhaeltnis_id
)
select
  k.*,
  greatest(k.saldo, 0) as rueckstand,
  case when k.monatssoll > 0 then round(greatest(k.saldo, 0) / k.monatssoll, 2) else 0 end
    as rueckstand_monatsmieten,
  case
    when k.saldo < 1 then 'ok'
    -- § 543 Abs. 2 Nr. 3 BGB: zwei Monatsmieten oder mehr als eine Monatsmiete über zwei Termine
    when k.monatssoll > 0
         and (k.saldo >= 2 * k.monatssoll or (k.offene_monate >= 2 and k.saldo > k.monatssoll))
      then 'kuendigung_pruefen'
    when k.monatssoll > 0 and (k.saldo >= k.monatssoll or k.offene_monate >= 2) then 'mahnen'
    else 'offen'
  end as stufe
from konto k;

-- Eingänge, die niemandem zugeordnet sind, für die Prüfliste der Mieten-Seite.
create or replace view public.v_mieteingaenge_offen
with (security_invoker = true) as
select
  e.bankbuchung_id, e.gesellschaft_id, e.konto_iban, e.konto_objekt_id,
  e.buchungsdatum, e.betrag, e.gegenkonto_iban, e.auftraggeber_name, e.verwendungszweck,
  e.sammelzahler, e.kaution,
  x.art as entscheidung, x.grund
from public.v_mieteingaenge e
left join public.mieteingang_entscheidungen x on x.bankbuchung_id = e.bankbuchung_id
where not exists (select 1 from public.mietzahlungen z where z.bankbuchung_id = e.bankbuchung_id)
  and coalesce(x.art, 'pruefen') = 'pruefen'
  and not public.mieten_zahler_ignoriert(e.gegenkonto_iban, e.name_norm, e.sammelzahler)
  -- nur Konten von Gesellschaften mit Mietverträgen, ab Beginn des Mietkontos
  and exists (
    select 1 from public.v_mieten_vertraege v
    where v.gesellschaft_id = e.gesellschaft_id
      and (e.konto_objekt_id is null or v.objekt_id = e.konto_objekt_id)
      and e.buchungsdatum >= v.erfasst_ab - 10
  );

-- ---------------------------------------------------------------- Automatik

-- Nach jedem EBICS-Import: neue Eingänge zuordnen. Fehler blockieren den Import nie.
create or replace function public.trg_bankbuchungen_mieten() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.mietzahlungen_zuordnen();
  exception when others then
    raise warning 'mietzahlungen_zuordnen fehlgeschlagen: %', sqlerrm;
  end;
  return null;
end $$;

-- Nach Änderungen an Verträgen, Mieterhöhungen oder Objekten: Soll neu fortschreiben.
create or replace function public.trg_mieten_stammdaten() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.mietsoll_fortschreiben();
    perform public.mietzahlungen_zuordnen();
  exception when others then
    raise warning 'Mietkonto fortschreiben fehlgeschlagen: %', sqlerrm;
  end;
  return null;
end $$;

-- Name sortiert nach bankbuchungen_darlehen_zuordnen: Darlehen werden zuerst erkannt.
drop trigger if exists bankbuchungen_mieten_zuordnen on public.bankbuchungen;
create trigger bankbuchungen_mieten_zuordnen after insert on public.bankbuchungen
for each statement execute function public.trg_bankbuchungen_mieten();

drop trigger if exists mietverhaeltnisse_mietkonto on public.mietverhaeltnisse;
create trigger mietverhaeltnisse_mietkonto after insert or update or delete on public.mietverhaeltnisse
for each statement execute function public.trg_mieten_stammdaten();

drop trigger if exists mieterhoehungen_mietkonto on public.mieterhoehungen;
create trigger mieterhoehungen_mietkonto after insert or update or delete on public.mieterhoehungen
for each statement execute function public.trg_mieten_stammdaten();

drop trigger if exists objekte_mietkonto on public.objekte;
create trigger objekte_mietkonto after update of mieten_ab on public.objekte
for each statement execute function public.trg_mieten_stammdaten();

-- ---------------------------------------------------------------- Rechte

alter table public.mietsoll enable row level security;
alter table public.mietzahler enable row level security;
alter table public.mietzahlungen enable row level security;
alter table public.mieteingang_entscheidungen enable row level security;

create policy mietsoll_select on public.mietsoll for select to authenticated using (true);
create policy mietsoll_write on public.mietsoll for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy mietzahler_select on public.mietzahler for select to authenticated using (true);
create policy mietzahler_write on public.mietzahler for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy mietzahlungen_select on public.mietzahlungen for select to authenticated using (true);
create policy mietzahlungen_write on public.mietzahlungen for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
create policy mieteingang_entscheidungen_select on public.mieteingang_entscheidungen
  for select to authenticated using (true);
create policy mieteingang_entscheidungen_write on public.mieteingang_entscheidungen
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

revoke all on public.v_mieten_vertraege, public.v_mieteingaenge, public.v_mietkonto_monate,
  public.v_mietkonten, public.v_mieteingaenge_offen from anon;
grant select on public.v_mieten_vertraege, public.v_mieteingaenge, public.v_mietkonto_monate,
  public.v_mietkonten, public.v_mieteingaenge_offen to authenticated;

revoke execute on function
  public.mietsoll_fortschreiben(),
  public.mietzahlungen_kandidaten_buchen(text),
  public.mietzahlungen_zuordnen(),
  public.trg_bankbuchungen_mieten(),
  public.trg_mieten_stammdaten()
from public, anon, authenticated;

revoke execute on function
  public.mieten_aktualisieren(),
  public.mieten_neu_zuordnen(),
  public.mieteingang_zuordnen(uuid, uuid[], boolean),
  public.mieteingang_entscheiden(uuid, text, text, boolean),
  public.mieteingang_freigeben(uuid)
from public, anon;
grant execute on function
  public.mieten_aktualisieren(),
  public.mieten_neu_zuordnen(),
  public.mieteingang_zuordnen(uuid, uuid[], boolean),
  public.mieteingang_entscheiden(uuid, text, text, boolean),
  public.mieteingang_freigeben(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------- Erster Lauf

select public.mietsoll_fortschreiben();
select public.mietzahlungen_zuordnen();
