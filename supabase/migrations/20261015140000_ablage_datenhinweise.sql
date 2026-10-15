-- Datenhinweise auch aus der OneDrive-Ablage: neue oder geänderte Dateien
-- werden wie Postfach-Mails auf Auswirkungen auf die Zahlen geprüft.

alter table public.postfach_datenhinweise
  add column if not exists quelle text not null default 'postfach'
    check (quelle in ('postfach', 'ablage')),
  add column if not exists onedrive_id text,
  add column if not exists pfad text,
  add column if not exists web_url text;

-- Dateien aus dem OneDrive-Delta, die (noch) geprüft werden
create table if not exists public.ablage_dateien (
  onedrive_id text primary key,
  name text not null,
  pfad text,
  web_url text,
  groesse bigint,
  geaendert_am timestamptz,
  ctag text,
  status text not null default 'offen'
    check (status in ('offen', 'geprueft', 'uebersprungen', 'fehler')),
  fehler text,
  geprueft_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ablage_dateien_status_idx
  on public.ablage_dateien (status, geaendert_am desc);

drop trigger if exists ablage_dateien_updated_at on public.ablage_dateien;
create trigger ablage_dateien_updated_at
  before update on public.ablage_dateien
  for each row execute function public.set_updated_at();

-- Fortsetzungslink des OneDrive-Deltas (nextLink während der Erstaufnahme, danach deltaLink)
create table if not exists public.ablage_sync_stand (
  id text primary key,
  link text,
  erstaufnahme_fertig boolean not null default false,
  aktualisiert_am timestamptz not null default now()
);

-- nur serverseitig (Service Role)
alter table public.ablage_dateien enable row level security;
alter table public.ablage_sync_stand enable row level security;
revoke all on table public.ablage_dateien from public, anon, authenticated;
revoke all on table public.ablage_sync_stand from public, anon, authenticated;
grant all on table public.ablage_dateien to service_role;
grant all on table public.ablage_sync_stand to service_role;
