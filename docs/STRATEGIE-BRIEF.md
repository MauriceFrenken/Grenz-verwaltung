# Strategie-Brief FRENKEN Management Board

Stand: 07.10.2026 · Verbindlich für alle Meilensteine des Boards · Alle Zahlen im Board sind fiktiv.

**Kernthese:** Die FRENKEN-Gruppe ist im Kern eine **Eigenkapital-Allokationsmaschine**. Sie verdient Geld, indem sie Eigenkapital und Bankkredit in Immobilien und Maschinen bindet und über Miete, Wertsteigerung und Handelsmarge zurückholt. Der Engpass ist nicht Ertrag, sondern **freie Liquidität zum richtigen Zeitpunkt in der richtigen Gesellschaft**. Das Board muss deshalb zuerst eine Frage beantworten: *Wie viel Geld ist frei, wo liegt es, und was bindet es in den nächsten Monaten?*

---

## 1. Geschäftsmodell auf einer Seite

| Geschäftsfeld | Wie entsteht Wert | Wo wird Kapital gebunden | Typische Rendite-Logik |
|---|---|---|---|
| **Immobilien Bestand** (Buy-and-hold, je Objekt eine GmbH) | Laufender Mietüberschuss nach Kapitaldienst, Mietsteigerung (§ 558 BGB), Wertsteigerung, Tilgung als Vermögensaufbau | Eigenkapital beim Ankauf (typisch 20–30 % plus Nebenkosten), Instandhaltung, Tilgung | Cashflow-Rendite auf EK; Hebel über Bankdarlehen |
| **Immobilien Aufteiler** (WEG-Aufteilung) | Spanne zwischen Einkauf je m² + Sanierung und Einzelverkauf je m² | EK + Sanierungsbudget bis zum Verkauf der letzten Einheit; Bindungsdauer ist der größte Hebel | Marge pro Projekt, annualisiert über die Bindungsdauer |
| **Baumaschinen** (Gebrauchtmaschinenhandel) | Handelsmarge je Maschine, Umschlagshäufigkeit | Lagerbestand, finanziert über Intercompany-Darlehen der Holding | Rohertrag × Lagerumschlag |
| **Beteiligungen** (Auktionsplattform, Maklergesellschaft) | Optionswert (Plattform), Provisionen (Makler) | Anschubfinanzierung, Burn-Rate der Plattform | Meilenstein-basiert; Makler mit eigener Liquidität |
| **Holding** | Bündelt Liquidität, verteilt sie per Gesellschafter- und IC-Darlehen (meist 3 % p.a.) | Forderungen gegen Töchter | Interne Zinsen, Steuerungsfunktion |

**So what:** Drei Geldkreisläufe laufen gleichzeitig: Mieten (stetig, planbar), Projektverkäufe (klumpig, unsicher im Zeitpunkt) und Maschinenhandel (schnell drehend). Das dichte IC-Darlehensnetz (≈ 50 Verträge) macht die Gruppe flexibel, aber unübersichtlich: Ohne Konsolidierung sieht man Liquidität doppelt und Zinsen, die niemand bucht.

## 2. Werttreiberbäume

### 2.1 Immobilien Bestand: Free Cashflow je Objekt
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

### 2.2 Immobilien Aufteiler: Projektmarge und EK-Bindung
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

### 2.3 Baumaschinen: Handelsergebnis
```
Ergebnis Handel = Rohertrag − Lager- und Finanzierungskosten
├── Rohertrag = Σ (Verkaufspreis − Einkaufspreis)
├── Lagerdauer (Tage) × IC-Zins 3 % auf Bestandswert
└── Umschlag = Umsatz / Ø Lagerbestand
Steuerbar: Einkaufsdisziplin, Lagerdauer, Bestand je Kategorie
```

### 2.4 Gruppe: freie Liquidität
```
Freie Liquidität (konsolidiert)
├── Bankguthaben aller Gesellschaften
├── − Mindestliquidität je Gesellschaft (Puffer)
├── ± Planzahlungen 13 Wochen (Mieten, Kapitaldienst, Rechnungen, Projektbudgets)
├── − gebundene Mittel in getrennten Bereichen (Maklergesellschaft)
└── IC-Darlehen und IC-Zinsen werden eliminiert (Geld bleibt in der Gruppe)
```

