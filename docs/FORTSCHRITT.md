# Fortschritt Nachtlauf Management Board

Branch: `nightly/management-board`

## Meilensteine

- [x] **S0 Strategie-Brief**: `docs/STRATEGIE-BRIEF.md` mit Werttreiberbäumen, 15 Managementfragen, KPI-Set mit Ampeln, Seitenableitung und Risiken. Kernthese: Die Gruppe ist eine EK-Allokationsmaschine, das Board beantwortet zuerst „wie viel Geld ist wo frei“.
- [ ] M0 Fundament
- [ ] M1 App-Shell und Designsystem
- [ ] M2 Darlehen
- [ ] M3 Immobilien
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
- **A6 Gesellschaften:** 8 Gesellschaften der Gruppe plus die Maklergesellschaft als getrennter Bereich (9 Datensätze).

## Blockiert / offen

(noch nichts)
