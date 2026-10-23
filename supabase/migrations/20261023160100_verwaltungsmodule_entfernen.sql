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
alter table public.bankauszuege drop column if exists lauf_id;
alter table public.ebics_abrufe drop column if exists lauf_id;

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