## 3. Die 15 wichtigsten Managementfragen

| # | Rhythmus | Frage | Antwort im Board |
|---|---|---|---|
| 1 | täglich | Wie viel Liquidität haben wir heute, je Gesellschaft und konsolidiert? | Cockpit-KPI, `/board/liquiditaet` |
| 2 | täglich | Welche Zahlungen sind heute/diese Woche fällig oder überfällig (Zinsen, Raten, Rechnungen)? | Cockpit „Heute zu tun“ |
| 3 | täglich | Was muss ich prüfen oder bestätigen (unklare Buchungen, Dokumente)? | gemeinsame Prüfliste `/board/pruefliste` |
| 4 | wöchentlich | Unterschreitet eine Gesellschaft in den nächsten 13 Wochen ihre Mindestliquidität? | Liquidität, Warnungen |
| 5 | wöchentlich | Wie viel Eigenkapital ist frei für den nächsten Ankauf, und ab wann? | Liquidität, Szenario „Ankauf“ |
| 6 | wöchentlich | Welche Mieter sind im Rückstand, und wie hoch? | Immobilien, Rückstände |
| 7 | wöchentlich | Welche Fristen laufen (Mieterhöhung Zustimmung, Kündigungen, Auszüge)? | Immobilien, Mieterereignisse |
| 8 | wöchentlich | Wo steht die Ankaufspipeline? | `/board/pipeline` |
| 9 | monatlich | Welche Intercompany-Zinsen sind offen oder nicht gebucht? | Darlehen, Abgleich |
| 10 | monatlich | Welches Objekt bleibt hinter Plan (Miete, Leerstand, Cashflow nach Kapitaldienst)? | Immobilien, Objekt-Cashflow |
| 11 | monatlich | Wo hängt Eigenkapital in Aufteiler-Projekten fest (Budget, Verkaufsstand)? | Immobilien, Aufteiler |
| 12 | monatlich | Wie entwickelt sich der Leerstand, und welche Wohnungen werden frei? | Immobilien, Leerstandsprognose |
| 13 | jährlich/halbjährlich | Welche Darlehen werden in 6–12 Monaten fällig oder verlieren die Zinsbindung? | Darlehen, Fälligkeiten |
| 14 | jährlich | Wie hoch ist unser Zinsänderungsrisiko (Volumen mit auslaufender Bindung × Zinsdelta)? | Darlehen, Zinsbindung |
| 15 | jährlich | Wie konzentriert sind Risiken (Bank, Gesellschaft, Bürgschaften)? | Darlehen, Matrix Geber × Nehmer |

## 4. KPI-Set (max. 5 Kern-KPIs je Feld)

Ampel: **Grün** ok · **Gelb** prüfen · **Rot** handeln.

### Gruppe / Liquidität
| KPI | Formel | Quelle | Ziel / Ampel |
|---|---|---|---|
| Liquidität heute (konsolidiert) | Σ Kontosalden aller Gesellschaften außer getrennten Bereichen | Kontoumsätze (EBICS/Qonto) | Grün ≥ Σ Mindestliquidität × 1,5 · Gelb ≥ 1,0× · Rot < 1,0× |
| Liquidität in 13 Wochen | Saldo heute + Σ Planzahlungen bis T+91 | Planung M4 | wie oben |
| Tiefster Saldo je Gesellschaft (13 W) | min(Tagessaldo) im Horizont | Planung M4 | Rot, wenn < Mindestliquidität |
| Freies Eigenkapital für Ankauf | min(Saldo im Horizont) − Mindestliquidität (konsolidiert) | Planung M4 | informativ, Szenario |
| Offene Prüffälle | Anzahl offener Review-Items, davon rot | alle Module | Gelb > 10 · Rot > 0 rote Fälle älter 7 Tage |

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

### Baumaschinen und Beteiligungen
Heute keine Daten im Board-Scope. Im Board sichtbar über die Liquidität der Gesellschaften und die IC-Darlehen (Bestandsfinanzierung). Kern-KPIs für später: Lagerdauer, Rohertrag je Maschine, Burn-Rate/Runway der Plattform.

## 5. Ableitung für die App

