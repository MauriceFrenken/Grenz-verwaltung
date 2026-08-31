-- Dokument-Postfach: KI-Analyse für E-Mail-Anhänge (Rechnung vs. Ablage).
-- Zugriff ausschließlich über Service Role (Server-Fns).

create table if not exists public.dokument_posteingang (
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
    check (status in ('neu', 'analysiert', 'fehler', 'abgelegt', 'gebucht')),
  ist_rechnung boolean,
  felder jsonb,
  analyse_fehler text,
  analysiert_am timestamptz,
  gesellschaft_id text references public.gesellschaften (id) on delete set null,
  objekt_id text references public.objekte (id) on delete set null,
  ablage_ordner_id text,
  ablage_ordner_pfad text,
  abgelegt_am timestamptz,
  abgelegt_onedrive_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dokument_posteingang_nachricht_idx
  on public.dokument_posteingang (postfach, graph_nachricht_id);

create index if not exists dokument_posteingang_status_idx
  on public.dokument_posteingang (status, eingegangen_am desc);

drop trigger if exists dokument_posteingang_updated_at on public.dokument_posteingang;
create trigger dokument_posteingang_updated_at
  before update on public.dokument_posteingang
  for each row execute function public.set_updated_at();

alter table public.dokument_posteingang enable row level security;

revoke all on table public.dokument_posteingang from public, anon, authenticated;
grant all on table public.dokument_posteingang to service_role;
