-- Audit-Trail von Dokumente nach Einstellungen verschieben

update public.rolle_berechtigungen
set berechtigung_id = 'seite.einstellungen.audit'
where berechtigung_id = 'seite.dokumente.audit';

create or replace function public.bearbeiter_hat_berechtigung(
  p_bearbeiter text,
  p_berechtigung_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_bearbeiter = 'op_admin' then true
    when p_bearbeiter = 'administrator' then true
    when p_bearbeiter = 'manager' then coalesce(
      (
        select rb.aktiv
        from public.rolle_berechtigungen rb
        where rb.rolle = p_bearbeiter
          and rb.berechtigung_id = p_berechtigung_id
      ),
      p_berechtigung_id = any (array[
        'seite.dashboard',
        'seite.verwaltung.mandanten',
        'seite.verwaltung.objekte',
        'seite.verwaltung.einheiten',
        'seite.verwaltung.mietverhaeltnisse',
        'seite.verwaltung.sollstellung',
        'seite.verwaltung.zahlungen',
        'seite.verwaltung.nebenkosten',
        'seite.dokumente.ablage',
        'seite.dokumente.pruefordner',
        'seite.einstellungen.audit',
        'seite.transaktionen.liste',
        'seite.transaktionen.expose_import',
        'seite.einstellungen.rollen',
        'aktion.dashboard.zeitraum.aendern',
        'aktion.mandant.wechseln',
        'aktion.verwaltung.mandanten.anlegen',
        'aktion.verwaltung.objekte.anlegen',
        'aktion.verwaltung.objekte.lesen',
        'aktion.verwaltung.mietverhaeltnisse.anlegen',
        'aktion.buchhaltung.sollstellung.erzeugen',
        'aktion.buchhaltung.zahlungen.bankimport',
        'aktion.buchhaltung.nebenkosten.abrechnung_erstellen',
        'aktion.buchhaltung.nebenkosten.kostenposition_anlegen',
        'aktion.buchhaltung.nebenkosten.pdf_exportieren',
        'aktion.dokumente.pruefordner.bestaetigen',
        'aktion.dokumente.pruefordner.neu_zuordnen',
        'aktion.dokumente.pruefordner.ablehnen',
        'aktion.transaktionen.expose_import.hochladen',
        'aktion.transaktionen.expose_import.uebernehmen',
        'aktion.transaktionen.expose_import.korrigieren',
        'aktion.transaktionen.expose_import.verwerfen',
        'aktion.einstellungen.rollen.bearbeiten',
        'aktion.einstellungen.rollen.anlegen'
      ]::text[])
    )
    else coalesce(
      (
        select rb.aktiv
        from public.rolle_berechtigungen rb
        where rb.rolle = p_bearbeiter
          and rb.berechtigung_id = p_berechtigung_id
      ),
      false
    )
  end;
$$;
