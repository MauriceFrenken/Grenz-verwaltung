# Übergabe Phase 2: Steuerung in der FRENKEN App

Stand 08.10.2026 · für Maurice (ohne Programmierkenntnisse) und Ben

## Kurz gesagt

Das Management Board ist jetzt **Teil von Bens App** statt eine zweite App daneben. Nach dem Anmelden öffnet sich das **Cockpit**. Links in der Seitenleiste stehen oben die neuen Bereiche **Steuerung**, **Immobilien** und **Baumaschinen**, darunter wie bisher Verwaltung, Buchhaltung, Dokumente und Einstellungen. Alle Zahlen kommen aus Bens Datenbank. Wo Daten fehlen, steht „Daten fehlen“ mit dem nächsten Schritt, keine Schätzung.

## Was neu ist

| Bereich | Seite | Was sie zeigt |
|---|---|---|
| Steuerung | Cockpit | Liquidität heute und in 13 Wochen, offene Prüffälle, je Segment die wichtigsten Kennzahlen, Lagebild, Fälligkeiten |
| Steuerung | Liquidität | Geld je Gesellschaft, Planung 13 Wochen und 24 Monate, Ankaufs-Szenario |
| Steuerung | Darlehen | alle Darlehen, Fristen, Zinsabgleich, Kontobewegungen je Darlehen (vorher „Buchhaltung → Darlehen“) |
| Steuerung | Prüfliste | alles, was bestätigt oder nachgetragen werden muss |
| Steuerung | Datenqualität | woher jede Zahl kommt, was fehlt; hier Kontostand, Mindestliquidität, Segment und Planposten eintragen |
| Immobilien | Portfolio, Transaktionen | Bestand und Aufteiler; Ankauf vom Exposé bis Notar und Verkauf. „Offene Exposés“ und „Exposé-Import“ sind hierher gezogen und funktionieren wie bisher |
| Baumaschinen | Handel & Plattform | Maschinenbestand, Lagerdauer, Rohertrag, Finanzierung durch die Holding; Runway der Plattform. Bestand per Excel importieren |

## Was entfallen ist

- Die eigene Board-Oberfläche mit eigenem Design und Dunkelmodus.
- Das eigene Datenbankschema `board` (wurde nie angewendet).
- Die doppelte Darlehensseite; `/verwaltung/darlehen` leitet auf die neue Seite.
- „Ablage v2“ in der Navigation (bleibt als Labor unter `/board/ablage`, sichtbar mit `VITE_BOARD_LABOR=1`).
- Die Startseite mit Platzhaltern; ihre Zahl „Rechnungsfreigabe“ steht jetzt im Cockpit.

## Was Maurice als Erstes tun sollte

1. **Datenqualität öffnen** und die roten Punkte abarbeiten.
2. **Mindestliquidität** je Gesellschaft eintragen (sonst warnt die Liquidität nicht).
3. Für Gesellschaften ohne EBICS (FB, TAM, SBS, IPS, GC) einen **Kontostand** eintragen.
4. **Maschinenbestand** importieren: Baumaschinen → Bestand importieren → Vorlage herunterladen, ausfüllen, hochladen.
5. Die **Fragen** am Ende von `docs/DATENGRUNDLAGE.md` beantworten.

## Datenlandkarte in Kurzform

| Daten | Quelle | Stand |
|---|---|---|
| Kontoumsätze, Mieteingang | EBICS (G-01 bis G-05), täglich | vorhanden |
| Kontostände | EBICS ab Migration, sonst manuell | **fehlt bis zur Migration** |
| Darlehen | Darlehensregister → Datenbank | vorhanden (54) |
| Objekte, Einheiten, Mieter | Verwaltung | vorhanden, Stammdaten teils lückenhaft |
| Mindestliquidität, Planposten | Datenqualität | **fehlt** |
| Exposés, Ankäufe | Postfach, Transaktionen | Exposés vorhanden, Pipeline leer |
| Maschinen | Import | **fehlt** |
| Plattformzahlen | – | **keine Quelle** |

Ausführlich: `docs/DATENGRUNDLAGE.md`.

## Für Ben: Migrationen

