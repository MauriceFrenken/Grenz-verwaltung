# Fortschritt Nachtlauf Management Board

Branch: `nightly/management-board`

## Meilensteine

- [x] **S0 Strategie-Brief**: `docs/STRATEGIE-BRIEF.md` mit Werttreiberbäumen, 15 Managementfragen, KPI-Set mit Ampeln, Seitenableitung und Risiken. Kernthese: Die Gruppe ist eine EK-Allokationsmaschine, das Board beantwortet zuerst „wie viel Geld ist wo frei“.
- [x] **M0 Fundament**: Datenmodell als Migration (Schema `board`, nicht angewendet), zod-Typen, Repository-Muster (Mock aktiv, Live wirft „nicht konfiguriert“, Umschaltung `VITE_BOARD_DATENQUELLE`), Format- und Kalender-Helfer, Integrations-Gerüste (EBICS, Qonto). Deterministische Seed-Daten: 9 Gesellschaften, 6 Objekte, 61 Einheiten, 41 Mietverträge, 25 Darlehen, rund 1.070 Kontoumsätze über 12 Monate, Vitest eingerichtet.
- [x] **M1 App-Shell und Designsystem**: Eigene Board-Shell unter `/board` mit einklappbarer Seitenleiste, Gesellschaftsfilter, Befehlspalette (⌘K: Seiten, Gesellschaften, Objekte, Darlehen, Mieter), Hell/Dunkel (⌘J) und Petrol-Akzent, ohne die Verwaltung zu verändern. Komponenten KPI-Karte, Datentabelle (sortier-/filterbar, fixierte Kopfzeile), Status-Badge, Leerzustand, Detail-Panel, Skeletons und Zeitreihendiagramm, alle sichtbar unter `/board/design`.
- [x] **M2 Darlehen**: Spezifikation `docs/modul-darlehen.md` mit 10 Testfällen (alle grün), Zinsplan mit Rumpfperioden und drei Zinsmethoden, Abgleich Soll-Zinsen gegen Kontoumsätze mit Ampel, Excel-Import mit Zeilenfehlern und fiktiver Testdatei. Seite `/board/darlehen` mit KPIs, Liste, Zinsabgleich, Matrix Geber × Nehmer, Fälligkeiten mit Zinsänderungsrisiko und Detail-Panel inkl. Zinsplan.
- [x] M3 Immobilien – Objekte mit Leerstand, DSCR, LTV und 12-Monats-Cashflow (Miete, Kosten, Kapitaldienst aus M2), Mietkonten Soll/Ist mit Rückstandsampel, Fristen für Mieterhöhung (§ 558 BGB) und Kündigung (§ 573c BGB) samt Leerstandsprognose sowie Aufteiler-Projekte mit Budget, Verkaufsstand und Marge. Objekt- und Mietvertragsdetail öffnen als Seitenpanel per URL (`?objekt=`, `?mietvertrag=`); 11 Fachtests in `src/modules/immobilien/logik/immobilien.test.ts`.
- [ ] M4 Liquidität
- [ ] M5 Ablage v2
- [ ] M6 Salesforce
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
