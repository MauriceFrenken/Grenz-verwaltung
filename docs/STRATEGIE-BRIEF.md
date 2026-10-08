# Strategie-Brief FRENKEN Management Board

Stand: 08.10.2026 (Phase 2) · Grundlage sind die echten Stammdaten in Bens Datenbank (lesend ausgewertet) · Musterdaten gibt es nur noch im Demo-Modus.

**Kernthese (bestätigt):** Die FRENKEN-Gruppe ist eine **Eigenkapital-Allokationsmaschine**. Die Holding sammelt Geld von Gesellschaftern und Banken und verteilt es per Intercompany-Darlehen an die Segmente. Der Engpass ist **freie Liquidität zum richtigen Zeitpunkt in der richtigen Gesellschaft**. Neu in Phase 2: Die Antwort ist nur so gut wie die Daten. Heute fehlen Kontosalden, Mindestliquidität und jede Zahl zu Baumaschinen. Das Board zeigt deshalb zu jeder Zahl ihre Quelle und macht Lücken sichtbar, statt sie zu schätzen.

---

## 1. Die echte Gruppe in Segmenten

Segmentzuordnung als Daten (Spalte `gesellschaften.segment`, in der App unter Steuerung → Datenqualität änderbar). Zahlen: Stand 08.10.2026, aktive Datensätze.

| Segment | Gesellschaften | Geschäft | Datenlage heute |
|---|---|---|---|
| **Holding / Finanzierung** | G-05 FRENKEN Holding (FHG) | bündelt Liquidität, vergibt IC-Darlehen | EBICS; 0,89 Mio. € Gesellschafter- und sonstige Darlehen aufgenommen, rund 1,07 Mio. € IC-Darlehen vergeben |
| **Immobilien Bestand** | G-01 FIG, G-02 FIM, G-03 FCM, G-04 MTF, G-07 SBS, G-08 IPS | Buy-and-hold, Miete | 7 Objekte, 81 Einheiten, 73 aktive Mietverträge, Soll-Kaltmiete rund 28.650 €/Monat; Bankdarlehen 4,8 Mio. € (G-01 bis G-04). SBS und IPS haben noch keine Einheiten erfasst |
| **Immobilien Aufteiler** | O-02 in G-01 (`strategie = aufteiler`) | WEG-Aufteilung, Einzelverkauf | 5 Einheiten, 1 vermietet; `einheiten_verkauf` leer, kein Projektplan |
| **Immobilien Transaktionen** | Zielgesellschaft je Deal | Ankauf (Exposé → Notar), Verkauf | 75 Exposés im Postfach, 377 Salesforce-Transaktionen, `ankauf_pipeline` leer |
| **Baumaschinenhandel** | G-09 FRENKEN Baumaschinen (FB) | An- und Verkauf gebrauchter Maschinen | 4 IC-Darlehen der Holding über 767.500 €; kein Bestand, kein Konto im System |
| **Baumaschinen-Plattform** | G-06 TradeAnyMachine (TAM) | digitale Handelsplattform, Start-up | 1 IC-Darlehen über 50.000 €; kein Konto, keine Plattformzahlen |
| **Makler (getrennt)** | G-10 Grenz & Co. (GC) | Provisionen | 1 IC-Darlehen über 66.666 €; eigene Liquidität, nicht Teil der freien Gruppenliquidität |

**Korrekturen gegenüber der Ausgangshypothese:**
- EBICS läuft für G-01 bis G-05 (inklusive Holding), 14 Konten.
- Die Objektgesellschaften sind nicht „je Objekt eine GmbH“: G-01 hält zwei Objekte (Bestand O-01 und Aufteiler O-02).
- Strategie ist nur bei O-02 (Aufteiler) und O-04 (Bestand) gesetzt; die übrigen fünf Objekte rechnet das Board als Bestand und meldet die Lücke.

## 2. Kapitalfluss der Gruppe

Grundlage: 54 Darlehen, davon aktiv rund 7,9 Mio. €.

