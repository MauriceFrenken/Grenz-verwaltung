-- Phase 1: Storage für Design-Vorlagen (Logo) und erzeugte Dokumente (PDF/PPTX).
-- Schreiben nur serverseitig (service_role); Angemeldete lesen.

insert into storage.buckets (id, name, public)
values ('vorlagen', 'vorlagen', false), ('dokumente', 'dokumente', false)
on conflict (id) do nothing;

drop policy if exists vorlagen_lesen on storage.objects;
create policy vorlagen_lesen on storage.objects
  for select to authenticated using (bucket_id in ('vorlagen', 'dokumente'));

-- Eigentümer-Report: Versandprotokoll in Salesforce (Task-Id) und KI-Entwurf mit Quellen.
alter table public.eigentuemer_reports
  add column if not exists titel text,
  add column if not exists inhalt jsonb not null default '{}'::jsonb,
  add column if not exists quellen jsonb not null default '[]'::jsonb,
  add column if not exists sf_task_id text,
  add column if not exists freigegeben_von uuid references public.profiles(id) on delete set null,
  add column if not exists freigegeben_am timestamptz;
comment on column public.eigentuemer_reports.inhalt is 'Bearbeitbare Texte (Marktfeedback, nächste Schritte, Kommentar) je Baustein.';

-- Dokument-Entwürfe: Pflichtangaben-Prüfung und Ablage in Salesforce.
alter table public.dokument_entwuerfe
  add column if not exists pruefung jsonb not null default '{}'::jsonb,
  add column if not exists sf_content_document_id text;
comment on column public.dokument_entwuerfe.pruefung is 'Ergebnis der Pflichtangaben-Prüfung (GEG, Provision, Flächen, Mieten) vor der Freigabe.';

-- Freigabe nur durch Nutzer: KI-Pfade schreiben nie freigegeben (Server-Funktionen prüfen das),
-- zusätzlich muss freigegeben_von gesetzt sein.
alter table public.dokument_entwuerfe drop constraint if exists dokument_entwuerfe_freigabe_mit_nutzer;
alter table public.dokument_entwuerfe add constraint dokument_entwuerfe_freigabe_mit_nutzer
  check (status not in ('freigegeben', 'versendet') or freigegeben_von is not null);
alter table public.eigentuemer_reports drop constraint if exists eigentuemer_reports_freigabe_mit_nutzer;
alter table public.eigentuemer_reports add constraint eigentuemer_reports_freigabe_mit_nutzer
  check (status not in ('freigegeben', 'versendet') or freigegeben_von is not null);
