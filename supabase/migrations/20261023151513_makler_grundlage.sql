create or replace function public.zahl_oder_null(t text)
returns numeric language sql immutable set search_path = public as $$
  select case when t ~ '^\s*-?[0-9]+([.,][0-9]+)?\s*$' then replace(trim(t), ',', '.')::numeric end
$$;

create table public.sf_sync_stand (
  sf_objekt text primary key,
  letzter_abruf_am timestamptz,
  hoechster_systemmodstamp timestamptz,
  anzahl integer,
  letzter_fehler text,
  updated_at timestamptz not null default now()
);
comment on table public.sf_sync_stand is 'Abrufstand je Salesforce-Objekt (inkrementell über SystemModstamp).';

create table public.sf_mandate (
  sf_id text primary key,
  name text not null,
  status text,
  art text,
  objekt_id text references public.objekte(id) on delete set null,
  real_estate_sf_id text,
  eigentuemer_account_sf_id text,
  eigentuemer_kontakt_sf_id text,
  verantwortlich_sf_user_id text,
  angebotspreis numeric,
  provision_prozent numeric,
  beauftragt_am date,
  sf_daten jsonb not null default '{}'::jsonb,
  sf_geaendert_am timestamptz,
  abgerufen_am timestamptz not null default now()
);
comment on table public.sf_mandate is 'Cache von Mandate__c. Nur lesen; Änderungen über die Salesforce-API.';

create table public.sf_kontakte (
  sf_id text primary key,
  sf_typ text not null check (sf_typ in ('Contact', 'Account', 'Lead')),
  name text not null,
  firma text,
  account_sf_id text,
  email text,
  telefon text,
  mobil text,
  ort text,
  owner_sf_user_id text,
  sf_daten jsonb not null default '{}'::jsonb,
  sf_geaendert_am timestamptz,
  abgerufen_am timestamptz not null default now()
);
comment on table public.sf_kontakte is 'Cache von Contact/Account/Lead (nur Grenz-relevante Datensätze).';

create table public.sf_ankaufsprofile (
  sf_id text primary key,
  name text,
  kontakt_sf_id text,
  account_sf_id text,
  aktiv boolean,
  assetklassen text[],
  regionen text[],
  volumen_min numeric,
  volumen_max numeric,
  faktor_max numeric,
  rendite_min numeric,
  sf_daten jsonb not null default '{}'::jsonb,
  sf_geaendert_am timestamptz,
  abgerufen_am timestamptz not null default now()
);
comment on table public.sf_ankaufsprofile is 'Cache von Investorprofile__c inkl. Search_Location__c (regionen).';

create table public.sf_aktivitaeten (
  sf_id text primary key,
  sf_typ text not null check (sf_typ in ('Task', 'Event', 'EmailMessage')),
  art text,
  betreff text,
  datum timestamptz,
  status text,
  who_sf_id text,
  what_sf_id text,
  mandat_sf_id text,
  kampagne_sf_id text,
  owner_sf_user_id text,
  quelle text not null default 'salesforce' check (quelle in ('salesforce', 'postfach_sync', 'app')),
  sf_daten jsonb not null default '{}'::jsonb,
  sf_geaendert_am timestamptz,
  abgerufen_am timestamptz not null default now()
);
comment on table public.sf_aktivitaeten is 'Cache von Task/Event/EmailMessage für KPIs und Mandats-Cockpit.';

create table public.sf_kampagnen (
  sf_id text primary key,
  name text not null,
  typ text,
  status text,
  mandat_sf_id text,
  start_am date,
  ende_am date,
  anzahl_mitglieder integer,
  anzahl_antworten integer,
  owner_sf_user_id text,
  sf_daten jsonb not null default '{}'::jsonb,
  sf_geaendert_am timestamptz,
  abgerufen_am timestamptz not null default now()
);

create table public.sf_kampagnen_mitglieder (
  sf_id text primary key,
  kampagne_sf_id text not null,
  kontakt_sf_id text,
  status text,
  geantwortet boolean,
  erstmals_geantwortet_am date,
  sf_daten jsonb not null default '{}'::jsonb,
  sf_geaendert_am timestamptz,
  abgerufen_am timestamptz not null default now()
);

