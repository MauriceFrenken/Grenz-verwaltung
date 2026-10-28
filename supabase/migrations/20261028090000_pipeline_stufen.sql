-- Deal-Pipeline: im Board von Hand verschobene Stufen. Die Pipeline bleibt automatisch aus Salesforce;
-- eine Zeile hier übersteuert die automatische Stufe, solange Salesforce noch dieselbe auto_stufe liefert.

create table if not exists public.pipeline_stufen (
  karte_id text primary key,
  stufe text not null check (stufe in ('erstkontakt', 'einwertung', 'beauftragt', 'interessent', 'besichtigung', 'verhandlung', 'notar')),
  auto_stufe text not null check (auto_stufe in ('erstkontakt', 'einwertung', 'beauftragt', 'interessent', 'besichtigung', 'verhandlung', 'notar')),
  gesetzt_von uuid references public.profiles (id) on delete set null,
  gesetzt_am timestamptz not null default now()
);
comment on table public.pipeline_stufen is 'Manuelle Stufen der Deal-Pipeline je Karte (Mandat- oder Opportunity-Id). Nur per Server-Funktion (service_role) geschrieben.';

create index if not exists pipeline_stufen_gesetzt_von_idx on public.pipeline_stufen (gesetzt_von);

alter table public.pipeline_stufen enable row level security;
drop policy if exists pipeline_stufen_select on public.pipeline_stufen;
create policy pipeline_stufen_select on public.pipeline_stufen
  for select to authenticated using (true);
