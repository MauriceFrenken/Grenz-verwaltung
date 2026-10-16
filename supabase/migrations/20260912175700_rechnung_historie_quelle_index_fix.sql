-- Aus der Produktivdatenbank übernommen (08.10.2026): war angewendet, fehlte im Repo.
-- Auf frischen DBs existiert die Tabelle erst ab 20260913020000 — dann no-op.
do $$
begin
  if to_regclass('public.rechnung_historie') is null then
    return;
  end if;
  drop index if exists public.rechnung_historie_quelle_idx;
  create unique index if not exists rechnung_historie_quelle_idx
    on public.rechnung_historie (quelle_eintrag_id);
end $$;
