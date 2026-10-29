-- Marktkarte: Koordinaten für Salesforce-Objekte (Transaktion__c / Real_Estate__c haben in
-- Salesforce keine Geodaten). Schlüssel = normalisierte Adresse „straße|plz|ort“.
-- lat/lng null = Adresse nicht gefunden (wird nicht erneut gesucht). Nur Service Role.

create table if not exists public.geo_cache (
  schluessel text primary key,
  lat double precision,
  lng double precision,
  genau boolean,
  gesucht_am timestamptz not null default now()
);
comment on table public.geo_cache is 'Geocoding-Cache (OpenStreetMap Nominatim) für die Marktkarte.';

alter table public.geo_cache enable row level security;
