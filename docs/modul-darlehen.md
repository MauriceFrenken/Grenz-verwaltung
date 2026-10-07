# Modul Darlehen (Spezifikation)

> Die im Auftrag genannte Datei existierte nicht im Repo. Diese Spezifikation wurde im Nachtlauf
> auf Basis des Strategie-Briefs und der bestehenden Darlehens-Seite (PR #1, `darlehen_stand`)
> geschrieben und ist ab jetzt verbindlich. Abweichungen bitte hier ändern.

## Managementfragen

- Welche Darlehen werden in 6/12 Monaten fällig oder verlieren die Zinsbindung? (Frage 13)
- Wie hoch ist das Zinsänderungsrisiko? (Frage 14)
- Welche Intercompany-Zinsen sind offen oder nicht gebucht? (Frage 9)
- Wie konzentriert sind Finanzierungen nach Geber und Nehmer? (Frage 15)

## Fachregeln

| Thema | Regel |
|---|---|
| IDs | intern `DL-JJJJ-NNN`, Bank `BK-JJJJ-NNN` (Jahr der Auszahlung bzw. des Vertrags) |
| Arten | Bank, Intercompany (Gesellschaft → Gesellschaft), Gesellschafter (Person → Gesellschaft) |
| Zinsmethode | 30/360 (deutsche Methode: Monatsletzter zählt als 30), act/360, act/365. Standard: Bank 30/360, intern act/365 |
| Perioden | kalendarisch ausgerichtet: Monats-, Quartals- (31.03./30.06./30.09./31.12.) oder Jahresende |
| Rumpfperioden | Beginn oder Ende abseits einer Periodengrenze erzeugt eine Rumpfperiode; in der Anfangs-Rumpfperiode nur Zinsen |
| Tilgung | Annuität (konstante Rate), Ratentilgung (konstante Tilgung), endfällig (Rückzahlung zum Ende) |
| Ende | Restschuld wird zum Vertragsende vollständig fällig; unbefristete Darlehen werden 24 Monate über den Stichtag hinaus geplant |
| Rundung | Zinsen je Periode kaufmännisch auf Cent |
| Fälligkeit | Zahlung ist am Periodenende fällig |
| Variabler Zins | wird bis zur Anbindung echter Referenzzinsen mit dem aktuellen Satz fortgeschrieben (Annahme) |

## Abgleich Soll-Zahlung gegen Kontoumsatz

Jede Periode des Zinsplans ist eine Soll-Zahlung des Darlehensnehmers. Gesucht werden Ausgänge auf den Konten des Nehmers.

| Kriterium | Regel |
|---|---|
| Betrag | Ist = Soll ± 0,01 € (bis 10 % Abweichung gilt noch als derselbe Vorgang) |
| Gegenpartei | IBAN gleich oder Name normalisiert enthalten |
| Datum | Buchungstag innerhalb Fälligkeit ± 5 Tage (Suchfenster bis 30 Tage) |
| ID | `DL-…` oder `BK-…` im Verwendungszweck |

Ampel: **grün** = Betrag + Datum + (ID oder Gegenpartei) · **gelb** = gefunden, aber Betrag oder Datum weicht ab · **rot** = nichts gefunden und Fälligkeit + 5 Tage überschritten · **grau** = noch nicht überfällig.
Zuordnung: jeder Umsatz höchstens einmal; erst alle Treffer innerhalb ± 5 Tagen, dann das weitere Fenster.
Rote und gelbe Fälle landen in der gemeinsamen Prüfliste.

## Fristen-Ampel je Darlehen

Frühestes von Vertragsende und Zinsbindungsende: ≤ 6 Monate rot, ≤ 12 Monate gelb. Zinsänderungsrisiko: Restschuld × 1 bzw. 2 Prozentpunkte als Mehrbelastung p.a.

## Excel-Import

Blatt mit Kopfzeile: `Darlehens-ID, Bank-ID, Art, Darlehensgeber, Darlehensnehmer, Objekt-ID, Betrag, Auszahlung, Zinssatz %, Zinsart, Zinsbindung bis, Ende, Tilgungsart, Rate/Tilgung je Periode, Zahlweise, Zinsmethode, Zweck, Bürgschaft von, Bürgschaft Betrag`.
Zahlen und Daten im deutschen Format oder als Excel-Zellwert. Geber/Nehmer über Name oder Kurzname der Gesellschaft bzw. Name der Person. Fehlerhafte Zeilen werden nicht übernommen und mit Zeile, Feld und Meldung angezeigt; doppelte IDs werden komplett abgewiesen. Vorhandene IDs werden aktualisiert.
Testdatei: `docs/testdaten/testdaten_darlehensregister.xlsx` (fiktiv, erzeugt mit `npm run testdaten:darlehen`).

## Seite `/board/darlehen`

KPIs (Bankverbindlichkeiten, interne Darlehen, Zinsen lfd. Jahr, Zinsabgleich, Fälligkeiten ≤ 12 M) · Reiter: Darlehen (Liste), Zinsabgleich, Matrix Geber × Nehmer, Fälligkeiten · Detail-Panel mit Stammdaten, Bürgschaft, Zinsplan, Abgleich und OneDrive-Link · Import-Dialog.

## Testfälle (verbindlich, `src/modules/darlehen/logik/darlehen.test.ts`)

| # | Fall | Erwartung |
|---|---|---|
| T1 | Annuität 100.000 €, 3,6 %, Rate 500 €, Auszahlung 31.01., 30/360 | 1. Periode 30 Tage, Zins 300,00 €, Tilgung 200,00 €, Rest 99.800,00 €, keine Rumpfperiode |
| T2 | Auszahlung 15.04., 2,4 Mio. €, 1,85 % | Rumpfperiode 15 Tage, Zins 1.850,00 €, keine Tilgung; danach 3.700,00 € Zins + 4.000,00 € Tilgung |
| T3 | Endfällig 1 Mio. €, 4 %, act/360, quartalsweise, Ende 15.11. | Perioden 91/92/46 Tage, Zinsen 10.111,11 / 10.222,22 / 5.111,11 €, Rückzahlung am 15.11. als Rumpfperiode |
| T4 | IC 450.000 €, 3 %, act/365, jährlich, unbefristet ab 15.03.2019 | Rumpf 291 Tage = 10.763,01 €; volles Jahr 13.500,00 € |
| T5 | wie T4, Jahr 2024 | 366 Tage = 13.536,99 €; 30/360 zählt 360 Tage |
| T6 | Ratentilgung 400.000 €, 4,2 %, 2.500 €/Monat ab 15.09. | Rumpf 700,00 € Zins; dann 1.400,00 € Zins + 2.500,00 € Tilgung, dann 1.391,25 € |
| T7 | Umsatz mit Betrag, +2 Tagen, ID im Zweck | grün; ohne ID, aber mit Gegenpartei ebenfalls grün |
| T8 | Betrag 6.700 statt 6.750 € bzw. +9 Tage | gelb mit Grund „Betrag weicht ab“ bzw. „+9 Tage“ |
| T9 | kein passender Umsatz | rot ab Fälligkeit + 6 Tage, vorher grau; fremde Konten und Umsätze ohne Bezug zählen nicht |
| T10 | Import der Testdatei | 27 gültig (25 aktualisiert, 2 neu), Zeile 29 abgewiesen (ID-Format), Zeile 30 abgewiesen (unbekannter Nehmer, ungültiges Datum) |
