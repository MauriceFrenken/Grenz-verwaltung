-- Jahresziele des Unternehmens für die Übersicht (Provision netto, Verkäufe, neue Mandate).
-- Gepflegt in der App unter Übersicht › Jahresziele; geschrieben nur per Server-Funktion (service_role).

create table if not exists public.unternehmensziele (
  jahr integer not null check (jahr between 2000 and 2100),
  kennzahl text not null check (kennzahl in ('provision_netto', 'verkaeufe', 'neue_mandate')),
  zielwert numeric not null check (zielwert >= 0),
  gesetzt_von uuid references public.profiles (id) on delete set null,
  gesetzt_am timestamptz not null default now(),
  primary key (jahr, kennzahl)
);
comment on table public.unternehmensziele is 'Jahresziele von Grenz & Co. je Kennzahl (Provision netto in €, Anzahl Verkäufe, Anzahl neue Mandate).';

create index if not exists unternehmensziele_gesetzt_von_idx on public.unternehmensziele (gesetzt_von);

alter table public.unternehmensziele enable row level security;
drop policy if exists unternehmensziele_select on public.unternehmensziele;
create policy unternehmensziele_select on public.unternehmensziele
  for select to authenticated using (true);

-- Vorgeschlagene Ziele (29.10.2026), in der App unter „Ziele pflegen“ änderbar.
insert into public.unternehmensziele (jahr, kennzahl, zielwert) values
  (2026, 'provision_netto', 150000), (2026, 'verkaeufe', 3), (2026, 'neue_mandate', 12),
  (2027, 'provision_netto', 250000), (2027, 'verkaeufe', 5), (2027, 'neue_mandate', 24)
on conflict (jahr, kennzahl) do nothing;
