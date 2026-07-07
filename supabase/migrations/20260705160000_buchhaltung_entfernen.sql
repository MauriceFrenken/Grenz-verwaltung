-- Buchhaltung draft entfernen — wird später neu implementiert

drop view if exists public.rueckstaende;

drop function if exists public.erzeuge_sollstellung_lauf(text, text);

drop table if exists public.nk_abrechnung_ergebnisse;
drop table if exists public.nk_abrechnungen;
drop table if exists public.kostenpositionen;
drop table if exists public.zahlungen;
drop table if exists public.sollstellungen;
drop table if exists public.kostenarten;
drop table if exists public.verteilerschluessel;

drop type if exists public.sollstellung_status;
drop type if exists public.zahlungs_quelle;
drop type if exists public.nk_abrechnung_status;
drop type if exists public.verteilerschluessel_art;
