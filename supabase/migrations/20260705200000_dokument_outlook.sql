-- Dokumentenablage: benutzerdefinierte Kategorien + Posteingang aus Outlook

create type public.posteingang_status as enum (
  'neu',
  'analysiert',
  'abgelegt',
  'in_pruefung',
  'abgelehnt'
);

-- ---------------------------------------------------------------------------
-- Kategorien (vom Nutzer pflegbar, für KI-Klassifizierung)
-- ---------------------------------------------------------------------------

create table public.dokument_kategorien (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  beschreibung text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dokument_kategorien_name_unique unique (name)
);

create trigger dokument_kategorien_updated_at
  before update on public.dokument_kategorien
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Posteingang: E-Mails mit Anhang aus Outlook (nach KI-Analyse)
-- ---------------------------------------------------------------------------

create table public.posteingang_dokumente (
  id uuid primary key default gen_random_uuid(),
  nachricht_id text not null,
  outlook_account_id text not null,
  graph_nachricht_id text not null,
  betreff text,
  absender text,
  absender_mail text,
  eingegangen_am timestamptz,
  anhang_name text,
  anhang_content_type text,
  email_text text,
  kategorie_id uuid references public.dokument_kategorien (id) on delete set null,
  mandant_id text references public.mandanten (id) on delete set null,
  objekt_id text references public.objekte (id) on delete set null,
  dateiname text,
  konfidenz numeric(4, 3),
  status public.posteingang_status not null default 'neu',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posteingang_dokumente_nachricht_id_unique unique (nachricht_id)
);

create index posteingang_dokumente_status_idx on public.posteingang_dokumente (status);
create index posteingang_dokumente_mandant_id_idx on public.posteingang_dokumente (mandant_id);

create trigger posteingang_dokumente_updated_at
  before update on public.posteingang_dokumente
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.dokument_kategorien enable row level security;
alter table public.posteingang_dokumente enable row level security;

create policy dokument_kategorien_select on public.dokument_kategorien
  for select to authenticated using (true);

create policy dokument_kategorien_write on public.dokument_kategorien
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());

create policy posteingang_dokumente_select on public.posteingang_dokumente
  for select to authenticated using (true);

create policy posteingang_dokumente_write on public.posteingang_dokumente
  for all to authenticated
  using (public.jwt_darf_schreiben()) with check (public.jwt_darf_schreiben());
