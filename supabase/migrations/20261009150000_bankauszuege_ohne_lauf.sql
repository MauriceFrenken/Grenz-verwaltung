-- Täglicher EBICS-Kontoabruf unabhängig von Sollstellungs-Läufen:
-- Auszüge ohne Lauf sind erlaubt (Mietabgleich läuft weiter über Läufe).
-- In Prod am 09.10.2026 eingespielt.
alter table public.bankauszuege alter column lauf_id drop not null;