```
 Banken ──4,8 Mio. € Bankdarlehen──► G-01 (2,6) · G-03 (1,0) · G-04 (0,7) · G-02 (0,5)

 Gesellschafter / Dritte ──1,7 Mio. €──► G-05 Holding (0,89) · G-02 (0,38) · G-03 (0,35) · G-01 (0,04)

 G-05 Holding ──IC 1,07 Mio. €──► G-09 Baumaschinen (0,77)
                                 G-04 MTF (0,17)
                                 G-10 Makler (0,07)
                                 G-06 Plattform (0,05)
                                 G-01 FIG (0,02)

 G-01 FIG ──IC 0,30 Mio. € (Rückfluss)──► G-05 Holding
```

**So what:**
1. Die Baumaschinen binden 72 % der IC-Mittel der Holding, ohne dass die Gruppe Bestand, Marge oder Lagerdauer sieht. Das ist das größte Steuerungsloch.
2. Rückflüsse kommen heute aus dem Immobilienbestand (G-01 an G-05). Die Holding finanziert sich zusätzlich über Gesellschafterdarlehen; deren Fälligkeiten sind Teil der Liquiditätsplanung.
3. Die Bankfinanzierung hängt an vier Gesellschaften. Zinsbindungsenden dort sind das größte Zinsänderungsrisiko.

## 3. Werttreiberbäume

### 3.1 Immobilien Bestand: Free Cashflow je Objekt
```
Free Cashflow Objekt
├── Ist-Mieteinnahmen
│   ├── Soll-Miete = Σ Fläche × Miete je m²
│   │   ├── Miete je m² (Mieterhöhung § 558, Neuvermietung)
│   │   └── vermietbare Fläche
│   ├── − Leerstand  = Leerstandstage × Tagesmiete
│   └── − Mietrückstand / Ausfall
├── − Bewirtschaftung & Instandhaltung (€/m² p.a.)
└── − Kapitaldienst
    ├── Zinsen = Restschuld × Zinssatz (Zinsbindung!)
    └── Tilgung (Vermögensaufbau, aber Liquiditätsabfluss)
Steuerbar: Miete je m², Leerstandstage, Instandhaltung €/m², Zinssatz/Zinsbindung, Tilgungssatz
Kennzahlen: DSCR = Mietüberschuss / Kapitaldienst; LTV = Restschuld / Marktwert
```

### 3.2 Immobilien Aufteiler: Projektmarge und EK-Bindung
```
Projektergebnis (annualisierte EK-Rendite)
├── Verkaufserlös = Σ verkaufte m² × Verkaufspreis je m²
├── − Einkauf = m² × Einkaufspreis je m² (+ Nebenkosten)
├── − Sanierung = Budget ± Abweichung
├── − Finanzierungskosten = Fremdkapital × Zins × Dauer
└── ÷ EK-Bindung (Höhe × Dauer)
    └── Vermarktungsdauer = Start Vertrieb → letzte Beurkundung
Steuerbar: Einkaufspreis/m², Budgettreue, Verkaufspreis/m², Verkaufstempo (Einheiten/Monat)
```

### 3.3 Baumaschinenhandel: Handelsergebnis
```
Ergebnis Handel = Rohertrag − Finanzierungs- und Lagerkosten
├── Rohertrag je Maschine = Verkaufspreis − (Einkaufspreis + Transport + Aufbereitung)
├── Lagerdauer (Tage) → Finanzierungskosten = Einstand × IC-Zins (3 %) × Tage / 365
├── Lagerumschlag = Wareneinsatz 12 Monate / Lagerwert
└── gebundenes Kapital = Lagerwert zu Einstandspreisen  ⇄  IC-Darlehen der Holding an G-09
Steuerbar: Einkaufspreis, Aufbereitungskosten, Angebotspreis, Zeit bis Inserat, Preisnachlass ab Tag 90
```

