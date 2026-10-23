-- Grenz & Co. Verwaltung — Basis-Schema für ein leeres Supabase-Projekt.
--
-- Bereiche: Benutzer & Rollen, Gesellschaft, Integrationen, Exposé-Postfach,
-- Dokument-Postfach (Ablage + Rechnungsfreigabe), EBICS-Bankabruf.
-- Server-Funktionen greifen mit der Service Role zu; der Browser liest nur
-- Profile, Rollen, Gesellschaften und Benutzer-Zuordnungen.

-- ============================================================ Hilfsfunktionen

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Rolle aus dem JWT (app_metadata.rolle), Standard „leser“.
create or replace function public.jwt_rolle()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'rolle', 'leser');
$$;

-- Darf Benutzer und Zuordnungen verwalten.
create or replace function public.jwt_darf_verwalten()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.jwt_rolle() in ('op_admin', 'administrator', 'manager');
$$;

-- Neue Objekte sind in Supabase nicht automatisch für die Data-API-Rollen
-- freigegeben — Policies rufen diese Funktionen als angemeldeter Benutzer auf.
grant execute on function public.jwt_rolle(), public.jwt_darf_verwalten()
  to authenticated, service_role;

-- ============================================================ Rollen

create type public.gesellschaft_zuweisung as enum ('alle', 'mehrere', 'einzeln');

create table public.rollen (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,48}$'),
  bezeichnung text not null,
  beschreibung text not null default '',
  rang numeric not null,
  ist_system boolean not null default false,
  gesellschaft_zuweisung public.gesellschaft_zuweisung not null default 'alle',
  erstellt_von uuid references auth.users (id),
  erstellt_am timestamptz not null default now()
);

create index rollen_rang_idx on public.rollen (rang);

insert into public.rollen (id, bezeichnung, beschreibung, rang, ist_system, gesellschaft_zuweisung)
values
  ('administrator', 'Administrator', 'Vollzugriff auf alle Gesellschaften und Konfiguration.', 1, true, 'alle'),
  ('manager', 'Manager', 'Führungsverantwortung mit Zugriff auf alle Bereiche.', 2, true, 'alle'),
  ('mitarbeiter', 'Mitarbeiter', 'Operativer Zugriff auf zugewiesene Aufgaben und Gesellschaften.', 3, true, 'alle'),
  ('leser', 'Leser', 'Nur-Lesen-Zugriff auf zugewiesene Gesellschaften.', 4, true, 'einzeln');

alter table public.rollen enable row level security;

create policy rollen_select on public.rollen
  for select to authenticated using (true);

-- ============================================================ Profile

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  initialen text not null default '–',
  rolle text not null default 'leser',
  stellenbezeichnung text not null default '',
  alle_gesellschaften boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (email);
create index profiles_rolle_idx on public.profiles (rolle);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy profiles_select_verwaltung on public.profiles
  for select to authenticated using (public.jwt_darf_verwalten());

-- ============================================================ Gesellschaften