| Seite | Beantwortet Fragen |
|---|---|
| **Cockpit** `/board` | 1, 2, 3, 4, 5 (oben), Kurzfassung 6, 7, 13 |
| **Liquidität** `/board/liquiditaet` | 1, 4, 5 |
| **Darlehen** `/board/darlehen` | 9, 13, 14, 15 |
| **Immobilien** `/board/immobilien` | 6, 7, 10, 11, 12 |
| **Ankaufspipeline** `/board/pipeline` | 5, 8 |
| **Ablage v2** `/board/ablage` | 3 (Dokumente) |
| **Prüfliste** `/board/pruefliste` | 3 |

**Cockpit ganz oben (Reihenfolge nach Häufigkeit der Frage):**
1. Liquidität heute (konsolidiert) · 2. Liquidität in 13 Wochen · 3. Offene Prüffälle · 4. Aktive Darlehen (Restschuld) · 5. Soll-Miete/Monat · 6. Leerstand.

**Warnungen (Cockpit und Prüfliste):**
- Gesellschaft unterschreitet Mindestliquidität im 13-Wochen-Horizont (rot).
- Soll-Zins/Rate fällig und nach 5 Tagen kein passender Umsatz (rot), Betrag abweichend (gelb).
- Darlehen endet oder Zinsbindung läuft in ≤ 6 Monaten aus (rot), ≤ 12 Monaten (gelb).
- Mietrückstand ≥ 2 Monatsmieten (rot), ≥ 1 (gelb).
- Zustimmungsfrist Mieterhöhung läuft in ≤ 14 Tagen ab (gelb); Kündigungs-Fristende in ≤ 30 Tagen (gelb).
- Aufteiler-Budget > 110 % (rot).
- KI-Erkennung mit Konfidenz < 90 % (gelb).

**OKRs später im Board:** Eigene Tabelle `okrs` (Objective, Key Results mit Messgröße aus dem KPI-Set, Zielwert, Quartal, Verantwortlicher). Key Results verweisen auf eine KPI-Definition, sodass der Ist-Wert automatisch aus dem Board kommt (z. B. „Leerstandsquote < 3 % bis Q2“). Darstellung: ein Abschnitt im Cockpit mit Fortschrittsbalken je KR; Review monatlich. Vorschlag für die ersten drei Objectives: *Liquidität planbar machen*, *Bestand auf Potenzialmiete heben*, *Aufteiler-Kapital schneller drehen*.

## 6. Risiken, die das Board sichtbar machen muss

1. **Fälligkeits- und Zinsbindungsrisiko:** Anschlussfinanzierung bei höherem Zins; Liste aller Enden ≤ 24 Monate mit Zinsdelta (+1 %/+2 %) als Mehrbelastung p.a.
2. **Konzentrationsrisiko:** Anteil einer Bank an Bankverbindlichkeiten; Anteil der größten Gesellschaft an IC-Forderungen der Holding (Matrix Geber × Nehmer).
3. **Liquiditätsengpass je Gesellschaft:** Konsolidiert genug Geld heißt nicht, dass die richtige GmbH zahlen kann; daher Mindestliquidität je Gesellschaft.
4. **Intercompany-Disziplin:** Nicht gezahlte oder nicht gebuchte IC-Zinsen sind steuerlich relevant (verdeckte Gewinnausschüttung/Fremdvergleich).
5. **Aufteiler-Bindung:** Langsamer Verkauf bindet EK und frisst Marge über Finanzierungskosten.
6. **Bürgschaften und Mithaftung:** Gesellschafter- oder Holdingbürgschaften für Objektdarlehen machen Einzelrisiken zu Gruppenrisiken; im Datenmodell als Feld `buergschaft` am Darlehen, Anzeige im Darlehens-Detail und als Summe.
7. **Getrennter Bereich Maklergesellschaft:** eigene Liquidität, nicht in die freie Gruppenliquidität einrechnen.

## Abweichungen gegenüber dem Auftrag (bewusst)

- Baumaschinen-Handel und Auktionsplattform erhalten **keine eigene Seite**, weil heute keine Datenquelle existiert und keine Wochenentscheidung davon abhängt, die das Board besser beantwortet als Liquidität und Darlehen. Sie erscheinen als Gesellschaften in Liquidität und Darlehen.
- Die **Prüfliste** wird eine eigene Seite (nicht nur Cockpit-Kasten), weil Frage 3 täglich gestellt wird.
