# Fortschritt Nachtlauf Management Board

Branch: `nightly/management-board`

## Meilensteine

- [x] **S0 Strategie-Brief**: `docs/STRATEGIE-BRIEF.md` mit Werttreiberbäumen, 15 Managementfragen, KPI-Set mit Ampeln, Seitenableitung und Risiken. Kernthese: Die Gruppe ist eine EK-Allokationsmaschine, das Board beantwortet zuerst „wie viel Geld ist wo frei“.
- [x] **M0 Fundament**: Datenmodell als Migration (Schema `board`, nicht angewendet), zod-Typen, Repository-Muster (Mock aktiv, Live wirft „nicht konfiguriert“, Umschaltung `VITE_BOARD_DATENQUELLE`), Format- und Kalender-Helfer, Integrations-Gerüste (EBICS, Qonto). Deterministische Seed-Daten: 9 Gesellschaften, 6 Objekte, 61 Einheiten, 41 Mietverträge, 25 Darlehen, rund 1.070 Kontoumsätze über 12 Monate, Vitest eingerichtet.
- [x] **M1 App-Shell und Designsystem**: Eigene Board-Shell unter `/board` mit einklappbarer Seitenleiste, Gesellschaftsfilter, Befehlspalette (⌘K: Seiten, Gesellschaften, Objekte, Darlehen, Mieter), Hell/Dunkel (⌘J) und Petrol-Akzent, ohne die Verwaltung zu verändern. Komponenten KPI-Karte, Datentabelle (sortier-/filterbar, fixierte Kopfzeile), Status-Badge, Leerzustand, Detail-Panel, Skeletons und Zeitreihendiagramm, alle sichtbar unter `/board/design`.
- [x] **M2 Darlehen**: Spezifikation `docs/modul-darlehen.md` mit 10 Testfällen (alle grün), Zinsplan mit Rumpfperioden und drei Zinsmethoden, Abgleich Soll-Zinsen gegen Kontoumsätze mit Ampel, Excel-Import mit Zeilenfehlern und fiktiver Testdatei. Seite `/board/darlehen` mit KPIs, Liste, Zinsabgleich, Matrix Geber × Nehmer, Fälligkeiten mit Zinsänderungsrisiko und Detail-Panel inkl. Zinsplan.
- [x] M3 Immobilien – Objekte mit Leerstand, DSCR, LTV und 12-Monats-Cashflow (Miete, Kosten, Kapitaldienst aus M2), Mietkonten Soll/Ist mit Rückstandsampel, Fristen für Mieterhöhung (§ 558 BGB) und Kündigung (§ 573c BGB) samt Leerstandsprognose sowie Aufteiler-Projekte mit Budget, Verkaufsstand und Marge. Objekt- und Mietvertragsdetail öffnen als Seitenpanel per URL (`?objekt=`, `?mietvertrag=`); 11 Fachtests in `src/modules/immobilien/logik/immobilien.test.ts`.
- [x] M4 Liquidität – Tagessalden je Konto (Ist) und Planung aus Mieten, Bewirtschaftung, Zinsplänen (Nehmer/Geber gespiegelt), offenen Rechnungen, Planposten, Restbudgets und erwarteten Verkaufserlösen; 13 Wochen täglich, 24 Monate monatlich, je Gesellschaft und konsolidiert mit eliminierten internen Zahlungen, Makler getrennt. Warnungen bei Unterschreitung der Mindestliquidität mit Haupttreiber, Ankaufs-Szenario als zweite Linie samt „tragbarem Eigenkapital“; 14 Tests in `src/modules/liquiditaet/logik/liquiditaet.test.ts` (Annahmen: Bestands-Endfälligkeiten prolongiert, Aufteiler-Darlehen aus Verkäufen zurückgeführt, Einheiten in Sanierung im letzten Halbjahr vor Planende verkauft).
- [x] M5 Ablage v2 – Zweistufig: Regeln (IDs, Bank-Referenzen, eindeutige Schlüsselwörter) und danach eine KI mit strukturierter Ausgabe (`kiAntwortSchema`, im Demo eine deterministische Heuristik) mit Konfidenz je Feld; unter 90 % landet der Vorschlag auf der Prüfliste, Benennung `JJJJ-MM-TT_Dokumenttyp_Objekt-ID_Kurzbeschreibung`. `npm run ablage:messen` misst gegen 30 fiktive Mails (docs/testdaten/ablage-testset.json): 97 % Treffer, 19 automatisch ohne Fehlablage, 11 zur Prüfung; die bestehende Gelb-Ablage (`src/lib/dokument-postfach`, `src/lib/microsoft`) ist unberührt.
- [x] M6 Salesforce – Board-Adapter `src/lib/integrations/salesforce.ts` mit Mock und Live-Gerüst (REST, Upsert über External ID `Board_ID__c` auf `Real_Estate__c`), getrennt vom bestehenden Exposé-Export. `/board/pipeline` zeigt die Ankäufe als Kanban nach Phase mit Faktor, EK-Bedarf und „passt das Eigenkapital?“ aus der Liquiditätsplanung sowie Käufer und Reservierungen je Aufteiler-Einheit mit Statusabgleich; Feldliste in docs/salesforce-feldliste.md, 8 Tests.
- [ ] M7 Cockpit
- [ ] M8 Politur
- [ ] Morgenbericht

## Annahmen

- **A1 Push:** Abweichend von „niemals git push“ wird ausschließlich `nightly/management-board` gepusht (kein main, kein Force-Push, kein PR). Grund: Die Sitzung läuft in einem Cloud-Container, der nach Inaktivität gelöscht wird. Von Maurice am 07.10.2026 bestätigt.
- **A2 Stack:** Das Repo nutzt TanStack Start statt Next.js. Es wird der bestehende Stack verwendet (Leitplanke „bestehenden Stack weiterverwenden“).
- **A3 Fehlende Vorgaben:** `CLAUDE.md`, `docs/`, `.claude/settings.json`, `docs/modul-darlehen.md` und `docs/testdaten/testdaten_darlehensregister.xlsx` existieren nicht im Repo. Die Darlehens-Spezifikation inkl. 10 Testfällen wird deshalb selbst geschrieben (`docs/modul-darlehen.md`), die Excel-Testdatei mit fiktiven Daten per Skript erzeugt. Ohne `.claude/settings.json` gelten die übrigen harten Regeln als Befehlsgrenze.
- **A4 Altbefunde:** `tsc` (17 Fehler) und `eslint` (~1.400 Prettier-Befunde) sind auf `main` bereits rot. Die Checks „grün“ werden für neuen Code gemessen (`npm run check:board`), Altdateien bleiben unangetastet.
- **A5 Paketinstallation:** `bun.lock` verweist teils auf eine nicht erreichbare Lovable-Registry. Installiert wurde mit `npm`; `package-lock.json` wurde dabei synchronisiert (fehlendes `lru-cache`) und um `vitest` ergänzt. `bun.lock` bleibt unverändert, Ben sollte es mit `bun install` nachziehen.
- **A7 Board-Bereich:** Das Board liegt unter `/board`, die bisherige Startseite `/` bleibt die Verwaltung. In der alten Seitenleiste gibt es einen Link „Management Board“. `/design` liegt als `/board/design` vor.
- **A8 Demo-Modus:** `npm run board` startet die App mit `VITE_BOARD_DEMO=1` und Dummy-Supabase-Werten; nur dann ist `/board` ohne Anmeldung erreichbar.
- **A6 Gesellschaften:** 8 Gesellschaften der Gruppe plus die Maklergesellschaft als getrennter Bereich (9 Datensätze).

## Blockiert / offen

(noch nichts)
