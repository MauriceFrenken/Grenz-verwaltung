-- Investorendatenbank: bereinigte Investorenschicht über dem Salesforce-Cache.
-- Ein Investor = ein Salesforce-Account. Salesforce bleibt führend; hier liegen abgeleitete,
-- normalisierte Werte und die Prüfliste für Korrekturen (Rückschreiben nur nach Freigabe).
-- Schreiben nur serverseitig (service_role); Angemeldete lesen.

create table if not exists public.investoren (
  account_sf_id text primary key,
  name text not null,
  profil_sf_id text,
  hauptkontakt_sf_id text,
  -- Klassifizierung
  typ text,
  typ_quelle text check (typ_quelle in ('salesforce', 'regel', 'ki', 'radar', 'manuell')),
  status text not null default 'ruhend' check (status in ('aktiv', 'ruhend', 'kein_interesse', 'gesperrt', 'erloschen')),
  status_grund text,
  prioritaet text check (prioritaet in ('Tier 1', 'Tier 2', 'Tier 3')),
  herkunft text not null check (herkunft in ('ankaufsprofil', 'kampagne', 'deal', 'radar', 'liste')),
  -- Normalisierte Ankaufskriterien (Salesforce, überlagert von freigegebenen Vorschlägen)
  nutzungen text[] not null default '{}',
  objektklassen text[] not null default '{}',
  volumen_min numeric,
  volumen_max numeric,
  faktor_max numeric,
  einheiten_min numeric,
  baujahr_ab numeric,
  baujahr_bis numeric,
  regionen text[] not null default '{}',
  regionsebene text check (regionsebene in ('bundesweit', 'bundesland', 'regierungsbezirk', 'kreis', 'gemeinde')),
  regionen_kurz text[] not null default '{}',
  bemerkung text,
  kriterien_herkunft jsonb not null default '{}'::jsonb,
  -- Aktivität
  letzter_kontakt_am timestamptz,
  aktivitaeten_12m integer not null default 0,
  deals_anzahl integer not null default 0,
  deals_gewonnen integer not null default 0,
  kampagnen_anzahl integer not null default 0,
  radar_anzahl integer not null default 0,
  letzte_marktaktivitaet_am date,
  kontakte_anzahl integer not null default 0,
  kontakte_mit_email integer not null default 0,
  aufgebaut_am timestamptz not null default now()
);
comment on table public.investoren is 'Bereinigte Investorenliste (ein Account je Zeile), aus dem Salesforce-Cache, Aktivitäten und Markt-Radar abgeleitet. Wird bei jedem Aufbau neu berechnet.';

create index if not exists investoren_status_idx on public.investoren (status);
create index if not exists investoren_typ_idx on public.investoren (typ);