### 3.4 Baumaschinen-Plattform: Runway
```
Runway (Monate) = Bankbestand / Burn-Rate
├── Bankbestand = Saldo aller Konten der Plattform
├── Burn-Rate = Ø monatlicher Nettoabfluss der letzten 3 Monate
│   ├── Kosten (Personal, Entwicklung, Marketing)
│   └── − Erlöse (Provisionen, Gebühren aus GMV)
└── Finanzierung durch die Gruppe (IC-Darlehen) verlängert den Runway
Steuerbar: Kosten, Monetarisierung (Take Rate × GMV), Zeitpunkt der nächsten Finanzierung
```

### 3.5 Gruppe: freie Liquidität
```
Freie Liquidität (konsolidiert)
├── Bankguthaben aller Gesellschaften
├── − Mindestliquidität je Gesellschaft (Puffer)
├── ± Planzahlungen 13 Wochen (Mieten, Kapitaldienst, Rechnungen, Projektbudgets)
├── − gebundene Mittel in getrennten Bereichen (Maklergesellschaft)
└── IC-Darlehen und IC-Zinsen werden eliminiert (Geld bleibt in der Gruppe)
```

## 4. Managementfragen je Segment und Rhythmus

| Rhythmus | Gruppe / Holding | Immobilien | Baumaschinen |
|---|---|---|---|
| **täglich** | Wie viel Geld ist heute wo frei? Was ist heute fällig? Was muss ich bestätigen? | Welche Exposés sind neu, welche verfolgen wir? | Was ist verkauft oder reserviert? |
| **wöchentlich** | Unterschreitet eine Gesellschaft in 13 Wochen ihren Puffer? Passt das Eigenkapital für den nächsten Ankauf? | Wer ist im Rückstand? Welche Deals stocken? Welche Fristen laufen (§ 558, § 573c BGB)? | Welche Maschinen stehen über 90 Tage? Wie lange reicht das Geld der Plattform? |
| **monatlich** | Sind alle IC-Zinsen gezahlt? Stimmen Darlehensstände mit der Bank? Welche Daten fehlen noch? | Welches Objekt bleibt hinter Plan? Wie läuft der Abverkauf im Aufteiler? | Rohertrag und Marge der Verkäufe, Lagerumschlag, gebundenes Kapital gegen IC-Darlehen |
| **jährlich** | Welche Darlehen enden oder verlieren die Zinsbindung? Wie konzentriert sind Risiken? | Potenzialmiete, Bewertung, Strategie je Objekt | Weiter finanzieren oder Bestand abbauen? Plattform: nächste Finanzierungsrunde |

## 5. KPI-Set (max. 5 Kern-KPIs je Segment)

Ampel: **Grün** ok · **Gelb** prüfen · **Rot** handeln · **Grau** Daten fehlen.

### Gruppe / Liquidität
| KPI | Formel | Quelle | Ampel |
|---|---|---|---|
| Liquidität heute | Σ Kontosalden ohne getrennte Bereiche | `kontosalden` (camt.053 CLBD) + Umsätze | Grün ≥ 1,5 × Mindestliquidität · Rot < 1,0× · Grau ohne Saldo |
| Liquidität in 13 Wochen / Tiefpunkt | Saldo heute + Planbewegungen | Mieten, Zinspläne, Rechnungen, `planposten` | wie oben |
| Offene Prüffälle | Anzahl, davon rot | alle Module | Rot bei roten Fällen |
| Datenlücken | Anzahl, davon kritisch | Abbildung der Live-Daten | Rot bei kritischen Lücken |
| Freies Eigenkapital | min(Saldo im Horizont) − Mindestliquidität | Planung | informativ |

### Immobilien Bestand
| KPI | Formel | Quelle | Ziel / Ampel |
|---|---|---|---|
| Soll-Miete / Monat | Σ aktive Kaltmieten | Mietverträge | Plan je Objekt |
| Leerstandsquote | leere Einheiten / Einheiten (nach Fläche) | Einheiten | Grün < 3 % · Gelb < 8 % · Rot ≥ 8 % |
| Mietrückstand | Σ (Soll − Ist) fälliger Monate | Abgleich Miete | Grün 0 · Gelb < 1 Monatsmiete · Rot ≥ 2 Monatsmieten je Mieter |
| DSCR je Objekt | (Ist-Miete − Kosten) / Kapitaldienst, 12 Monate | M2 + M3 | Grün ≥ 1,3 · Gelb ≥ 1,1 · Rot < 1,1 |
| Miete je m² vs. Potenzial | Ist-Miete/m² ÷ Ziel-Miete/m² | Mietverträge | Gelb, wenn Erhöhung möglich und > 15 Monate seit letzter |

