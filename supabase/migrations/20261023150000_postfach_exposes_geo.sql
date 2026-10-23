-- Koordinaten für die Exposé-Karte (OpenStreetMap Nominatim).
alter table public.postfach_exposes
  add column if not exists geo_lat double precision,
  add column if not exists geo_lng double precision,
  add column if not exists geo_gesucht_am timestamptz,
  add column if not exists geo_genau boolean;

comment on column public.postfach_exposes.geo_gesucht_am is 'Zeitpunkt der Geocodierung (OpenStreetMap Nominatim); gesetzt auch ohne Treffer';
comment on column public.postfach_exposes.geo_genau is 'true = Hausadresse gefunden, false = nur Ort/PLZ (ungefähre Lage)';
