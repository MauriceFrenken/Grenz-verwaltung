alter table public.dokument_posteingang
  add column if not exists email_text text;