create table public.sf_deals (
  sf_id text primary key,
  name text not null,
  phase text,
  betrag numeric,
  abschluss_am date,
  record_type text,
  mandat_sf_id text,
  account_sf_id text,
  kontakt_sf_id text,
  owner_sf_user_id text,
  sf_daten jsonb not null default '{}'::jsonb,
  sf_geaendert_am timestamptz,
  abgerufen_am timestamptz not null default now()
);
comment on table public.sf_deals is 'Cache von Opportunity (Record Type Real Estate Broker).';

create index on public.sf_mandate (objekt_id);
create index on public.sf_mandate (status);
create index on public.sf_kontakte (account_sf_id);
create index on public.sf_kontakte (lower(email));
create index on public.sf_ankaufsprofile (kontakt_sf_id);
create index on public.sf_aktivitaeten (mandat_sf_id);
create index on public.sf_aktivitaeten (who_sf_id);
create index on public.sf_aktivitaeten (datum);
create index on public.sf_kampagnen (mandat_sf_id);
create index on public.sf_kampagnen_mitglieder (kampagne_sf_id);
create index on public.sf_kampagnen_mitglieder (kontakt_sf_id);
create index on public.sf_deals (mandat_sf_id);

create table public.recherche_pool (
  id uuid primary key default gen_random_uuid(),
  quelle text not null,
  quelle_ref text,
  name text not null,
  firma text,
  email text,
  telefon text,
  ort text,
  profil jsonb not null default '{}'::jsonb,
  sf_id text unique,
  uebernommen_am timestamptz,
  uebernommen_von uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.recherche_pool is 'Kontakte aus 7Plus/immodeal/Listen, die nie kontaktiert wurden. Kein CRM: bei Erstkontakt nach Salesforce übernehmen, dann sf_id setzen.';
create index on public.recherche_pool (lower(email));
create index on public.recherche_pool (quelle);

create table public.design_vorlagen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  typ text not null check (typ in ('allgemein', 'expose', 'teaser', 'pitch', 'eigentuemer_report', 'bewertung')),
  ist_standard boolean not null default false,
  design jsonb not null default '{}'::jsonb,
  abschnitte jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  aktiv boolean not null default true,
  erstellt_von uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.design_vorlagen.design is 'Farben, Schriften, Logo-Pfad (Storage), Fußzeile, Seitenformat.';
comment on column public.design_vorlagen.abschnitte is 'Standard-Abschnitte mit Reihenfolge und Sichtbarkeit; je Dokument überschreibbar.';
create unique index design_vorlagen_ein_standard_je_typ on public.design_vorlagen (typ) where ist_standard;

create table public.dokument_entwuerfe (
  id uuid primary key default gen_random_uuid(),
  typ text not null check (typ in ('expose', 'teaser', 'pitch')),
  titel text not null,
  mandat_sf_id text,
  objekt_id text references public.objekte(id) on delete set null,
  vorlage_id uuid references public.design_vorlagen(id) on delete set null,
  inhalt jsonb not null default '{}'::jsonb,
  quellen jsonb not null default '[]'::jsonb,
  status text not null default 'entwurf' check (status in ('entwurf', 'in_pruefung', 'freigegeben', 'versendet', 'archiviert')),
  version integer not null default 1,
  datei_pfad text,
  freigegeben_von uuid references public.profiles(id) on delete set null,
  freigegeben_am timestamptz,
  erstellt_von uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.dokument_entwuerfe.quellen is 'Belege je Aussage (Dokument, Seite, Zitat), damit KI-Texte prüfbar bleiben.';
create index on public.dokument_entwuerfe (mandat_sf_id);

create table public.eigentuemer_reports (
  id uuid primary key default gen_random_uuid(),
  mandat_sf_id text not null,
  objekt_id text references public.objekte(id) on delete set null,
  zeitraum_von date not null,
  zeitraum_bis date not null,
  vorlage_id uuid references public.design_vorlagen(id) on delete set null,
  konfiguration jsonb not null default '{}'::jsonb,
  kennzahlen jsonb not null default '{}'::jsonb,
  kommentar text,
  status text not null default 'entwurf' check (status in ('entwurf', 'freigegeben', 'versendet')),
  versendet_am timestamptz,
  versendet_an text,
  datei_pfad text,
  erstellt_von uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (zeitraum_von <= zeitraum_bis)
);
comment on column public.eigentuemer_reports.kennzahlen is 'Eingefrorener Stand der Zahlen zum Erstellzeitpunkt (Anfragen, Besichtigungen, Angebote, Kampagnen).';
create index on public.eigentuemer_reports (mandat_sf_id);

create table public.bewertungen (
  id uuid primary key default gen_random_uuid(),
  objekt_id text references public.objekte(id) on delete set null,
  mandat_sf_id text,
  expose_id uuid references public.postfach_exposes(id) on delete set null,
  bezeichnung text not null,
  strasse text,
  plz text,
  ort text,
  objektart text,
  methode text not null check (methode in ('vergleich', 'faktor', 'ertragswert_vereinfacht', 'kombiniert')),
  eingaben jsonb not null default '{}'::jsonb,
  wert_min numeric,
  wert_mittel numeric,
  wert_max numeric,
  faktor numeric,
  preis_m2 numeric,
  vergleichsobjekte jsonb not null default '[]'::jsonb,
  begruendung text,
  status text not null default 'entwurf' check (status in ('entwurf', 'freigegeben', 'verworfen')),
  erstellt_von uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (wert_min is null or wert_mittel is null or wert_min <= wert_mittel),
  check (wert_max is null or wert_mittel is null or wert_mittel <= wert_max)
);
comment on table public.bewertungen is 'Indikative Bewertung, kein Gutachten. Vergleichsobjekte als Snapshot.';

create view public.v_vergleichsdaten with (security_invoker = true) as
select
  'expose'::text as quelle,
  e.id::text as quelle_id,
  'angebot'::text as preisart,
  e.eingegangen_am::date as stichtag,
  e.felder -> 'objektadresse' ->> 'value' as adresse,
  e.felder -> 'plz' ->> 'value' as plz,
  e.felder -> 'stadt' ->> 'value' as ort,
  e.felder -> 'objektart' ->> 'value' as objektart,
  public.zahl_oder_null(e.felder -> 'baujahr' ->> 'value') as baujahr,
  public.zahl_oder_null(e.felder -> 'anzahlWohnungen' ->> 'value') as einheiten,
  public.zahl_oder_null(e.felder -> 'wohnflaeche' ->> 'value') as wohnflaeche_m2,
  public.zahl_oder_null(e.felder -> 'gewerbeflaeche' ->> 'value') as gewerbeflaeche_m2,
  public.zahl_oder_null(e.felder -> 'mietflaecheGesamt' ->> 'value') as mietflaeche_m2,
  public.zahl_oder_null(e.felder -> 'angebotspreis' ->> 'value') as kaufpreis,
  public.zahl_oder_null(e.felder -> 'jahresnettokaltmiete' ->> 'value') as jahresnettokaltmiete,
  round(public.zahl_oder_null(e.felder -> 'angebotspreis' ->> 'value')
        / nullif(public.zahl_oder_null(e.felder -> 'jahresnettokaltmiete' ->> 'value'), 0), 2) as faktor,
  round(public.zahl_oder_null(e.felder -> 'angebotspreis' ->> 'value')
        / nullif(public.zahl_oder_null(e.felder -> 'mietflaecheGesamt' ->> 'value'), 0), 0) as preis_m2,
  e.geo_lat,
  e.geo_lng
from public.postfach_exposes e
where e.felder is not null and e.status in ('analysiert', 'exportiert')
union all
select
  'objekt', o.id, 'kauf', o.kaufdatum, o.strasse, o.plz, o.ort, null, null, null,
  o.wohnflaeche_m2, null, o.wohnflaeche_m2, o.kaufpreis, null, null,
  round(o.kaufpreis / nullif(o.wohnflaeche_m2, 0), 0), null, null
from public.objekte o
where o.kaufpreis is not null;
comment on view public.v_vergleichsdaten is 'Vergleichsdaten für die indikative Bewertung. Angebotspreise sind Forderungen, keine Kaufpreise.';

create table public.unternehmenszahlen (
  id uuid primary key default gen_random_uuid(),
  gesellschaft_id text not null references public.gesellschaften(id) on delete cascade,
  quelle text not null check (quelle in ('bwa', 'jahresabschluss', 'datev', 'manuell')),
  periode_von date not null,
  periode_bis date not null,
  kennzahl text not null,
  betrag numeric not null,
  dokument_ref text,
  bemerkung text,
  created_at timestamptz not null default now(),
  unique (gesellschaft_id, quelle, periode_von, periode_bis, kennzahl),
  check (periode_von <= periode_bis)
);

insert into public.unternehmenszahlen (gesellschaft_id, quelle, periode_von, periode_bis, kennzahl, betrag, dokument_ref) values
  ('GC', 'jahresabschluss', '2025-01-01', '2025-12-31', 'umsatz', 119663.87, 'Jahresabschluss 2025'),
  ('GC', 'jahresabschluss', '2025-01-01', '2025-12-31', 'jahresueberschuss', 52909, 'Jahresabschluss 2025'),
  ('GC', 'jahresabschluss', '2025-12-31', '2025-12-31', 'bankguthaben', 189341.29, 'Jahresabschluss 2025'),
  ('GC', 'bwa', '2026-01-01', '2026-09-30', 'umsatz', 124579.83, 'BWA Q3 2026'),
  ('GC', 'bwa', '2026-01-01', '2026-09-30', 'ergebnis', 63787.81, 'BWA Q3 2026')
on conflict do nothing;

create table public.postfach_verbindungen (
  id uuid primary key default gen_random_uuid(),
  benutzer_id uuid not null references public.profiles(id) on delete cascade,
  postfach text not null,
  provider text not null default 'microsoft365' check (provider in ('microsoft365')),
  status text not null default 'ausstehend' check (status in ('ausstehend', 'verbunden', 'pausiert', 'fehler', 'getrennt')),
  scopes text,
  graph_user_id text,
  token_secret_id uuid,
  delta_link text,
  sf_user_id text,
  letzte_sync_am timestamptz,
  letzter_fehler text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (benutzer_id, postfach)
);
comment on column public.postfach_verbindungen.token_secret_id is 'Verweis auf vault.secrets. Tokens nie im Klartext in Tabellen.';

create table public.postfach_sync_nachrichten (
  id uuid primary key default gen_random_uuid(),
  verbindung_id uuid not null references public.postfach_verbindungen(id) on delete cascade,
  internet_message_id text not null,
  graph_nachricht_id text,
  richtung text not null check (richtung in ('eingehend', 'ausgehend')),
  betreff text,
  von text,
  an text[],
  gesendet_am timestamptz,
  who_sf_ids text[],
  what_sf_id text,
  sf_email_message_id text,
  sf_task_id text,
  status text not null default 'neu' check (status in ('neu', 'zugeordnet', 'ohne_treffer', 'privat', 'in_salesforce', 'fehler')),
  fehler text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (verbindung_id, internet_message_id)
);
comment on table public.postfach_sync_nachrichten is 'Nur Metadaten und Zuordnung. Der Inhalt liegt in Salesforce (EmailMessage), nicht hier.';
create index on public.postfach_sync_nachrichten (status);

create trigger set_updated_at before update on public.sf_sync_stand for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.recherche_pool for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.design_vorlagen for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.dokument_entwuerfe for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.eigentuemer_reports for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.bewertungen for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.postfach_verbindungen for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.postfach_sync_nachrichten for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['sf_sync_stand','sf_mandate','sf_kontakte','sf_ankaufsprofile','sf_aktivitaeten',
                           'sf_kampagnen','sf_kampagnen_mitglieder','sf_deals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
  end loop;
  foreach t in array array['recherche_pool','design_vorlagen','dokument_entwuerfe','eigentuemer_reports',
                           'bewertungen','unternehmenszahlen'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben())', t || '_write', t);
  end loop;
end $$;

alter table public.postfach_verbindungen enable row level security;
create policy postfach_verbindungen_eigene on public.postfach_verbindungen
  for select to authenticated using (benutzer_id = auth.uid());
revoke all on public.postfach_verbindungen from anon, authenticated;
grant select (id, benutzer_id, postfach, provider, status, scopes, letzte_sync_am, letzter_fehler, created_at, updated_at)
  on public.postfach_verbindungen to authenticated;
revoke all on public.postfach_sync_nachrichten from anon;
revoke insert, update, delete on public.postfach_sync_nachrichten from authenticated;

alter table public.postfach_sync_nachrichten enable row level security;
create policy postfach_sync_nachrichten_eigene on public.postfach_sync_nachrichten
  for select to authenticated using (
    exists (select 1 from public.postfach_verbindungen v where v.id = verbindung_id and v.benutzer_id = auth.uid())
  );