### Immobilien Aufteiler
| KPI | Formel | Quelle | Ziel / Ampel |
|---|---|---|---|
| Gebundenes EK je Projekt | EK-Einsatz + Ist-Kosten − Verkaufserlöse (min. 0) | Projekte, Umsätze | informativ |
| Budgetabweichung | Ist-Kosten ÷ Budget (anteilig nach Fortschritt) | Rechnungen | Grün ≤ 100 % · Gelb ≤ 110 % · Rot > 110 % |
| Verkaufsstand | verkaufte + reservierte Einheiten / Einheiten | Salesforce | gegen Plan-Verkaufskurve |
| Erwartete Marge | (Plan-Erlös − Einkauf − Budget) ÷ Plan-Erlös | Projekte | Grün ≥ 20 % · Gelb ≥ 12 % · Rot < 12 % |

### Finanzierung / Darlehen
| KPI | Formel | Quelle | Ziel / Ampel |
|---|---|---|---|
| Bankverbindlichkeiten | Σ Restschuld Bankdarlehen | Zinsplan | informativ, je Bank (Konzentration) |
| Fälligkeiten / Zinsbindungsende ≤ 12 Monate | Σ Restschuld mit Ende oder Bindungsende ≤ 12 M | Darlehen | Gelb ≤ 12 M · Rot ≤ 6 M ohne Anschluss |
| Zinsabgleich | gematchte Soll-Zinsen ÷ fällige Soll-Zinsen | Abgleich M2 | Grün 100 % · Gelb ≥ 90 % · Rot < 90 % |
| Ø Zinssatz Bank | volumengewichtet | Darlehen | informativ |
| Offene IC-Zinsen | Σ fällige, nicht gezahlte IC-Zinsen | Abgleich M2 | Gelb > 0 |

### Baumaschinenhandel (G-09)
| KPI | Formel | Quelle | Ampel |
|---|---|---|---|
| Lagerwert | Σ Einstand der Maschinen im Bestand | `maschinen`, `maschinen_kosten` | informativ, gegen IC-Darlehen |
| Ø Lagerdauer | Tage seit Ankauf, Bestand | `maschinen` | Grün < 90 · Gelb < 180 · Rot ≥ 180 |
| Rohertrag und Marge 12 Monate | Σ (Verkaufspreis − Einstand) / Umsatz | `maschinen` | gegen Plan |
| Lagerumschlag | Wareneinsatz 12 M / Lagerwert | `maschinen` | Ziel ≥ 3× |
| Gebundenes IC-Kapital | Restschuld IC-Darlehen an G-09, Zinsen p. a. | `darlehen` | gegen Lagerwert |

### Baumaschinen-Plattform (G-06)
| KPI | Formel | Quelle | Ampel |
|---|---|---|---|
| Bankbestand | Σ Kontosalden | Kontoauszug (Upload oder Saldo manuell) | Grau ohne Saldo |
| Burn-Rate | Ø Nettoabfluss 3 Monate | Umsätze | informativ |
| Runway | Bestand / Burn-Rate | berechnet | Grün ≥ 12 · Gelb ≥ 6 · Rot < 6 Monate |
| Finanzierung durch die Gruppe | Restschuld IC-Darlehen | `darlehen` | informativ |
| Umsatz / GMV | Plattform-Auswertung | **keine Quelle** | erst nach Anbindung |

## 6. Ableitung für die App

