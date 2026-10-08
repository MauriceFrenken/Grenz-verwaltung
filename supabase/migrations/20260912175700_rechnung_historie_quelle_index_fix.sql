-- Aus der Produktivdatenbank übernommen (08.10.2026): war angewendet, fehlte im Repo.
drop index if exists public.rechnung_historie_quelle_idx;

create unique index if not exists rechnung_historie_quelle_idx
  on public.rechnung_historie (quelle_eintrag_id);
