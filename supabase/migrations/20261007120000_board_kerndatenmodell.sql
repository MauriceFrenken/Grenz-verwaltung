-- FRENKEN Management Board: zentrales Datenmodell im eigenen Schema `board`.
-- NICHT angewendet (Nachtlauf 07.10.2026). Vor dem Anwenden mit Ben abstimmen:
-- Abbildung auf die bestehenden Tabellen in `public` (gesellschaften, objekte, einheiten,
-- mietverhaeltnisse, darlehen, bankbuchungen) ist eine offene Entscheidung.
-- Grundprinzip: Jeder Vertrag erzeugt Soll-Zahlungen, jeder Umsatz wird einer Soll-Zahlung zugeordnet.

create schema if not exists board;

-- Gesellschaften der Gruppe
create table board.companies (
  id text primary key,
  short_name text not null unique,
  name text not null,
  legal_form text not null check (legal_form in ('GmbH', 'GbR', 'GmbH & Co. KG')),
  segment text not null check (segment in ('holding','bestand','aufteiler','baumaschinen','beteiligungen','makler')),
  min_liquidity numeric(14,2) not null default 0 check (min_liquidity >= 0),
  separate_area boolean not null default false,
  onedrive_folder text not null,
  created_at timestamptz not null default now()
);

-- Personen, Banken, externe Parteien (Gesellschafter, Notare, Käufer)
create table board.parties (
  id text primary key,
  kind text not null check (kind in ('person','bank','extern')),
  name text not null,
  iban text,
  email text
);

-- Objekte, ID-Format IM-JJJJ-NNN
create table board.properties (
  id text primary key check (id ~ '^IM-[0-9]{4}-[0-9]{3}$'),
  company_id text not null references board.companies(id),
  name text not null,
  street text not null,
  zip text not null,
  city text not null,
  strategy text not null check (strategy in ('bestand','aufteiler')),
  year_built int,
  purchase_date date not null,
  purchase_price numeric(14,2) not null,
  market_value numeric(14,2),
  target_rent_per_sqm numeric(8,2),
  cost_per_sqm_month numeric(8,2),
  onedrive_url text not null
);

create table board.units (
  id text primary key,
  property_id text not null references board.properties(id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('wohnung','gewerbe')),
  area numeric(8,2) not null check (area > 0),
  rooms numeric(4,1),
  floor text,
  status text not null check (status in ('vermietet','leer','sanierung','im_vertrieb','reserviert','verkauft')),
  list_price numeric(14,2),
  sale_price numeric(14,2),
  sale_date date,
  unique (property_id, label)
);

create table board.tenants (
  id text primary key,
  name text not null,
  email text,
  iban text not null
);

create table board.leases (
  id text primary key,
  unit_id text not null references board.units(id),
  tenant_id text not null references board.tenants(id),
  start_date date not null,
  end_date date,
  base_rent numeric(10,2) not null check (base_rent >= 0),
  service_charge numeric(10,2) not null default 0,
  deposit numeric(10,2) not null default 0,
  last_rent_increase date,
  check (end_date is null or end_date > start_date)
);

-- Mieterereignisse: Kündigung (§ 573c BGB) und Mieterhöhung (§ 558 BGB).
-- Fristen (Fristende, Zustimmungsfrist, Wirksamkeit) werden aus received_on berechnet, nicht gespeichert.
create table board.lease_events (
  id text primary key,
  lease_id text not null references board.leases(id) on delete cascade,
  kind text not null check (kind in ('kuendigung','mieterhoehung')),
  received_on date not null,
  notice_by text check (notice_by in ('mieter','vermieter')),
  move_out_planned date,
  new_base_rent numeric(10,2),
  status text check (status in ('offen','zugestimmt','abgelehnt')),
  check (
    (kind = 'kuendigung' and notice_by is not null)
    or (kind = 'mieterhoehung' and new_base_rent is not null and status is not null)
  )
);

-- Darlehen, ID-Format DL-JJJJ-NNN (intern) und BK-JJJJ-NNN (Bank)
create table board.loans (
  id text primary key check (id ~ '^DL-[0-9]{4}-[0-9]{3}$'),
  bank_ref text unique check (bank_ref is null or bank_ref ~ '^BK-[0-9]{4}-[0-9]{3}$'),
  kind text not null check (kind in ('bank','intercompany','gesellschafter')),
  lender_company_id text references board.companies(id),
  lender_party_id text references board.parties(id),
  borrower_company_id text references board.companies(id),
  borrower_party_id text references board.parties(id),
  property_id text references board.properties(id),
  principal numeric(14,2) not null check (principal > 0),
  disbursement_date date not null,
  rate numeric(7,5) not null check (rate >= 0 and rate <= 0.25),
  rate_type text not null check (rate_type in ('fest','variabel')),
  fixed_until date,
  maturity_date date,
  repayment_kind text not null check (repayment_kind in ('annuitaet','ratentilgung','endfaellig')),
  installment numeric(14,2),
  principal_per_period numeric(14,2),
  frequency text not null check (frequency in ('monatlich','quartalsweise','jaehrlich')),
  day_count text not null check (day_count in ('30/360','act/360','act/365')),
  status text not null default 'aktiv' check (status in ('aktiv','beendet','entwurf')),
  guarantee_by text,
  guarantee_amount numeric(14,2),
  purpose text not null default '',
  onedrive_url text,
  check ((lender_company_id is null) <> (lender_party_id is null)),
  check ((borrower_company_id is null) <> (borrower_party_id is null)),
  check (maturity_date is null or maturity_date > disbursement_date),
  check (repayment_kind <> 'annuitaet' or installment is not null),
  check (repayment_kind <> 'ratentilgung' or principal_per_period is not null)
);

