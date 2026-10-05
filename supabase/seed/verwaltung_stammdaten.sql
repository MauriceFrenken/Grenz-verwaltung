-- Seed der Verwaltungs-Stammdaten (Stand 25.08.2026).
-- Idempotent: erneutes Ausfuehren aktualisiert bestehende Datensaetze.

insert into public.gesellschaften
  (id, name, kuerzel, datev_postfach, datev_postfach_bezeichnung, bemerkung)
values
  ('G-01', 'Frenken Immobilien GmbH', 'FIG', 'ffa89580-14a3-42f2-b964-cfa2a31f9862@uploadmail.datev.de', 'Rechnungseingang - DATEV Unternehmen online', null),
  ('G-02', 'FRENKEN Investment Management GmbH', 'FIM', 'c962be9d-8f1b-4229-9eee-971df94dbf97@uploadmail.datev.de', 'DATEV - FRENKEN Investment Management GmbH', null),
  ('G-03', 'FRENKEN Capital Management GmbH', 'FCM', 'e6ae98f2-cf7a-49c3-b295-a210935f7962@uploadmail.datev.de', 'DATEV - FRENKEN Capital Management GmbH', null),
  ('G-04', 'MTF Capital GmbH', 'MTF', 'b56417be-b388-498b-9369-0819fc434c29@uploadmail.datev.de', 'DATEV - MTF Capital GmbH', null),
  ('G-05', 'FRENKEN Holding GmbH', 'FHG', '6ebc0403-9a63-4bdc-900f-4a6a947641d1@uploadmail.datev.de', 'DATEV - FRENKEN Holding GmbH', 'kein Objekt zugeordnet (Holding)')
on conflict (id) do update set
  name = excluded.name,
  kuerzel = excluded.kuerzel,
  datev_postfach = excluded.datev_postfach,
  datev_postfach_bezeichnung = excluded.datev_postfach_bezeichnung,
  bemerkung = excluded.bemerkung;

insert into public.objekte
  (id, gesellschaft_id, bezeichnung, strasse, plz, ort, land, status)
values
  ('O-01', 'G-01', 'Apollinarisstrasse 18', 'Apollinarisstraße 18', '', 'Düsseldorf', 'DE', 'aktiv'),
  ('O-02', 'G-01', 'Alt-Pempelfort 7', 'Alt-Pempelfort 7', '', 'Düsseldorf', 'DE', 'aktiv'),
  ('O-03', 'G-02', 'Kalkumer Strasse 78', 'Kalkumer Straße 78', '40468', 'Düsseldorf', 'DE', 'aktiv'),
  ('O-04', 'G-03', 'Königsberger Str. 1-3 + Breslauer Str. 61-63', 'Königsberger Straße 1-3 / Breslauer Straße 61-63', '41836', 'Hückelhoven', 'DE', 'aktiv'),
  ('O-05', 'G-04', 'Bendemannstrasse 19A', 'Bendemannstraße 19A', '40210', 'Düsseldorf', 'DE', 'aktiv')
on conflict (id) do update set
  gesellschaft_id = excluded.gesellschaft_id,
  bezeichnung = excluded.bezeichnung,
  strasse = excluded.strasse,
  plz = excluded.plz,
  ort = excluded.ort;

insert into public.einheiten
  (id, objekt_id, hausteil, lage, nutzungsart, status, flaeche_m2, flaeche_aufmass_m2, bemerkung)