Auf der Datenbank fehlt genau **eine** Migration. Alle anderen neuen Dateien im Ordner `supabase/migrations` sind dort bereits angewendet (geprüft am 08.10.2026 in `supabase_migrations.schema_migrations`) und liegen jetzt nur zusätzlich im Repo, damit Repo und Datenbank übereinstimmen.

| Reihenfolge | Datei | Anwenden? |
|---|---|---|
| – | `20260912175700_rechnung_historie_quelle_index_fix.sql` | nein, bereits angewendet (Drift geschlossen) |
| – | `20261001092024_ebics_letzter_abruf_view.sql` | nein, bereits angewendet |
| – | `20261001093247_sollstellung_abgleich_name_fallback.sql` | nein, bereits angewendet (Datei enthält nur einen Hinweis) |
| – | `20261001093422_sollstellung_abgleich_nachname_match.sql` | nein, bereits angewendet |
| – | `20261002153515_frenken_erweiterung_1_…sql`, `20261002153558_frenken_erweiterung_2_…sql` | nein, bereits angewendet |
| – | `20261007122222` bis `20261007124858` (Darlehen aus PR #1) | nein, bereits angewendet |
| **1** | `20261008120000_board_steuerung.sql` | **ja** |

Was die neue Migration macht (rein additiv): Spalten `segment`, `mindestliquiditaet`, `getrennter_bereich` an `gesellschaften` (Segment wird nur gesetzt, wo leer); neue Tabellen `bankkonten`, `kontosalden`, `planposten`, `objekt_verkauf`, `maschinen`, `maschinen_kosten`, `pruefliste_status`; View `bankbuchungen_eindeutig`; zusätzliche Spalten an `ankauf_pipeline`. RLS nach deinem Muster mit `jwt_darf_schreiben()`.

**Ohne die Migration** läuft die App trotzdem: Das Board nutzt Ausweichwege und zeigt in der Datenqualität „Datenbank-Erweiterung fehlt“.

**Hinweis zur Drift:** Einige ältere Versionsnummern im Repo weichen von denen auf der Datenbank ab, und einzelne Repo-Migrationen (z. B. `rollen_anlegen`, `benutzer_mandanten`) sind auf der Datenbank nicht unter ihrem Namen eingetragen. Das ist älter als dieses Projekt und wurde nicht angefasst; ein `supabase db push` würde sie erneut anwenden wollen. Bitte vor dem nächsten Push mit `supabase migration list` abgleichen.

## Für Ben: geänderte Bestandsdateien

- `src/lib/camt053Parse.ts`, `src/lib/ebics/sync.ts`: Tagesendsaldo lesen und zusätzlich in `kontosalden` speichern (eigene Commits, fehlertolerant; der Abruf selbst ist unverändert).
- `src/components/layout/Sidebar.tsx`, `Breadcrumb.tsx`: neue Bereiche, Darlehen und Transaktionen umgezogen.
- `src/routes/__root.tsx`, `src/lib/auth-pfade.ts`: Steuerung läuft in der AppShell; Demo-Modus gilt für `/` und `/board`.
- `src/routes/index.tsx`: Cockpit statt `DashboardTeaser`.
- `src/routes/verwaltung.darlehen.tsx`: Weiterleitung; `src/features/darlehen/DarlehenPage.tsx` entfernt (Kontobewegungen jetzt im Darlehens-Detail, `src/api/darlehen.ts` unverändert genutzt).
- `src/styles.css`: Board-Theme entfernt, globale Statusfarben ergänzt.

Gelb-Ablage, Sollstellung und Exposé-Export nach Salesforce sind nicht verändert.

## Für Ben: Dubletten in `bankbuchungen`

Ursache und Vorschlag stehen in `docs/DATENGRUNDLAGE.md`, Abschnitt 2.3. Kurz: Die Dublettenprüfung im EBICS-Abruf schaut nur in den aktuellen Lauf. Das Board blendet Dubletten aus; die Korrektur im Abruf entscheidest du.

## Starten und prüfen

- Demo mit Musterdaten ohne Anmeldung: `npm run board` → http://localhost:8080/
- Prüfungen: `npm run check:board` (Lint, Typprüfung ohne neue Fehler, Tests, Build)
- Tests: `npm test`

## Offene Fragen

Siehe `docs/DATENGRUNDLAGE.md`, Abschnitt 4 (acht Fragen mit Standardantwort).
