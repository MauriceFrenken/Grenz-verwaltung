-- App-weite Integrationen (nicht pro Nutzer). Tokens nur über Service Role.

create table if not exists public.app_integrationen (
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

insert into public.app_integrationen (id, status)
values ('microsoft365', 'getrennt')
on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_integrationen_updated_at on public.app_integrationen;
create trigger app_integrationen_updated_at
  before update on public.app_integrationen
  for each row execute function public.set_updated_at();

alter table public.app_integrationen enable row level security;

revoke all on table public.app_integrationen from public, anon, authenticated;
grant all on table public.app_integrationen to service_role;

alter function public.set_updated_at() set search_path = public;

-- Keine Policies für anon/authenticated: Tokens sind nicht über die Data API lesbar.
-- Service Role (Server) umgeht RLS.