values
  ('APO-01', 'O-01', null, 'EG links', 'wohnen', 'vermietet', 71.56, null, 'Nur Nachname hinterlegt'),
  ('APO-02', 'O-01', null, 'EG rechts', 'wohnen', 'vermietet', 48.16, null, 'Nur Nachname hinterlegt'),
  ('APO-03', 'O-01', null, '1. OG links', 'wohnen', 'vermietet', 74.78, null, 'Nur Nachname hinterlegt'),
  ('APO-04', 'O-01', null, '1. OG rechts', 'wohnen', 'vermietet', 57.05, null, 'Nur Nachname hinterlegt'),
  ('APO-05', 'O-01', null, '2. OG links', 'wohnen', 'vermietet', 74.78, null, 'Nur Nachname hinterlegt'),
  ('APO-06', 'O-01', null, '2. OG rechts', 'wohnen', 'vermietet', 57.05, null, 'Nur Nachname hinterlegt'),
  ('APO-07', 'O-01', null, '3. OG links', 'wohnen', 'vermietet', 74.78, null, 'Nur Nachname hinterlegt'),
  ('APO-08', 'O-01', null, '3. OG rechts', 'wohnen', 'vermietet', 57.05, null, 'Nur Nachname hinterlegt'),
  ('APO-09', 'O-01', null, 'DG links', 'wohnen', 'vermietet', 63.7, null, 'Nur Nachname hinterlegt'),
  ('APO-10', 'O-01', null, 'DG rechts', 'wohnen', 'vermietet', 56.9, null, 'Nur Nachname hinterlegt'),
  ('ALT-01', 'O-02', null, 'EG', 'wohnen', 'leerstand', 132.25, null, 'Leerstand'),
  ('ALT-02', 'O-02', null, '1. OG', 'wohnen', 'leerstand', 139.75, null, 'Leerstand'),
  ('ALT-03', 'O-02', null, '2. OG', 'wohnen', 'vermietet', 133.89, null, null),
  ('ALT-04', 'O-02', null, '3. OG', 'wohnen', 'leerstand', 133.89, null, 'Leerstand'),
  ('ALT-05', 'O-02', null, '4. OG', 'wohnen', 'leerstand', 97.33, null, 'Leerstand'),
  ('KAL-01', 'O-03', null, 'EG re', 'wohnen', 'vermietet', 63.4, 61.14, null),
  ('KAL-02', 'O-03', null, 'EG mi', 'wohnen', 'vermietet', 42.7, 42.38, null),
  ('KAL-03', 'O-03', null, 'EG li', 'wohnen', 'vermietet', 55.7, 54.6, null),
  ('KAL-04', 'O-03', null, '1. OG re', 'wohnen', 'vermietet', 63.4, 61.14, null),
  ('KAL-05', 'O-03', null, '1. OG mi', 'wohnen', 'leerstand', 61.6, 61.51, 'Mietername hinterlegt, Status leer - bitte prüfen'),
  ('KAL-06', 'O-03', null, '1. OG li', 'wohnen', 'vermietet', 63.4, 62.63, null),
  ('KAL-07', 'O-03', null, '2. OG re', 'wohnen', 'vermietet', 63.4, 61.14, null),
  ('KAL-08', 'O-03', null, '2. OG mi', 'wohnen', 'vermietet', 61.6, 61.5, null),
  ('KAL-09', 'O-03', null, '2. OG li', 'wohnen', 'vermietet', 63.4, 62.63, null),
  ('KAL-10', 'O-03', null, 'Garage 1', 'garage', 'vermietet', null, null, 'Nur Nachname hinterlegt'),
  ('KAL-11', 'O-03', null, 'Garage 2', 'garage', 'vermietet', null, null, 'Nur Nachname hinterlegt'),
  ('KAL-12', 'O-03', null, 'Garage 3', 'garage', 'vermietet', null, null, 'Nur Nachname hinterlegt'),
  ('KAL-13', 'O-03', null, 'Garage 4', 'garage', 'vermietet', null, null, 'Nur Nachname hinterlegt'),
  ('KAL-14', 'O-03', null, 'Garage 5', 'garage', 'vermietet', null, null, 'Nur Nachname hinterlegt'),
  ('KAL-15', 'O-03', null, 'Garage 6', 'garage', 'vermietet', null, null, 'Nur Nachname hinterlegt'),
  ('KAL-16', 'O-03', null, 'Garage 7', 'garage', 'vermietet', null, null, 'Nur Nachname hinterlegt'),
  ('HUE-01', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang A', 'EG links', 'wohnen', 'vermietet', 86.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-02', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang A', 'EG rechts', 'wohnen', 'vermietet', 58.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-03', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang A', '1. OG links', 'wohnen', 'vermietet', 86.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-04', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang A', '1. OG rechts', 'wohnen', 'vermietet', 58.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-05', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang A', '2. OG links', 'wohnen', 'vermietet', 86.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-06', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang A', '2. OG rechts', 'wohnen', 'vermietet', 58.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-07', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang A', '3. OG links', 'wohnen', 'vermietet', 86.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-08', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang A', '3. OG rechts', 'wohnen', 'vermietet', 58.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-09', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang B', 'EG links', 'wohnen', 'vermietet', 70.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-10', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang B', 'EG rechts', 'wohnen', 'vermietet', 69.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-11', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang B', '1. OG links', 'wohnen', 'vermietet', 70.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-12', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang B', '1. OG rechts', 'wohnen', 'vermietet', 69.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-13', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang B', '2. OG links', 'wohnen', 'vermietet', 70.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-14', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang B', '2. OG rechts', 'wohnen', 'vermietet', 69.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-15', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang B', '3. OG links', 'wohnen', 'vermietet', 70.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-16', 'O-04', 'Haus 1 - Königsberger Straße 1-3 / Aufgang B', '3. OG rechts', 'wohnen', 'vermietet', 69.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-17', 'O-04', 'Haus 1 - Königsberger Straße 1-3', 'Stellplatz 1', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('HUE-18', 'O-04', 'Haus 1 - Königsberger Straße 1-3', 'Stellplatz 2', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('HUE-19', 'O-04', 'Haus 1 - Königsberger Straße 1-3', 'Stellplatz 3', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('HUE-20', 'O-04', 'Haus 1 - Königsberger Straße 1-3', 'Stellplatz 4', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('HUE-21', 'O-04', 'Haus 1 - Königsberger Straße 1-3', 'Stellplatz 5', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('HUE-22', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang A', 'EG links', 'wohnen', 'vermietet', 86.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-23', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang A', 'EG rechts', 'wohnen', 'vermietet', 59.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-24', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang A', '1. OG links', 'wohnen', 'vermietet', 86.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-25', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang A', '1. OG rechts', 'wohnen', 'vermietet', 59.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-26', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang A', '2. OG links', 'wohnen', 'vermietet', 86.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-27', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang A', '2. OG rechts', 'wohnen', 'vermietet', 59.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-28', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang B', 'EG links', 'wohnen', 'vermietet', 70.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-29', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang B', 'EG rechts', 'wohnen', 'vermietet', 70.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-30', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang B', '1. OG links', 'wohnen', 'vermietet', 70.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-31', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang B', '1. OG rechts', 'wohnen', 'vermietet', 70.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-32', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang B', '2. OG links', 'wohnen', 'vermietet', 70.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-33', 'O-04', 'Haus 2 - Breslauer Straße 61-63 / Aufgang B', '2. OG rechts', 'wohnen', 'vermietet', 70.0, null, 'Aufteilung Aufgang A/B – Hausnummern-Zuordnung bitte bestätigen'),
  ('HUE-34', 'O-04', 'Haus 2 - Breslauer Straße 61-63', 'Stellplatz 6', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('HUE-35', 'O-04', 'Haus 2 - Breslauer Straße 61-63', 'Stellplatz 7', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('HUE-36', 'O-04', 'Haus 2 - Breslauer Straße 61-63', 'Stellplatz 8', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('HUE-37', 'O-04', 'Haus 2 - Breslauer Straße 61-63', 'Stellplatz 9', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('HUE-38', 'O-04', 'Haus 2 - Breslauer Straße 61-63', 'Stellplatz 10', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('HUE-39', 'O-04', 'Haus 2 - Breslauer Straße 61-63', 'Stellplatz 11', 'stellplatz', 'vermietet', null, null, 'Kein Mieter hinterlegt'),
  ('BEN-01', 'O-05', null, 'EG rechts u. 1. OG rechts', 'wohnen', 'leerstand', 90.0, null, 'Leerstand'),
  ('BEN-02', 'O-05', null, 'EG links', 'wohnen', 'vermietet', 30.0, null, null),
  ('BEN-03', 'O-05', null, '1. OG links', 'wohnen', 'vermietet', 77.0, null, null),
  ('BEN-04', 'O-05', null, '2. OG links', 'wohnen', 'vermietet', 70.0, null, null),
  ('BEN-05', 'O-05', null, '2. OG rechts', 'wohnen', 'vermietet', 70.0, null, null),
  ('BEN-06', 'O-05', null, '3. OG links', 'wohnen', 'vermietet', 70.0, null, null),
  ('BEN-07', 'O-05', null, '3. OG rechts', 'wohnen', 'vermietet', 70.0, null, null),
  ('BEN-08', 'O-05', null, 'DG links', 'wohnen', 'vermietet', 64.0, null, null),
  ('BEN-09', 'O-05', null, 'DG rechts', 'wohnen', 'vermietet', null, null, 'Fläche und Miete fehlen'),
  ('BEN-10', 'O-05', null, 'Garage links', 'garage', 'leerstand', null, null, 'Keine Daten'),
  ('BEN-11', 'O-05', null, 'Garage rechts', 'garage', 'leerstand', null, null, 'Keine Daten')
on conflict (id) do update set
  objekt_id = excluded.objekt_id,
  hausteil = excluded.hausteil,
  lage = excluded.lage,
  nutzungsart = excluded.nutzungsart,
  status = excluded.status,
  flaeche_m2 = excluded.flaeche_m2,
  flaeche_aufmass_m2 = excluded.flaeche_aufmass_m2,
  bemerkung = excluded.bemerkung;

-- Mietverhaeltnisse stammen aus den Mieterspalten des Sheets "Einheiten".
with quelle (einheit_id, mieter_name, beginn, letzte_mieterhoehung, kaltmiete, nk_vorauszahlung, status) as (
  values
  ('APO-01', 'Luyken', null, null, 590.0, null, 'aktiv'),
  ('APO-02', 'Raschen', null, null, 410.0, null, 'aktiv'),
  ('APO-03', 'Kneist', null, null, 680.0, null, 'aktiv'),
  ('APO-04', 'Tinnebor', null, null, 470.0, null, 'aktiv'),
  ('APO-05', 'Meinhardt', null, null, 551.5, null, 'aktiv'),
  ('APO-06', 'Krämer', null, null, 580.0, null, 'aktiv'),
  ('APO-07', 'Lammert', null, null, 785.0, null, 'aktiv'),
  ('APO-08', 'Hoffmann', null, null, 485.0, null, 'aktiv'),
  ('APO-09', 'Füller', null, null, 354.5, null, 'aktiv'),
  ('APO-10', 'Mühlmeister', null, null, 440.0, null, 'aktiv'),
  ('ALT-03', 'Herr Thomas Kleine u. Frau Fruzsina Sallos', null, null, 1740.57, null, 'aktiv'),
  ('KAL-01', 'Karina Herde', null, '2024-03-01', 529.0, null, 'aktiv'),
  ('KAL-02', 'Alireza Ahmadi', null, '2024-03-01', 460.0, null, 'aktiv'),
  ('KAL-03', 'Robert Schröder', null, '2024-03-01', 495.0, null, 'aktiv'),
  ('KAL-04', 'Gerda Mähren', null, '2024-03-01', 463.22, null, 'aktiv'),
  ('KAL-06', 'Antonio Haak', null, null, 760.0, null, 'aktiv'),
  ('KAL-07', 'Annette Haak', null, '2024-03-01', 495.0, null, 'aktiv'),
  ('KAL-08', 'Hana Opálková', null, null, 780.0, null, 'aktiv'),
  ('KAL-09', 'Stefanie Altmayer', null, '2024-03-01', 610.0, null, 'aktiv'),
  ('KAL-10', 'Schröder', null, null, 80.0, null, 'aktiv'),
  ('KAL-11', 'Kuhn', null, null, 80.0, null, 'aktiv'),
  ('KAL-12', 'Giesen', null, null, 80.0, null, 'aktiv'),
  ('KAL-13', 'Mueller', null, null, 80.0, null, 'aktiv'),
  ('KAL-14', 'Otto', null, null, 56.24, null, 'aktiv'),
  ('KAL-15', 'Tappert', null, null, 80.0, null, 'aktiv'),
  ('KAL-16', 'Clarissa', null, null, 80.0, null, 'aktiv'),
  ('HUE-01', 'BOTSCHKOVSKI, IVAN', null, null, 552.0, 270.0, 'aktiv'),
  ('HUE-02', 'KANBOUH, AYOUB', null, null, 380.0, 150.0, 'aktiv'),
  ('HUE-03', 'PETERS, LARA-NAOMI', null, null, 520.0, 200.0, 'aktiv'),
  ('HUE-04', 'MILICEVIC, MARKO', null, null, 372.0, 140.0, 'aktiv'),
  ('HUE-05', 'PETRY, VERENA', null, null, 540.0, 270.0, 'aktiv'),
  ('HUE-06', 'STEPHAN, JASMIN', null, null, 354.0, 226.0, 'aktiv'),
  ('HUE-07', 'BLUM, NADESDA UND SERGEJ', null, null, 474.0, 250.0, 'aktiv'),
  ('HUE-08', 'KRAUS, NATALIA', null, null, 360.0, 135.0, 'aktiv'),
  ('HUE-09', 'GILGE, ANGELA', null, null, 414.0, 167.04, 'aktiv'),
  ('HUE-10', 'BORCHARDT, ANDRÉ', null, null, 460.0, 210.0, 'aktiv'),
  ('HUE-11', 'KLIMASCH, KEVIN', null, null, 420.0, 185.0, 'aktiv'),
  ('HUE-12', 'PALEVIC, RADOVAN', null, null, 420.0, 200.0, 'aktiv'),
  ('HUE-13', 'WIECHA, JAN', null, null, 414.0, 140.0, 'aktiv'),
  ('HUE-14', 'YALDIZ, SILBE', null, null, 552.0, 300.0, 'aktiv'),
  ('HUE-15', 'SCHIEFELBEIN, JÜRGEN', null, null, 414.0, 146.37, 'aktiv'),
  ('HUE-16', 'LIPPERT, ERNA', null, null, 414.0, 194.41, 'aktiv'),
  ('HUE-17', 'Shefer', null, null, 45.0, null, 'aktiv'),
  ('HUE-18', 'Maier', null, null, 45.0, null, 'aktiv'),
  ('HUE-19', 'Saied', null, null, 45.0, null, 'aktiv'),
  ('HUE-20', 'Cüster', null, null, 45.0, null, 'aktiv'),
  ('HUE-21', 'Klimasch, Kevin', null, null, 45.0, null, 'aktiv'),
  ('HUE-22', 'CÜSTER, NINA UND CHRISTIAN', null, null, 516.0, 265.0, 'aktiv'),
  ('HUE-23', 'GÜNTNER, PAULINA', null, null, 354.0, 240.0, 'aktiv'),
  ('HUE-24', 'ALABRASH, RAMEZ', null, null, 540.0, 410.0, 'aktiv'),
  ('HUE-25', 'MAIER, ALEXEJ', null, null, 354.0, 140.0, 'aktiv'),
  ('HUE-26', 'SAIED, ALMAKKI', null, null, 474.0, 470.0, 'aktiv'),
  ('HUE-27', 'KLIMASCH, TOBIAS', null, null, 500.0, 180.0, 'aktiv'),
  ('HUE-28', 'SHEFER, IRYNA', null, null, 414.0, 260.0, 'aktiv'),
  ('HUE-29', 'KORDUNOWSKI, THORSTEN', null, null, 444.0, 200.0, 'aktiv'),
  ('HUE-30', 'FOLGAR-ANTONIO, KATHARINA', null, null, 420.0, 200.0, 'aktiv'),
  ('HUE-31', 'KERSGENS, ANNA', null, null, 414.0, 310.0, 'aktiv'),
  ('HUE-32', 'JOST, SANNY', null, null, 420.0, 180.0, 'aktiv'),
  ('HUE-33', 'Kira Jacobs', null, null, 630.0, 100.0, 'aktiv'),
  ('HUE-34', 'Kersgens', null, null, 45.0, null, 'aktiv'),
  ('HUE-35', 'Blum', null, null, 45.0, null, 'aktiv'),
  ('HUE-36', 'Kordunovski', null, null, 45.0, null, 'aktiv'),
  ('HUE-37', 'Schiefelbein', null, null, 45.0, null, 'aktiv'),
  ('HUE-38', 'Wiecha', null, null, 45.0, null, 'aktiv'),
  ('HUE-39', 'Bochkovskaya', null, null, 45.0, null, 'aktiv'),
  ('BEN-02', 'Frau Heike Lasch', '2009-07-01', null, 240.0, null, 'aktiv'),
  ('BEN-03', 'Herr Manjit Singh', '2015-10-01', null, 665.0, null, 'aktiv'),
  ('BEN-04', 'Hung-Kuei Chou', '2023-06-01', null, 620.0, null, 'aktiv'),
  ('BEN-05', 'Charlotte Komar', '2025-09-01', null, 620.0, null, 'aktiv'),
  ('BEN-06', 'Hekima Avochki', '2015-11-15', null, 620.0, null, 'aktiv'),
  ('BEN-07', 'Hicham Idrissa', '2024-03-01', null, 559.0, null, 'aktiv'),
  ('BEN-08', 'Frau Gina Stralau', '2016-09-15', null, 320.0, null, 'aktiv'),
  ('BEN-09', 'Yaghoub Alboughabeish', '2017-12-15', null, 0, null, 'aktiv')
)
insert into public.mietverhaeltnisse
  (einheit_id, mieter_name, beginn, letzte_mieterhoehung, kaltmiete, nk_vorauszahlung, status)
select
  q.einheit_id, q.mieter_name, q.beginn::date, q.letzte_mieterhoehung::date,
  q.kaltmiete::numeric, q.nk_vorauszahlung::numeric, q.status::public.mietverhaeltnis_status
from quelle q
where not exists (
  select 1 from public.mietverhaeltnisse m
  where m.einheit_id = q.einheit_id and m.status = 'aktiv'
);

-- Mieter-Profile + Hauptmieter-Links aus Seed-Mietverhältnissen
with distinct_mieter as (
  select distinct on (lower(btrim(m.mieter_name)), coalesce(m.iban, ''))
    btrim(m.mieter_name) as name,
    m.iban
  from public.mietverhaeltnisse m
  where coalesce(btrim(m.mieter_name), '') <> ''
  order by lower(btrim(m.mieter_name)), coalesce(m.iban, ''), m.id
)
insert into public.personen (typ, nachname, iban)
select 'mieter', d.name, d.iban
from distinct_mieter d
where not exists (
  select 1
  from public.personen p
  where p.typ = 'mieter'
    and p.nachname = d.name
    and coalesce(p.iban, '') = coalesce(d.iban, '')
);

insert into public.mietverhaeltnis_personen (mietverhaeltnis_id, person_id, rolle)
select m.id, p.id, 'hauptmieter'
from public.mietverhaeltnisse m
join public.personen p
  on p.typ = 'mieter'
 and lower(p.nachname) = lower(btrim(m.mieter_name))
 and coalesce(p.iban, '') = coalesce(m.iban, '')
where coalesce(btrim(m.mieter_name), '') <> ''
  and not exists (
    select 1
    from public.mietverhaeltnis_personen mp
    where mp.mietverhaeltnis_id = m.id
      and mp.rolle = 'hauptmieter'
  );