create table if not exists public.investor_vorschlaege (
  id uuid primary key default gen_random_uuid(),
  account_sf_id text,
  profil_sf_id text,
  art text not null check (art in ('feld', 'dublette', 'neuer_investor', 'neues_profil')),
  feld text,
  alter_wert jsonb,
  neuer_wert jsonb,
  quelle text not null check (quelle in ('regel', 'ki', 'radar', 'kampagne', 'deal', 'liste', 'manuell')),
  beleg text,
  ziel text not null default 'salesforce' check (ziel in ('app', 'salesforce')),
  sf_objekt text,
  sf_feld text,
  status text not null default 'offen' check (status in ('offen', 'uebernommen', 'abgelehnt', 'zurueckgeschrieben')),
  schluessel text not null,
  entschieden_von uuid references public.profiles(id) on delete set null,
  entschieden_am timestamptz,
  zurueckgeschrieben_am timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.investor_vorschlaege is 'Prüfliste: Korrekturen und Ergänzungen der Investorendaten. Nach Salesforce geht nur, was übernommen wurde.';
comment on column public.investor_vorschlaege.schluessel is 'Fachlicher Schlüssel (z. B. Profil + Feld + Wert), damit ein Vorschlag nicht doppelt entsteht und abgelehnte nicht wiederkommen.';

create unique index if not exists investor_vorschlaege_schluessel on public.investor_vorschlaege (schluessel);
create index if not exists investor_vorschlaege_status_idx on public.investor_vorschlaege (status, created_at desc);
create index if not exists investor_vorschlaege_account_idx on public.investor_vorschlaege (account_sf_id);
create index if not exists investor_vorschlaege_entschieden_von_idx on public.investor_vorschlaege (entschieden_von);

-- Externe Listen (7Plus, Leadliste, Suchkunden): normalisiert, mit Salesforce-Treffer und Passung.
create table if not exists public.investor_quellen (
  schluessel text primary key,
  quelle text not null check (quelle in ('7plus', 'leadliste', 'suchkunden')),
  firma text,
  person text,
  emails text[] not null default '{}',
  telefon text,
  adresse text,
  ort text,
  webseite text,
  quelle_link text,
  typ text,
  nutzungen text[] not null default '{}',
  objektklassen text[] not null default '{}',
  zustand text[] not null default '{}',
  struktur text[] not null default '{}',
  volumen_min numeric,
  volumen_max numeric,
  einheiten_min numeric,
  einheiten_max numeric,
  regionen text[] not null default '{}',
  nrw_bezug text check (nrw_bezug in ('region', 'sitz')),
  objekte_interesse text[] not null default '{}',
  nicht_anlegen boolean not null default false,
  passung smallint not null default 0 check (passung between 0 and 100),
  sf_treffer_art text check (sf_treffer_art in ('email', 'name', 'domain', 'angelegt')),
  sf_kontakt_sf_id text,
  sf_account_sf_id text,
  bearbeitung text not null default 'offen' check (bearbeitung in ('offen', 'angelegt', 'verworfen')),
  bearbeitet_von uuid references public.profiles(id) on delete set null,
  bearbeitet_am timestamptz,
  roh jsonb not null default '{}'::jsonb,
  importiert_am timestamptz not null default now()
);
comment on table public.investor_quellen is 'Investoren und Suchkunden aus externen Listen. Neue Einträge werden nach Passung zu Grenz vorgeschlagen und erst nach Freigabe in Salesforce angelegt. Enthält Kontaktdaten: nur für Angemeldete lesbar.';

create index if not exists investor_quellen_account_idx on public.investor_quellen (sf_account_sf_id);
create index if not exists investor_quellen_liste_idx on public.investor_quellen (bearbeitung, passung desc);
create index if not exists investor_quellen_bearbeitet_von_idx on public.investor_quellen (bearbeitet_von);

-- Prüfung je Firma (Investor oder Listeneintrag): existiert sie noch, Insolvenz, aktuelles Ankaufsprofil.
-- Schlüssel: 'acc:<Account-Id>' oder 'quelle:<investor_quellen.schluessel>'.
create table if not exists public.investor_pruefungen (
  schluessel text primary key,
  firma text not null,
  status text not null check (status in ('aktiv', 'insolvenz', 'liquidation', 'geloescht', 'unklar')),
  begruendung text,
  quelle_url text,
  webseite text,
  ankaufsprofil_url text,
  ankaufsprofil_kurz text,
  aktiv_2026 boolean,
  letzte_aktivitaet text,
  lusha jsonb,
  geprueft_am timestamptz not null default now()
);
comment on table public.investor_pruefungen is 'KI-Websuche und Lusha je Firma: Existenz, Insolvenz/Liquidation/Löschung mit Quelle, Ankaufsprofil, Aktivität 2025/2026.';
create index if not exists investor_pruefungen_status_idx on public.investor_pruefungen (status);

-- Nächste zu prüfende Firmen: Salesforce-Investoren zuerst (aktive vorn), dann Listen nach Passung.
-- Geprüft wird höchstens alle 180 Tage.
create or replace function public.investor_pruefung_kandidaten(anzahl integer)
returns table (schluessel text, firma text, webseite text, ort text)
language sql stable security invoker set search_path = public as $$
  with kandidaten as (
    select 'acc:' || i.account_sf_id as schluessel, i.name as firma,
           nullif(k.sf_daten->>'Website', '') as webseite, k.ort,
           case i.status when 'aktiv' then 0 when 'ruhend' then 1 else 2 end as rang, 100 as passung
      from investoren i
      left join sf_kontakte k on k.sf_id = i.account_sf_id
     where i.typ is distinct from 'Privat'
    union all
    (select distinct on (q.firma) 'quelle:' || q.schluessel, q.firma, q.webseite, q.ort, 3, q.passung
      from investor_quellen q
     where q.firma is not null and not q.nicht_anlegen and q.bearbeitung = 'offen'
       and q.sf_account_sf_id is null and q.quelle <> 'suchkunden'
     order by q.firma, q.passung desc)
  )
  select k.schluessel, k.firma, k.webseite, k.ort
    from kandidaten k
    left join investor_pruefungen p on p.schluessel = k.schluessel
   where p.schluessel is null or p.geprueft_am < now() - interval '180 days'
   order by k.rang, k.passung desc, k.firma
   limit anzahl;
$$;
revoke execute on function public.investor_pruefung_kandidaten(integer) from public, anon, authenticated;

alter table public.markt_radar_meldungen add column if not exists investor_account_sf_id text;
create index if not exists markt_radar_meldungen_investor_idx on public.markt_radar_meldungen (investor_account_sf_id);

-- Zeitachse je Investor: Salesforce-Aktivitäten, Deals, Kampagnen, Radar.
create or replace view public.investor_ereignisse
with (security_invoker = true) as
  select coalesce(k.account_sf_id, a.what_sf_id) as account_sf_id,
         a.datum as am,
         'aktivitaet'::text as quelle,
         a.art as art,
         a.betreff as titel,
         a.status as detail,
         a.sf_id as ref_id
    from public.sf_aktivitaeten a
    left join public.sf_kontakte k on k.sf_id = a.who_sf_id
   where coalesce(k.account_sf_id, a.what_sf_id) like '001%'
  union all
  select d.account_sf_id, coalesce(d.abschluss_am::timestamptz, d.sf_geaendert_am), 'deal', d.phase, d.name,
         d.mandat_sf_id, d.sf_id
    from public.sf_deals d
   where d.account_sf_id is not null
  union all
  select k.account_sf_id, coalesce(m.sf_geaendert_am, m.abgerufen_am), 'kampagne', m.status, c.name,
         m.kampagne_sf_id, m.sf_id
    from public.sf_kampagnen_mitglieder m
    join public.sf_kontakte k on k.sf_id = m.kontakt_sf_id
    left join public.sf_kampagnen c on c.sf_id = m.kampagne_sf_id
   where k.account_sf_id is not null
  union all
  select r.investor_account_sf_id, coalesce(r.ereignis_am::timestamptz, r.created_at), 'radar', r.akteur_typ,
         r.ereignis, r.quelle_url, r.id::text
    from public.markt_radar_meldungen r
   where r.investor_account_sf_id is not null;
comment on view public.investor_ereignisse is 'Zeitachse je Investor-Account aus Aktivitäten, Deals, Kampagnen und Markt-Radar.';

alter table public.investoren enable row level security;
alter table public.investor_vorschlaege enable row level security;
alter table public.investor_quellen enable row level security;
alter table public.investor_pruefungen enable row level security;

drop policy if exists investor_pruefungen_select on public.investor_pruefungen;
create policy investor_pruefungen_select on public.investor_pruefungen for select to authenticated using (true);

drop policy if exists investor_quellen_select on public.investor_quellen;
create policy investor_quellen_select on public.investor_quellen for select to authenticated using (true);

drop policy if exists investoren_select on public.investoren;
create policy investoren_select on public.investoren for select to authenticated using (true);

drop policy if exists investor_vorschlaege_select on public.investor_vorschlaege;
create policy investor_vorschlaege_select on public.investor_vorschlaege for select to authenticated using (true);

grant select on public.investor_ereignisse to authenticated;
