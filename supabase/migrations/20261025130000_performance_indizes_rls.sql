-- Performance-Advisor (25.10.2026): Indizes für Fremdschlüssel und RLS ohne Neuberechnung je Zeile.
-- Liste: /mnt/project-files/db/advisor_performance_2026-10-25.md

-- 1. Fremdschlüssel ohne Index
create index if not exists app_integrationen_verbunden_von_idx on public.app_integrationen (verbunden_von);
create index if not exists bankkonten_gesellschaft_id_idx on public.bankkonten (gesellschaft_id);
create index if not exists bankkonten_objekt_id_idx on public.bankkonten (objekt_id);
create index if not exists bewertungen_erstellt_von_idx on public.bewertungen (erstellt_von);
create index if not exists bewertungen_expose_id_idx on public.bewertungen (expose_id);
create index if not exists bewertungen_objekt_id_idx on public.bewertungen (objekt_id);
create index if not exists design_vorlagen_erstellt_von_idx on public.design_vorlagen (erstellt_von);
create index if not exists dokument_entwuerfe_erstellt_von_idx on public.dokument_entwuerfe (erstellt_von);
create index if not exists dokument_entwuerfe_freigegeben_von_idx on public.dokument_entwuerfe (freigegeben_von);
create index if not exists dokument_entwuerfe_objekt_id_idx on public.dokument_entwuerfe (objekt_id);
create index if not exists dokument_entwuerfe_vorlage_id_idx on public.dokument_entwuerfe (vorlage_id);
create index if not exists dokument_posteingang_gesellschaft_id_idx on public.dokument_posteingang (gesellschaft_id);
create index if not exists dokument_posteingang_objekt_id_idx on public.dokument_posteingang (objekt_id);
create index if not exists eigentuemer_reports_erstellt_von_idx on public.eigentuemer_reports (erstellt_von);
create index if not exists eigentuemer_reports_freigegeben_von_idx on public.eigentuemer_reports (freigegeben_von);
create index if not exists eigentuemer_reports_objekt_id_idx on public.eigentuemer_reports (objekt_id);
create index if not exists eigentuemer_reports_vorlage_id_idx on public.eigentuemer_reports (vorlage_id);
create index if not exists kontosalden_erfasst_von_idx on public.kontosalden (erfasst_von);
create index if not exists posteingang_dokumente_kategorie_id_idx on public.posteingang_dokumente (kategorie_id);
create index if not exists postfach_datenhinweise_gesellschaft_id_idx on public.postfach_datenhinweise (gesellschaft_id);
create index if not exists postfach_datenhinweise_objekt_id_idx on public.postfach_datenhinweise (objekt_id);
create index if not exists postfach_exposes_exportiert_von_idx on public.postfach_exposes (exportiert_von);
create index if not exists recherche_pool_uebernommen_von_idx on public.recherche_pool (uebernommen_von);
create index if not exists rechnung_historie_gesellschaft_id_idx on public.rechnung_historie (gesellschaft_id);
create index if not exists rolle_berechtigungen_updated_by_idx on public.rolle_berechtigungen (updated_by);
create index if not exists rollen_erstellt_von_idx on public.rollen (erstellt_von);

-- 2. auth.uid()/auth.jwt() einmal je Abfrage auswerten statt je Zeile (auth_rls_initplan).
alter policy profiles_select_own on public.profiles
  using ((select auth.uid()) = id);
alter policy profiles_select_verwaltung on public.profiles
  using ((((select auth.jwt()) -> 'app_metadata') ->> 'rolle') = any (array['administrator', 'manager']));
alter policy benutzer_gesellschaften_select on public.benutzer_gesellschaften
  using (((select auth.uid()) = benutzer_id) or ((select public.jwt_rolle()) = any (array['op_admin', 'administrator', 'manager'])));
alter policy postfach_verbindungen_eigene on public.postfach_verbindungen
  using (benutzer_id = (select auth.uid()));
alter policy postfach_sync_nachrichten_eigene on public.postfach_sync_nachrichten
  using (exists (
    select 1 from public.postfach_verbindungen v
    where v.id = postfach_sync_nachrichten.verbindung_id and v.benutzer_id = (select auth.uid())
  ));