| Bereich | Seite | Beantwortet |
|---|---|---|
| Steuerung | **Cockpit** `/` | tägliche Fragen aller Segmente, je Segment 2–4 KPIs |
| Steuerung | **Liquidität** `/board/liquiditaet` | Geld heute, 13 Wochen, 24 Monate, Ankaufs-Szenario |
| Steuerung | **Darlehen** `/board/darlehen` | Fälligkeiten, Zinsabgleich, Matrix Geber × Nehmer, Kontobewegungen |
| Steuerung | **Prüfliste** `/board/pruefliste` | was zu bestätigen ist, inklusive Datenlücken und Abstimmungen |
| Steuerung | **Datenqualität** `/board/daten` | Quelle und Stand je Datenart, Lücken, Eingabe fehlender Werte |
| Immobilien | **Portfolio** `/board/immobilien` | Bestand, Aufteiler, Mieten, Fristen |
| Immobilien | **Transaktionen** `/board/transaktionen` | Ankauf vom Exposé bis Notar, Verkauf von Objekten und Einheiten |
| Immobilien | Offene Exposés, Exposé-Import | Bens Seiten, unverändert |
| Baumaschinen | **Handel & Plattform** `/board/baumaschinen` | Lager, Rohertrag, IC-Kapital, Runway |

## 7. Risiken, die das Board sichtbar machen muss

1. **Fälligkeits- und Zinsbindungsrisiko:** Anschlussfinanzierung bei höherem Zins; Liste aller Enden ≤ 24 Monate mit Zinsdelta (+1 %/+2 %) als Mehrbelastung p.a.
2. **Konzentrationsrisiko:** Anteil einer Bank an Bankverbindlichkeiten; Anteil der größten Gesellschaft an IC-Forderungen der Holding (Matrix Geber × Nehmer).
3. **Liquiditätsengpass je Gesellschaft:** Konsolidiert genug Geld heißt nicht, dass die richtige GmbH zahlen kann; daher Mindestliquidität je Gesellschaft.
4. **Intercompany-Disziplin:** Nicht gezahlte oder nicht gebuchte IC-Zinsen sind steuerlich relevant (verdeckte Gewinnausschüttung/Fremdvergleich).
5. **Aufteiler-Bindung:** Langsamer Verkauf bindet EK und frisst Marge über Finanzierungskosten.
6. **Bürgschaften und Mithaftung:** Gesellschafter- oder Holdingbürgschaften für Objektdarlehen machen Einzelrisiken zu Gruppenrisiken; im Datenmodell als Feld `buergschaft` am Darlehen, Anzeige im Darlehens-Detail und als Summe.
7. **Getrennter Bereich Maklergesellschaft:** eigene Liquidität, nicht in die freie Gruppenliquidität einrechnen.
8. **Blindflug Baumaschinen:** 0,8 Mio. € IC-Mittel ohne Bestandsdaten. Bis zum ersten Import zeigt das Board „Daten fehlen“.
9. **Doppelte Bankbuchungen:** Werden sie mitgezählt, sind Umsätze und Liquidität falsch. Das Board zählt jede Buchung nur einmal (Fingerprint je Konto).

## 8. Abweichungen zum Nachtlauf

**Fällt weg**
- Eigenes Schema `board` mit englischen Tabellen: ersetzt durch Bens `public`-Tabellen plus wenige Ergänzungen.
- Eigene Shell mit Petrol-Design und Dunkelmodus: Das Board läuft in Bens App und Stil, nur Statusfarben kommen dazu.
- Eigener Salesforce-Mock und eigene Darlehensseite neben PR #1.
- „Ankaufspipeline“ als eigener Bereich: jetzt „Transaktionen“ unter Immobilien.
- Ablage v2 in der Hauptnavigation: nur noch Labor (`VITE_BOARD_LABOR=1`).

**Neu**
- Baumaschinen mit Handel und Plattform, Import aus Excel/CSV.
- Datenqualität als eigene Seite, Lücken als Prüffälle, Quelle je KPI.
- Kontosalden aus camt.053, eindeutige Bankbuchungen, Abstimmung Darlehensstand gegen Zinsplan.
- Cockpit ist die Startseite und zeigt die drei Segmente.

**Warum:** Eine App mit einem Datenmodell verhindert, dass Zahlen doppelt gepflegt werden und auseinanderlaufen. Und ohne benannte Quelle ist eine schöne Zahl wertlos.
