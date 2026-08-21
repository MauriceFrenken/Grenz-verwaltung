-- Temporäre Exposé-PDFs für Salesforce-Export (Drag-and-Drop).
-- Client lädt direkt nach Storage; Server holt die Datei und hängt sie an SF.
-- Kein großes PDF im Vercel-Request-Body, kein Browser→Salesforce-CORS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expose-pdf-temp',
  'expose-pdf-temp',
  false,
  41943040, -- 40 MB
  array['application/pdf']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Pfad: {auth.uid()}/{uuid}.pdf
create policy "expose_pdf_temp_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expose-pdf-temp'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "expose_pdf_temp_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expose-pdf-temp'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "expose_pdf_temp_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expose-pdf-temp'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);
