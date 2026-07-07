-- Benutzer-Profile (Auth-Erweiterung, ohne Mandanten-Stammdaten)

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  initialen text not null default '–',
  rolle text not null default 'leser',
  stellenbezeichnung text not null default '',
  alle_mandanten boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_rolle_idx on public.profiles (rolle);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_select_verwaltung on public.profiles;
create policy profiles_select_verwaltung on public.profiles
  for select to authenticated
  using (
    ((auth.jwt() -> 'app_metadata') ->> 'rolle') in ('op_admin', 'administrator', 'manager')
  );