-- Zinsplan (aus loans berechnet und materialisiert für Abgleich und Reporting)
create table board.interest_schedule (
  loan_id text not null references board.loans(id) on delete cascade,
  nr int not null,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  days int not null,
  interest numeric(14,2) not null,
  principal numeric(14,2) not null,
  payment numeric(14,2) not null,
  balance_after numeric(14,2) not null,
  stub boolean not null default false,
  primary key (loan_id, nr)
);

create table board.bank_accounts (
  id text primary key,
  company_id text not null references board.companies(id),
  iban text not null unique,
  bank_name text not null,
  label text not null,
  opening_balance numeric(14,2) not null default 0,
  opening_date date not null
);

-- Kontoumsätze (später aus EBICS camt.053 / Qonto); positiv = Eingang
create table board.transactions (
  id text primary key,
  account_id text not null references board.bank_accounts(id),
  booking_date date not null,
  amount numeric(14,2) not null,
  counterparty_name text not null default '',
  counterparty_iban text,
  purpose text not null default '',
  category text not null check (category in ('miete','darlehen','rechnung','verkauf','ankauf','personal','steuern','intercompany','sonstiges')),
  property_id text references board.properties(id),
  -- Zuordnung zur Soll-Zahlung (Ergebnis des Abgleichs)
  matched_ref_type text,
  matched_ref_id text
);
create index transactions_account_date_idx on board.transactions (account_id, booking_date);

create table board.invoices (
  id text primary key,
  company_id text not null references board.companies(id),
  direction text not null check (direction in ('eingang','ausgang')),
  counterparty text not null,
  amount numeric(14,2) not null check (amount > 0),
  issue_date date not null,
  due_date date not null,
  status text not null check (status in ('offen','bezahlt')),
  property_id text references board.properties(id),
  project_id text,
  description text not null default ''
);

-- Dokumente: nur Kerndaten + Link nach OneDrive, nie die Datei selbst
create table board.documents (
  id text primary key,
  company_id text not null references board.companies(id),
  title text not null,
  doc_type text not null,
  doc_date date not null,
  onedrive_url text not null,
  ref_type text check (ref_type in ('loan','property','lease','project','company')),
  ref_id text
);

-- Gemeinsame Prüfliste aller Module ("KI schlägt vor, der Mensch bestätigt")
create table board.review_items (
  id text primary key,
  source text not null check (source in ('darlehen','immobilien','liquiditaet','ablage','salesforce')),
  severity text not null check (severity in ('rot','gelb')),
  title text not null,
  detail text not null default '',
  company_id text references board.companies(id),
  ref_type text,
  ref_id text,
  due_date date,
  created_at date not null default current_date,
  status text not null default 'offen' check (status in ('offen','erledigt')),
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  resolved_by uuid,
  resolved_at timestamptz
);

-- Verknüpfungen zu Salesforce (External IDs)
create table board.crm_links (
  id text primary key,
  entity_type text not null check (entity_type in ('property','unit','party','acquisition')),
  entity_id text not null,
  sf_object text not null,
  sf_id text not null,
  external_id text not null,
  unique (sf_object, sf_id)
);

-- Aufteiler-Projekte
create table board.projects (
  id text primary key,
  property_id text not null references board.properties(id),
  name text not null,
  purchase_price numeric(14,2) not null,
  renovation_budget numeric(14,2) not null,
  equity numeric(14,2) not null,
  start_date date not null,
  planned_end date not null,
  planned_revenue numeric(14,2) not null
);

-- Manuelle Planposten der Liquiditätsplanung
create table board.planned_payments (
  id text primary key,
  company_id text not null references board.companies(id),
  payment_date date not null,
  amount numeric(14,2) not null,
  label text not null,
  monthly_until date,
  category text not null
);

-- Zugriff: nur angemeldete Benutzer (keine Rollenmatrix, siehe AGENTS.md). Schreiben über Server-Fns.
do $$
declare t text;
begin
  foreach t in array array['companies','parties','properties','units','tenants','leases','lease_events',
    'loans','interest_schedule','bank_accounts','transactions','invoices','documents','review_items',
    'crm_links','projects','planned_payments']
  loop
    execute format('alter table board.%I enable row level security', t);
    execute format('create policy %I on board.%I for select to authenticated using (true)', t || '_lesen', t);
  end loop;
end $$;

grant usage on schema board to authenticated;
grant select on all tables in schema board to authenticated;
