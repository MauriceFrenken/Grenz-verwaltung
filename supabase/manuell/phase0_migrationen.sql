-- Phase 0: Sicherheit (Vault, Rechte) und Entfernen der Verwaltungsmodule.
-- Komplett in den Supabase SQL Editor kopieren und ausführen. Läuft als eine Transaktion.
begin;
-- Phase 0, Sicherheit: Microsoft-Tokens aus app_integrationen in Supabase Vault,
-- Funktionsrechte nach Supabase-Advisor, Marktdaten-Zeilen aus sf_sync_stand.

-- 1. Tokens in Vault. In der Tabelle steht nur noch der Verweis.
alter table public.app_integrationen
  add column if not exists token_secret_id uuid;
comment on column public.app_integrationen.token_secret_id is 'Verweis auf vault.secrets (JSON mit access_token und refresh_token). Tokens nie im Klartext in Tabellen.';

create or replace function public.integration_token_speichern(p_id text, p_access_token text, p_refresh_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
  v_wert text;
begin
  v_wert := jsonb_build_object('access_token', p_access_token, 'refresh_token', p_refresh_token)::text;

  select token_secret_id into v_secret
  from public.app_integrationen
  where id = p_id
  for update;
  if not found then
    raise exception 'Integration % nicht gefunden', p_id;
  end if;

  if v_secret is null then
    v_secret := vault.create_secret(v_wert, 'app_integrationen_' || p_id, 'Tokens der App-Integration ' || p_id);
    update public.app_integrationen set token_secret_id = v_secret where id = p_id;
  else
    perform vault.update_secret(v_secret, v_wert);
  end if;
end;
$$;

create or replace function public.integration_token_lesen(p_id text)
returns table (access_token text, refresh_token text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret::jsonb ->> 'access_token',
         s.decrypted_secret::jsonb ->> 'refresh_token'
  from public.app_integrationen a
  join vault.decrypted_secrets s on s.id = a.token_secret_id
  where a.id = p_id;
$$;

create or replace function public.integration_token_loeschen(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  select token_secret_id into v_secret from public.app_integrationen where id = p_id for update;
  update public.app_integrationen set token_secret_id = null where id = p_id;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
end;
$$;

revoke all on function public.integration_token_speichern(text, text, text) from public, anon, authenticated;
revoke all on function public.integration_token_lesen(text) from public, anon, authenticated;
revoke all on function public.integration_token_loeschen(text) from public, anon, authenticated;
grant execute on function public.integration_token_speichern(text, text, text) to service_role;
grant execute on function public.integration_token_lesen(text) to service_role;
grant execute on function public.integration_token_loeschen(text) to service_role;

-- Vorhandene Tokens übernehmen. Die Klartext-Spalten entfernt eine spätere Migration,
-- sobald der Code nur noch über Vault liest.
do $$
declare r record;
begin
  for r in
    select id, access_token, refresh_token
    from public.app_integrationen
    where token_secret_id is null and (access_token is not null or refresh_token is not null)
  loop
    perform public.integration_token_speichern(r.id, r.access_token, r.refresh_token);
  end loop;
end $$;

-- 2. Advisor: SECURITY-DEFINER-Funktionen nicht für anon ausführbar.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- Rollen-Funktionen prüfen die Rolle intern (jwt_rolle), bleiben für Angemeldete.
grant execute on function public.create_rolle(text, text, text, text) to authenticated;
grant execute on function public.save_rolle_berechtigungen(text, jsonb) to authenticated;
grant execute on function public.update_rolle_beschreibung(text, text) to authenticated;
grant execute on function public.update_rolle_gesellschaft_zuweisung(text, public.gesellschaft_zuweisung) to authenticated;
-- bearbeiter_hat_berechtigung prüft nichts und wird im Code nicht genutzt.
revoke execute on function public.bearbeiter_hat_berechtigung(text, text) from authenticated;

-- Fehlender search_path (Funktionen, die bestehen bleiben).
alter function public.jwt_rolle() set search_path = public;
alter function public.rolle_rang(text) set search_path = public;

-- 3. Marktdaten-Importe gehören nicht in den Salesforce-Abrufstand.
delete from public.sf_sync_stand where sf_objekt in ('IMV', 'BORIS_NRW');

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

insert into supabase_migrations.schema_migrations(version, name) values ('20261023160000','sicherheit_vault_rechte'), ('20261023160100','verwaltungsmodule_entfernen');
commit;
select 'fertig' as ergebnis, (select count(*) from vault.secrets) as vault_secrets;
