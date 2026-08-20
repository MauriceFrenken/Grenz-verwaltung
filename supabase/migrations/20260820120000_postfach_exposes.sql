-- Exposé-Mails aus dem Ankauf-Postfach: KI-Analyse wird hier zwischengespeichert,
-- damit der Mitarbeiter im Exposé-Import nur noch prüfen muss.
-- Zugriff ausschließlich über Service Role (Server-Fns).

create table if not exists public.postfach_exposes (
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

create unique index if not exists postfach_exposes_nachricht_idx
  on public.postfach_exposes (postfach, graph_nachricht_id);

create index if not exists postfach_exposes_status_idx
  on public.postfach_exposes (postfach, status, eingegangen_am desc);

drop trigger if exists postfach_exposes_updated_at on public.postfach_exposes;
create trigger postfach_exposes_updated_at
  before update on public.postfach_exposes
  for each row execute function public.set_updated_at();

alter table public.postfach_exposes enable row level security;

revoke all on table public.postfach_exposes from public, anon, authenticated;
grant all on table public.postfach_exposes to service_role;

-- Keine Policies für anon/authenticated: Lesen/Schreiben nur über Server-Fns.
