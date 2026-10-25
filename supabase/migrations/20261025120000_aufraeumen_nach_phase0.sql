-- Aufräumen nach Phase 0. Erst anwenden, wenn der Code mit Vault-Zugriff auf Produktion läuft
-- (die alte Version liest noch access_token/refresh_token aus der Tabelle).

-- 1. Microsoft-Tokens nur noch in Vault: Klartext-Spalten entfernen.
--    Abbruch, falls eine Zeile Tokens hat, aber keinen Vault-Verweis.
do $$
begin
  if exists (
    select 1 from public.app_integrationen
    where token_secret_id is null and (access_token is not null or refresh_token is not null)
  ) then
    raise exception 'app_integrationen: Tokens ohne Vault-Verweis, Spalten werden nicht entfernt';
  end if;
end $$;

alter table public.app_integrationen
  drop column if exists access_token,
  drop column if exists refresh_token;

-- 2. Performance-Advisor: doppelter Index (identisch mit sf_kampagnen_mitglieder_kampagne_sf_id_idx).
drop index if exists public.sf_kampagnen_mitglieder_kampagne_idx;
