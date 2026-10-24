-- Phase 0, 3.3: Salesforce-Sync. Cache für Real_Estate__c (Objektdaten der Mandate)
-- und weitere Felder der Ankaufsprofile für das Käufer-Matching.

create table if not exists public.sf_real_estate (
  sf_id text primary key,
  name text not null,
  objektart text,
  strasse text,
  plz text,
  ort text,
  baujahr numeric,
  wohnflaeche_m2 numeric,
  gewerbeflaeche_m2 numeric,
  mietflaeche_m2 numeric,
  grundstuecksflaeche_m2 numeric,
  einheiten numeric,
  jahresnettokaltmiete numeric,
  energieausweis text,
  heizungsart text,
  geo_lat double precision,
  geo_lng double precision,
  eigentuemer_kontakt_sf_id text,
  eigentuemer_account_sf_id text,
  owner_sf_user_id text,
  sf_daten jsonb not null default '{}'::jsonb,
  sf_geaendert_am timestamptz,
  abgerufen_am timestamptz not null default now()
);
comment on table public.sf_real_estate is 'Cache von Real_Estate__c (nur Objekte mit Mandat). Nur lesen; Änderungen über die Salesforce-API.';

alter table public.sf_real_estate enable row level security;
drop policy if exists sf_real_estate_select on public.sf_real_estate;
create policy sf_real_estate_select on public.sf_real_estate for select to authenticated using (true);

alter table public.sf_ankaufsprofile
  add column if not exists nutzungsarten text[],
  add column if not exists einheiten_min numeric,
  add column if not exists baujahr_ab numeric,
  add column if not exists baujahr_bis numeric,
  add column if not exists investor_typ text,
  add column if not exists owner_sf_user_id text;

create index if not exists sf_mandate_real_estate_idx on public.sf_mandate (real_estate_sf_id);
create index if not exists sf_kampagnen_mitglieder_kampagne_idx on public.sf_kampagnen_mitglieder (kampagne_sf_id);
create index if not exists sf_aktivitaeten_owner_idx on public.sf_aktivitaeten (owner_sf_user_id);

insert into public.sf_sync_stand (sf_objekt) values
  ('Mandate__c'), ('Real_Estate__c'), ('Opportunity'), ('Campaign'), ('CampaignMember'),
  ('Investorprofile__c'), ('Search_Location__c'), ('Task'), ('Event'), ('EmailMessage'),
  ('Contact'), ('Account'), ('Lead')
on conflict (sf_objekt) do nothing;
