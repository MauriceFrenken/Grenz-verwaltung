-- Bankdarlehen: Konto, Zinsbindung, Rate und Saldo laut Bank
alter table public.darlehen
  add column if not exists darlehenskonto_iban text,
  add column if not exists abbuchungskonto_iban text,
  add column if not exists zins_art text check (zins_art in ('fest','variabel')),
  add column if not exists zinsbindung_bis date,
  add column if not exists rate_monatlich numeric,
  add column if not exists tilgung_monatlich numeric,
  add column if not exists sondertilgung_pa numeric,
  add column if not exists nicht_abgerufen numeric,
  add column if not exists saldo numeric,
  add column if not exists saldo_am date;
comment on column public.darlehen.saldo is 'Restschuld laut Bank/Vertrag zum Stichtag saldo_am; spätere Tilgungen aus darlehen_buchungen zieht darlehen_stand ab';
