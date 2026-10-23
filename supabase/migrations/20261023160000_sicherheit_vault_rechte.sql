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
