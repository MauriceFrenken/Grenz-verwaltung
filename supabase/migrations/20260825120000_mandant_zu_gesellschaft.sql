-- Mandant -> Gesellschaft: Umbenennung der bestehenden Auth-/Rollen-Objekte.
-- Die Fachtabellen (gesellschaften/objekte/einheiten/mietverhaeltnisse) folgen in der naechsten Migration.

-- Der alte Verwaltungs-Entwurf wird verworfen; die Folgemigration baut die
-- Fachtabellen passend zu den Quelldaten (Mieterliste) neu auf.
drop table if exists public.mietverhaeltnisse cascade;
drop table if exists public.einheiten cascade;
drop table if exists public.objekte cascade;
drop table if exists public.benutzer_mandanten cascade;
drop table if exists public.mandanten cascade;

drop type if exists public.mietverhaeltnis_status;
drop type if exists public.einheit_status;
drop type if exists public.objekt_status;

-- posteingang_dokumente verlor durch das Cascade nur den Fremdschluessel;
-- die Spalte wird umbenannt und in der Folgemigration neu verknuepft.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posteingang_dokumente'
      and column_name = 'mandant_id'
  ) then
    alter table public.posteingang_dokumente rename column mandant_id to gesellschaft_id;
  end if;
end
$$;

alter type public.mandant_zuweisung rename to gesellschaft_zuweisung;
alter table public.rollen rename column mandant_zuweisung to gesellschaft_zuweisung;
alter table public.profiles rename column alle_mandanten to alle_gesellschaften;

drop function if exists public.update_rolle_mandant_zuweisung(text, public.gesellschaft_zuweisung);

create or replace function public.update_rolle_gesellschaft_zuweisung(
  p_rolle text,
  p_gesellschaft_zuweisung public.gesellschaft_zuweisung
)
returns public.rollen
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_bearbeiter text;
  v_rolle public.rollen;
begin
  v_bearbeiter := public.jwt_rolle();

  if v_bearbeiter not in ('op_admin', 'administrator', 'manager') then
    raise exception 'Keine Berechtigung zum Bearbeiten von Rollen';
  end if;

  if v_bearbeiter <> 'op_admin'
     and public.rolle_rang(p_rolle) <= public.rolle_rang(v_bearbeiter) then
    raise exception 'Diese Rolle darf nicht bearbeitet werden';
  end if;

  update public.rollen
  set gesellschaft_zuweisung = p_gesellschaft_zuweisung
  where id = p_rolle
  returning * into v_rolle;

  if not found then
    raise exception 'Rolle nicht gefunden';
  end if;

  return v_rolle;
end;
$function$;

-- Zugriffsliste im JWT-App-Metadata mitziehen, sonst faellt eingeschraenkter
-- Zugriff still auf "alle Gesellschaften" zurueck.
update auth.users
set raw_app_meta_data =
  (raw_app_meta_data - 'mandanten')
  || jsonb_build_object('gesellschaften', raw_app_meta_data -> 'mandanten')
where raw_app_meta_data ? 'mandanten';

-- Berechtigungs-IDs in der gespeicherten Matrix mitziehen.
update public.rolle_berechtigungen
set berechtigung_id = replace(berechtigung_id, 'mandanten', 'gesellschaften')
where berechtigung_id like '%mandanten%';

update public.rolle_berechtigungen
set berechtigung_id = 'aktion.gesellschaft.wechseln'
where berechtigung_id = 'aktion.mandant.wechseln';

-- Fallback-Liste in bearbeiter_hat_berechtigung an die neuen IDs anpassen.
create or replace function public.bearbeiter_hat_berechtigung(
  p_bearbeiter text,
  p_berechtigung_id text
)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
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
        'seite.verwaltung.gesellschaften',
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
        'aktion.gesellschaft.wechseln',
        'aktion.verwaltung.gesellschaften.anlegen',
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
$function$;

-- Schreibrechte auf Stammdaten, zentral fuer die RLS-Policies der Fachtabellen.
create or replace function public.jwt_darf_schreiben()
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select public.jwt_rolle() in ('op_admin', 'administrator', 'manager', 'mitarbeiter');
$function$;
