-- Aufgabenboard strategisch ausrichten: jede Aufgabe gehört zu einem Themenfeld
-- (strategie, akquise, vermarktung, marke, personal, organisation, digital, finanzen; '' = ohne).
-- Die Werte pflegt die App (src/lib/aufgaben/typen.ts, THEMENFELDER).

alter table public.aufgaben
  add column if not exists themenfeld text not null default '';
create index if not exists aufgaben_themenfeld_idx on public.aufgaben (themenfeld) where not archiviert;
