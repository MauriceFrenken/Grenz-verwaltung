-- Phase 0, 3.1a: Verwaltungsmodule (Mieten, Einheiten, Personen, Sollstellung, Darlehen,
-- Maschinen, Verkauf, Fixkosten, Planposten, Board-Steuerung, Ankauf-Pipeline) entfernen.
-- Stand 23.10.2026: alle betroffenen Tabellen leer. Die Migration bricht ab, falls doch Daten da sind.

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'mietverhaeltnisse', 'mietverhaeltnis_personen', 'einheiten', 'personen', 'mieterhoehungen',
    'mietsoll', 'mietzahler', 'mietzahlungen', 'mieteingang_entscheidungen',
    'sollstellung_laeufe', 'sollstellung_positionen', 'sollstellung_zuordnungen',
    'darlehen', 'darlehen_buchungen', 'maschinen', 'maschinen_kosten',
    'einheiten_verkauf', 'objekt_verkauf', 'objekt_fixkosten', 'planposten',
    'board_beschluesse', 'pruefliste_status', 'ankauf_pipeline'
  ] loop
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception 'Tabelle % hat % Zeilen, Abbruch', t, n;
    end if;
  end loop;
end $$;

-- Trigger auf bleibenden Tabellen, die auf Darlehen oder Mieten zeigen.
drop trigger if exists bankbuchungen_darlehen_zuordnen on public.bankbuchungen;
drop trigger if exists bankbuchungen_mieten_zuordnen on public.bankbuchungen;
drop trigger if exists objekte_mietkonto on public.objekte;

-- Verweise bleibender Tabellen auf Sollstellungsläufe.
-- v_bankauszuege zeigt lauf_id; ohne die Spalte neu anlegen.
drop view if exists public.v_sollstellung_laeufe;
drop view if exists public.v_bankauszuege;
alter table public.bankauszuege drop column if exists lauf_id;
create view public.v_bankauszuege with (security_invoker = true) as
  select ba.id, ba.gesellschaft_id, g.name as gesellschaft_name, g.kuerzel as gesellschaft_kuerzel,
         ba.dateiname, ba.zeitraum_von, ba.zeitraum_bis, ba.anzahl_buchungen, ba.created_at
  from public.bankauszuege ba
  join public.gesellschaften g on g.id = ba.gesellschaft_id;
alter table public.ebics_abrufe drop column if exists lauf_id;

-- v_objekte und v_gesellschaften rechnen über v_einheiten. Einheiten sind leer und werden entfernt,
-- daher ohne Einheiten-Bezug neu anlegen; Spalten bleiben gleich (Werte 0 bzw. null wie bisher).
drop view if exists public.v_gesellschaften;
drop view if exists public.v_objekte;
create view public.v_objekte with (security_invoker = on) as
  select o.id, o.gesellschaft_id, g.name as gesellschaft_name, o.bezeichnung, o.strasse, o.plz, o.ort, o.land,
         o.status, o.bemerkung,
         0::bigint as einheiten_gesamt, 0::bigint as einheiten_wohnen, 0::bigint as einheiten_stellplatz,
         0::bigint as einheiten_vermietet, 0::bigint as einheiten_leer,
         0::numeric as wohnflaeche_m2, 0::numeric as kaltmiete, 0::numeric as kaltmiete_jahr,
         null::numeric as miete_pro_m2_wohnen,
         o.created_at, o.updated_at
  from public.objekte o
  join public.gesellschaften g on g.id = o.gesellschaft_id;
create view public.v_gesellschaften with (security_invoker = on) as
  select g.id, g.name, g.kuerzel, g.datev_postfach, g.datev_postfach_bezeichnung, g.bemerkung,
         coalesce(k.objekte_liste, ''::text) as objekte_liste,
         coalesce(k.anzahl_objekte, 0::bigint) as anzahl_objekte,
         coalesce(k.anzahl_einheiten, 0::numeric) as anzahl_einheiten,
         coalesce(k.kaltmiete, 0::numeric) as kaltmiete,
         coalesce(k.kaltmiete, 0::numeric) * 12::numeric as kaltmiete_jahr,
         g.created_at, g.updated_at
  from public.gesellschaften g
  left join lateral (
    select count(*) as anzahl_objekte, sum(o.einheiten_gesamt) as anzahl_einheiten, sum(o.kaltmiete) as kaltmiete,
           string_agg(o.bezeichnung || case when o.ort <> ''::text then ', '::text || o.ort else ''::text end, '; '::text order by o.id) as objekte_liste
    from public.v_objekte o
    where o.gesellschaft_id = g.id
  ) k on true;

-- Views
drop view if exists
  public.darlehen_stand,
  public.v_einheiten,
  public.v_mieteingaenge,
  public.v_mieteingaenge_offen,
  public.v_mieten_vertraege,
  public.v_mieter,
  public.v_mietkonten,
  public.v_mietkonto_monate,
  public.v_mietverhaeltnisse,
  public.v_sollstellung_laeufe;

-- Tabellen (abhängige Tabellen zuerst)
drop table if exists
  public.mieteingang_entscheidungen,
  public.mietzahlungen,
  public.mietzahler,
  public.mietsoll,
  public.mieterhoehungen,
  public.mietverhaeltnis_personen,
  public.sollstellung_zuordnungen,
  public.sollstellung_positionen,
  public.sollstellung_laeufe,
  public.einheiten_verkauf,
  public.mietverhaeltnisse,
  public.einheiten,
  public.personen,
  public.darlehen_buchungen,
  public.darlehen,
  public.maschinen_kosten,
  public.maschinen,
  public.objekt_verkauf,
  public.objekt_fixkosten,
  public.planposten,
  public.board_beschluesse,
  public.pruefliste_status,
  public.ankauf_pipeline;

-- Funktionen
drop function if exists
  public.ankauf_pipeline_stufe_seit(),
  public.create_objekt_mit_einheiten(jsonb, jsonb, jsonb),
  public.darlehen_buchungen_zuordnen(),
  public.einheit_status_synchronisieren(),
  public.erzeuge_sollstellung_lauf(text, text),
  public.gleiche_sollstellung_ab(uuid),
  public.mieteingang_entscheiden(uuid, text, text, boolean),
  public.mieteingang_freigeben(uuid),
  public.mieteingang_zuordnen(uuid, uuid[], boolean),
  public.mieten_aktualisieren(),
  public.mieten_faellig_am(date),
  public.mieten_feiertag_nrw(date),
  public.mieten_heute(),
  public.mieten_namensteile(text),
  public.mieten_neu_zuordnen(),
  public.mieten_ostersonntag(integer),
  public.mieten_referenzen(text),
  public.mieten_sammelzahler(text),
  public.mieten_text_norm(text),
  public.mieten_zahler_ignoriert(text, text, boolean),
  public.mietsoll_fortschreiben(),
  public.mietverhaeltnis_nach_aenderung(),
  public.mietverhaeltnis_vor_insert(),
  public.mietzahlungen_kandidaten_buchen(text),
  public.mietzahlungen_zuordnen(),
  public.person_anzeigename(text, text, text),
  public.sollstellung_position_status_berechnen(text, numeric, numeric),
  public.trg_bankbuchungen_darlehen(),
  public.trg_bankbuchungen_mieten(),
  public.trg_mieten_stammdaten();

-- Typen, die nur die entfernten Tabellen nutzten
drop type if exists
  public.einheit_status,
  public.einheit_nutzungsart,
  public.mietverhaeltnis_status,
  public.sollstellung_lauf_status,
  public.sollstellung_position_status;
