-- EBICS-Abruf (nur Download): Kunden, Konten, verschlüsselte Schlüssel, Abrufprotokoll.

create type public.ebics_kunde_status as enum (
  'nicht_initialisiert',
  'wartet_auf_bank',
  'bereit',
  'fehler'
);

create table public.ebics_kunden (
  id uuid primary key default gen_random_uuid(),
  gesellschaft_id text not null
    references public.gesellschaften (id) on update cascade on delete restrict,
  partner_id text not null,
  user_id text not null default 'EBICS001',
  host_id text not null default 'MULTIVIA',
  url text not null
    default 'https://ebics.multivia-suite.de/ebicsweb/ebicsweb',
  bank_name text not null default 'Volksbank im Rheinland eG',
  status public.ebics_kunde_status not null default 'nicht_initialisiert',
  letzter_fehler text,
  initialisiert_am timestamptz,
  bereit_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gesellschaft_id),
  unique (partner_id)
);

create trigger ebics_kunden_set_updated_at
  before update on public.ebics_kunden
  for each row execute function public.set_updated_at();

create table public.ebics_konten (
  id uuid primary key default gen_random_uuid(),
  ebics_kunde_id uuid not null
    references public.ebics_kunden (id) on delete cascade,
  iban text not null
    check (
      length(iban) between 15 and 34
      and iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$'
    ),
  bic text,
  aktiv boolean not null default true,
  created_at timestamptz not null default now(),
  unique (iban)
);

create index ebics_konten_kunde_idx on public.ebics_konten (ebics_kunde_id);

-- Verschlüsselte Schlüsselblobs (nur Service Role).
create table public.ebics_schluessel (
  ebics_kunde_id uuid primary key
    references public.ebics_kunden (id) on delete cascade,
  encrypted_keys text not null,
  updated_at timestamptz not null default now()
);

create trigger ebics_schluessel_set_updated_at
  before update on public.ebics_schluessel
  for each row execute function public.set_updated_at();

create table public.ebics_abrufe (
  id uuid primary key default gen_random_uuid(),
  ebics_kunde_id uuid not null
    references public.ebics_kunden (id) on delete cascade,
  lauf_id uuid
    references public.sollstellung_laeufe (id) on delete set null,
  auftragsart text not null default 'C53',
  zeitraum_von date,
  zeitraum_bis date,
  anzahl_buchungen integer not null default 0,
  erfolgreich boolean not null default false,
  fehler text,
  created_at timestamptz not null default now()
);

create index ebics_abrufe_kunde_idx on public.ebics_abrufe (ebics_kunde_id, created_at desc);
create index ebics_abrufe_lauf_idx on public.ebics_abrufe (lauf_id);

-- Status-View ohne Secrets (für UI).
create or replace view public.v_ebics_kunden
with (security_invoker = on)
as
select
  k.id,
  k.gesellschaft_id,
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
  ) as hat_schluessel
from public.ebics_kunden k
join public.gesellschaften g on g.id = k.gesellschaft_id;

-- Seed: G-01 … G-05 aus BPD (Volksbank / Multivia).
-- Nur wenn die Gesellschaften bereits existieren (Greenfield ohne Stammdaten → no-op).
insert into public.ebics_kunden
  (gesellschaft_id, partner_id, user_id, host_id, url, bank_name)
select v.gesellschaft_id, v.partner_id, v.user_id, v.host_id, v.url, v.bank_name
from (
  values
    ('G-01', 'MV134597', 'EBICS001', 'MULTIVIA',
     'https://ebics.multivia-suite.de/ebicsweb/ebicsweb', 'Volksbank im Rheinland eG'),
    ('G-02', 'MV134600', 'EBICS001', 'MULTIVIA',
     'https://ebics.multivia-suite.de/ebicsweb/ebicsweb', 'Volksbank im Rheinland eG'),
    ('G-03', 'MV134607', 'EBICS001', 'MULTIVIA',
     'https://ebics.multivia-suite.de/ebicsweb/ebicsweb', 'Volksbank im Rheinland eG'),
    ('G-04', 'MV134594', 'EBICS001', 'MULTIVIA',
     'https://ebics.multivia-suite.de/ebicsweb/ebicsweb', 'Volksbank im Rheinland eG'),
    ('G-05', 'MV134596', 'EBICS001', 'MULTIVIA',
     'https://ebics.multivia-suite.de/ebicsweb/ebicsweb', 'Volksbank im Rheinland eG')
) as v(gesellschaft_id, partner_id, user_id, host_id, url, bank_name)
where exists (
  select 1 from public.gesellschaften g where g.id = v.gesellschaft_id
)
on conflict (gesellschaft_id) do update set
  partner_id = excluded.partner_id,
  user_id = excluded.user_id,
  host_id = excluded.host_id,
  url = excluded.url,
  bank_name = excluded.bank_name,
  updated_at = now();

insert into public.ebics_konten (ebics_kunde_id, iban, bic)
select k.id, v.iban, 'GENODED1MRB'
from public.ebics_kunden k
join (
  values
    ('G-01', 'DE04310605170047793033'),
    ('G-01', 'DE26310605170047793025'),
    ('G-01', 'DE48310605170047793017'),
    ('G-02', 'DE20310605170088072480'),
    ('G-02', 'DE28310605170085050010'),
    ('G-02', 'DE42310605170088072472'),
    ('G-02', 'DE61310605170088072421'),
    ('G-02', 'DE64310605170088072464'),
    ('G-02', 'DE83310605170088072413'),
    ('G-02', 'DE86310605170088072456'),
    ('G-02', 'DE89310605170088072499'),
    ('G-03', 'DE75310605170099562013'),
    ('G-04', 'DE28310605177001470013'),
    ('G-05', 'DE35310605170085049011')
) as v(gesellschaft_id, iban) on v.gesellschaft_id = k.gesellschaft_id
on conflict (iban) do update set
  ebics_kunde_id = excluded.ebics_kunde_id,
  bic = excluded.bic,
  aktiv = true;

alter table public.ebics_kunden enable row level security;
alter table public.ebics_konten enable row level security;
alter table public.ebics_schluessel enable row level security;
alter table public.ebics_abrufe enable row level security;

-- Kunden/Konten/Abrufe: lesen für authenticated, schreiben nur Server (service role).
create policy ebics_kunden_select on public.ebics_kunden
  for select to authenticated using (true);

create policy ebics_konten_select on public.ebics_konten
  for select to authenticated using (true);

create policy ebics_abrufe_select on public.ebics_abrufe
  for select to authenticated using (true);

-- Schlüssel: kein Zugriff über Data API.
revoke all on table public.ebics_schluessel from public, anon, authenticated;
grant all on table public.ebics_schluessel to service_role;

revoke insert, update, delete on table public.ebics_kunden from authenticated;
revoke insert, update, delete on table public.ebics_konten from authenticated;
revoke insert, update, delete on table public.ebics_abrufe from authenticated;
grant select on table public.ebics_kunden to authenticated;
grant select on table public.ebics_konten to authenticated;
grant select on table public.ebics_abrufe to authenticated;
grant all on table public.ebics_kunden to service_role;
grant all on table public.ebics_konten to service_role;
grant all on table public.ebics_abrufe to service_role;

grant select on public.v_ebics_kunden to authenticated;