create table public.gesellschaften (
  id text primary key check (id ~ '^[A-Za-z][A-Za-z0-9_-]{1,48}$'),
  name text not null check (length(btrim(name)) > 0),
  kuerzel text not null check (length(btrim(kuerzel)) > 0),
  -- Upload-Adresse für Eingangsrechnungen (Rechnungsfreigabe → „An DATEV“)
  datev_postfach text,
  datev_postfach_bezeichnung text,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger gesellschaften_set_updated_at
  before update on public.gesellschaften
  for each row execute function public.set_updated_at();

-- Die Gesellschaft der App; ID passt zu GRENZ_GESELLSCHAFT_ID (src/lib/grenz.ts).
insert into public.gesellschaften (id, name, kuerzel)
values ('GC', 'Grenz & Co.', 'GC');

alter table public.gesellschaften enable row level security;

create policy gesellschaften_select on public.gesellschaften
  for select to authenticated using (true);

create table public.benutzer_gesellschaften (
  benutzer_id uuid not null references public.profiles (id) on delete cascade,
  gesellschaft_id text not null
    references public.gesellschaften (id) on update cascade on delete cascade,
  primary key (benutzer_id, gesellschaft_id)
);

create index benutzer_gesellschaften_gesellschaft_idx
  on public.benutzer_gesellschaften (gesellschaft_id);

alter table public.benutzer_gesellschaften enable row level security;

create policy benutzer_gesellschaften_select on public.benutzer_gesellschaften
  for select to authenticated
  using (auth.uid() = benutzer_id or public.jwt_darf_verwalten());

create policy benutzer_gesellschaften_write on public.benutzer_gesellschaften
  for all to authenticated
  using (public.jwt_darf_verwalten())
  with check (public.jwt_darf_verwalten());

-- ============================================================ Integrationen

create table public.app_integrationen (
  id text primary key,
  status text not null default 'getrennt'
    check (status in ('verbunden', 'getrennt', 'fehler')),
  konto_email text,
  tenant_id text,
  graph_user_id text,
  scopes text,
  access_token text,
  refresh_token text,
  token_laeuft_ab_am timestamptz,
  verbunden_am timestamptz,
  verbunden_von uuid references public.profiles (id) on delete set null,
  letzte_pruefung_am timestamptz,
  letzter_fehler text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_integrationen (id, status) values ('microsoft365', 'getrennt');

create trigger app_integrationen_set_updated_at
  before update on public.app_integrationen
  for each row execute function public.set_updated_at();

alter table public.app_integrationen enable row level security;

-- ============================================================ Exposé-Postfach

create table public.postfach_exposes (
  id uuid primary key default gen_random_uuid(),
  postfach text not null,
  graph_nachricht_id text not null,
  internet_message_id text,
  betreff text,
  absender_name text,
  absender_mail text,
  eingegangen_am timestamptz,
  web_link text,
  anhang_id text,
  anhang_name text,
  anhang_content_type text,
  anhang_groesse bigint,
  status text not null default 'neu'
    check (status in ('neu', 'analysiert', 'fehler', 'exportiert')),
  felder jsonb,
  analyse_fehler text,
  analysiert_am timestamptz,
  salesforce_real_estate_id text,
  salesforce_transaktion_id text,
  exportiert_am timestamptz,
  exportiert_von uuid references public.profiles (id) on delete set null,
  abgelegt_am timestamptz,
  abgelegt_ordner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index postfach_exposes_nachricht_idx
  on public.postfach_exposes (postfach, graph_nachricht_id);

create index postfach_exposes_status_idx
  on public.postfach_exposes (postfach, status, eingegangen_am desc);

create trigger postfach_exposes_set_updated_at
  before update on public.postfach_exposes
  for each row execute function public.set_updated_at();

alter table public.postfach_exposes enable row level security;

-- Temporäre Exposé-PDFs für den Salesforce-Export (je Benutzer eigener Ordner)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expose-pdf-temp', 'expose-pdf-temp', false, 41943040, array['application/pdf']::text[])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy expose_pdf_temp_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'expose-pdf-temp'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy expose_pdf_temp_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'expose-pdf-temp'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy expose_pdf_temp_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'expose-pdf-temp'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

-- ============================================================ Dokument-Postfach

create table public.dokument_posteingang (
  id uuid primary key default gen_random_uuid(),
  postfach text not null,
  graph_nachricht_id text not null,
  internet_message_id text,
  betreff text,
  absender_name text,
  absender_mail text,
  eingegangen_am timestamptz,
  web_link text,
  email_text text,
  anhang_id text,
  anhang_name text,
  anhang_content_type text,
  anhang_groesse bigint,
  status text not null default 'neu'
    check (status in ('neu', 'in_analyse', 'analysiert', 'fehler', 'abgelegt', 'gebucht')),
  dokument_typ text check (dokument_typ in ('rechnung', 'dokument', 'expose')),
  ist_rechnung boolean,
  -- Spalten der Rechnungsfreigabe (nur Rechnungen)
  freigabe_status text check (
    freigabe_status is null
    or freigabe_status in ('neu', 'in_pruefung', 'freigegeben', 'an_datev', 'erledigt')
  ),
  felder jsonb,
  analyse_fehler text,
  analysiert_am timestamptz,
  duplikat_hinweis jsonb,
  gesellschaft_id text references public.gesellschaften (id) on delete set null,
  ablage_ordner_id text,
  ablage_ordner_pfad text,
  ablage_dateiname text,
  abgelegt_am timestamptz,
  abgelegt_onedrive_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index dokument_posteingang_nachricht_anhang_idx
  on public.dokument_posteingang (postfach, graph_nachricht_id, anhang_id);

create index dokument_posteingang_status_idx
  on public.dokument_posteingang (status, eingegangen_am desc);

create index dokument_posteingang_freigabe_status_idx
  on public.dokument_posteingang (freigabe_status, eingegangen_am desc)
  where freigabe_status is not null;

create trigger dokument_posteingang_set_updated_at
  before update on public.dokument_posteingang
  for each row execute function public.set_updated_at();

alter table public.dokument_posteingang enable row level security;

-- An DATEV gesendete Rechnungen (Spalte „An DATEV“ + Dublettenprüfung, 30 Tage)
create table public.rechnung_historie (
  id uuid primary key default gen_random_uuid(),
  rechnungsnummer text,
  rechnungsnummer_norm text,
  rechnungssteller text,
  rechnungsbetrag text,
  waehrung text,
  rechnungsdatum text,
  gesellschaft_id text references public.gesellschaften (id) on delete set null,
  gesellschaft_name text,
  betreff text,
  anhang_name text,
  ablage_dateiname text,
  ordner_pfad text,
  quelle_eintrag_id uuid,
  an_datev_am timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index rechnung_historie_an_datev_am_idx
  on public.rechnung_historie (an_datev_am desc);

create index rechnung_historie_nummer_idx
  on public.rechnung_historie (rechnungsnummer_norm, an_datev_am desc)
  where rechnungsnummer_norm is not null;

create unique index rechnung_historie_quelle_idx
  on public.rechnung_historie (quelle_eintrag_id);

alter table public.rechnung_historie enable row level security;

-- ============================================================ Bank & EBICS

create table public.bankkonten (
  iban text primary key check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  gesellschaft_id text not null references public.gesellschaften (id),
  bank text,
  bezeichnung text,
  zugang text not null default 'manuell' check (zugang in ('ebics', 'manuell')),
  aktiv boolean not null default true,
  bemerkung text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bankkonten_set_updated_at
  before update on public.bankkonten
  for each row execute function public.set_updated_at();

-- Tagesendsalden je Konto aus camt.053 (CLBD)
create table public.kontosalden (
  id uuid primary key default gen_random_uuid(),
  iban text not null references public.bankkonten (iban) on delete cascade,
  stichtag date not null,
  saldo numeric not null,
  quelle text not null check (quelle in ('camt053', 'manuell')),
  created_at timestamptz not null default now(),
  unique (iban, stichtag, quelle)
);

create index kontosalden_iban_stichtag_idx on public.kontosalden (iban, stichtag desc);

create table public.bankauszuege (
  id uuid primary key default gen_random_uuid(),
  gesellschaft_id text not null
    references public.gesellschaften (id) on update cascade on delete restrict,
  konto_iban text not null check (konto_iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  dateiname text not null check (length(btrim(dateiname)) > 0),
  zeitraum_von date,
  zeitraum_bis date,
  anzahl_buchungen integer not null default 0 check (anzahl_buchungen >= 0),
  created_at timestamptz not null default now(),
  constraint bankauszuege_zeitraum_check
    check (zeitraum_bis is null or zeitraum_von is null or zeitraum_bis >= zeitraum_von)
);

create index bankauszuege_konto_idx on public.bankauszuege (konto_iban, created_at desc);

create table public.bankbuchungen (
  id uuid primary key default gen_random_uuid(),
  bankauszug_id uuid not null references public.bankauszuege (id) on delete cascade,
  konto_iban text not null,
  buchungsdatum date not null,
  betrag numeric(12, 2) not null,
  gegenkonto_iban text check (
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

create unique index bankbuchungen_auszug_fingerprint_uidx
  on public.bankbuchungen (bankauszug_id, fingerprint);
-- Dublettenprüfung je Konto über alle Abrufe
create index bankbuchungen_konto_fingerprint_idx
  on public.bankbuchungen (konto_iban, fingerprint);
create index bankbuchungen_konto_datum_idx
  on public.bankbuchungen (konto_iban, buchungsdatum desc);

create type public.ebics_kunde_status as enum (
  'nicht_initialisiert',
  'wartet_auf_bank',
  'bereit',
  'fehler'
);

-- EBICS-Zugang (aus der EBICS-Vereinbarung der Bank) — nur für Grenz & Co.
create table public.ebics_kunden (
  id uuid primary key default gen_random_uuid(),
  gesellschaft_id text not null unique
    references public.gesellschaften (id) on update cascade on delete restrict
    check (gesellschaft_id = 'GC'),
  partner_id text not null unique,
  user_id text not null,
  host_id text not null,
  url text not null,
  bank_name text not null,
  -- Natürliche Person, die den INI-Brief unterschreibt
  teilnehmer_name text not null check (length(btrim(teilnehmer_name)) > 0),
  status public.ebics_kunde_status not null default 'nicht_initialisiert',
  letzter_fehler text,
  initialisiert_am timestamptz,
  bereit_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ebics_kunden_set_updated_at
  before update on public.ebics_kunden
  for each row execute function public.set_updated_at();

create table public.ebics_konten (
  id uuid primary key default gen_random_uuid(),
  ebics_kunde_id uuid not null references public.ebics_kunden (id) on delete cascade,
  iban text not null unique check (
    length(iban) between 15 and 34
    and iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$'
  ),
  bic text,
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);

create index ebics_konten_kunde_idx on public.ebics_konten (ebics_kunde_id);

-- Verschlüsselte Schlüsselblobs (EBICS_MASTER_KEY, nur Service Role)
create table public.ebics_schluessel (
  ebics_kunde_id uuid primary key references public.ebics_kunden (id) on delete cascade,
  encrypted_keys text not null,
  updated_at timestamptz not null default now()
);

create trigger ebics_schluessel_set_updated_at
  before update on public.ebics_schluessel
  for each row execute function public.set_updated_at();

create table public.ebics_abrufe (
  id uuid primary key default gen_random_uuid(),
  ebics_kunde_id uuid not null references public.ebics_kunden (id) on delete cascade,
  auftragsart text not null default 'C53',
  zeitraum_von date,
  zeitraum_bis date,
  anzahl_buchungen integer not null default 0,
  erfolgreich boolean not null default false,
  fehler text,
  created_at timestamptz not null default now()
);

create index ebics_abrufe_kunde_idx on public.ebics_abrufe (ebics_kunde_id, created_at desc);

create view public.v_ebics_kunden
with (security_invoker = on)
as
select
  k.id,
  k.gesellschaft_id,
  k.partner_id,
  g.name as gesellschaft_name,
  g.kuerzel as gesellschaft_kuerzel,
  k.status,
  k.letzter_fehler,
  k.initialisiert_am,
  k.bereit_am,
  k.updated_at,
  (
    select count(*)::integer
    from public.ebics_konten c
    where c.ebics_kunde_id = k.id and c.aktiv
  ) as anzahl_konten,
  exists (
    select 1 from public.ebics_schluessel s where s.ebics_kunde_id = k.id
  ) as hat_schluessel,
  la.created_at as letzter_abruf_am,
  la.erfolgreich as letzter_abruf_erfolgreich,
  la.fehler as letzter_abruf_fehler,
  la.anzahl_buchungen as letzter_abruf_anzahl
from public.ebics_kunden k
join public.gesellschaften g on g.id = k.gesellschaft_id
left join lateral (
  select a.created_at, a.erfolgreich, a.fehler, a.anzahl_buchungen
  from public.ebics_abrufe a
  where a.ebics_kunde_id = k.id
  order by a.created_at desc
  limit 1
) la on true;

alter table public.bankkonten enable row level security;
alter table public.kontosalden enable row level security;
alter table public.bankauszuege enable row level security;
alter table public.bankbuchungen enable row level security;
alter table public.ebics_kunden enable row level security;
alter table public.ebics_konten enable row level security;
alter table public.ebics_schluessel enable row level security;
alter table public.ebics_abrufe enable row level security;

-- ============================================================ Zugriffsrechte

-- Nur Server-Funktionen (Service Role): Postfächer, Integrationen, Bank, EBICS.
revoke all on table
  public.app_integrationen,
  public.postfach_exposes,
  public.dokument_posteingang,
  public.rechnung_historie,
  public.bankkonten,
  public.kontosalden,
  public.bankauszuege,
  public.bankbuchungen,
  public.ebics_kunden,
  public.ebics_konten,
  public.ebics_schluessel,
  public.ebics_abrufe,
  public.v_ebics_kunden
from public, anon, authenticated;

grant all on table
  public.app_integrationen,
  public.postfach_exposes,
  public.dokument_posteingang,
  public.rechnung_historie,
  public.bankkonten,
  public.kontosalden,
  public.bankauszuege,
  public.bankbuchungen,
  public.ebics_kunden,
  public.ebics_konten,
  public.ebics_schluessel,
  public.ebics_abrufe
to service_role;

grant select on public.v_ebics_kunden to service_role;

-- Browser (angemeldet): Profile, Rollen, Gesellschaften, Zuordnungen — RLS oben.
revoke all on table
  public.rollen,
  public.profiles,
  public.gesellschaften,
  public.benutzer_gesellschaften
from anon;

grant select on table
  public.rollen,
  public.profiles,
  public.gesellschaften,
  public.benutzer_gesellschaften
to authenticated;

grant insert, update, delete on table public.benutzer_gesellschaften to authenticated;

grant all on table
  public.rollen,
  public.profiles,
  public.gesellschaften,
  public.benutzer_gesellschaften
to service_role;
