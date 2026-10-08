# Morgenbericht Phase 3: Auktionssaal und Wochenrunde

Stand 09.10.2026, 9:00 Uhr · Branch `claude/project-thread-kbwybt` · baut auf PR #3 auf
Hintergrund: `/mnt/project-files/management-board/DISKUSSION-RICHTIGES-BOARD.md` und `PROMPT-PHASE-3-NACHTLAUF.md`

## 1. Drei Erkenntnisse

1. **Das richtige Board für FRENKEN ist ein Wochenrhythmus.** Neu ist die Seite **Wochenrunde**: eine Tagesordnung mit sieben festen Punkten, die sich aus den echten Daten selbst schreibt (Beschlüsse, Geld, Fristen, Transaktionen, Baumaschinen, Immobilien, Datenlücken). Beschlüsse werden mit Verantwortlichem und Termin festgehalten und kommen in jeder Runde wieder, bis sie erledigt sind. Beschlüsse, deren Termin naht oder überschritten ist, stehen außerdem in der Prüfliste.
2. **Die echte Datenbank liefert schon jetzt zwei Punkte für Montag** (gelesen am 08.10.2026):
   - Das Gesellschafterdarlehen DL-2024-009 an G-02 über 350.000 € endet am **31.12.2026**, also in 84 Tagen. Es erscheint in der Wochenrunde unter Fristen.
   - DL-2026-003 (Holding, 20.000 €) hatte sein Ende am **31.03.2026**, steht aber noch auf „aktiv“. Entweder fehlt die Rückzahlung oder der Status ist veraltet.
3. **Ohne die zwei Datenbank-Erweiterungen bleibt „Geld“ grau.** Auf der Datenbank fehlen noch die Erweiterung aus PR #3 (Kontosalden, Mindestliquidität) und die neue für die Beschlüsse. Das Board zeigt das ehrlich als „Daten fehlen“ statt geschätzter Zahlen.

## 2. Was fertig ist

| Meilenstein | Ergebnis |
|---|---|
| M1 Design „Auktionssaal“ | Signal-Orange #FF6600 als einziger Markenakzent, Graphit-Bühne, dunkle Kopfzeile in der ganzen App, große Zahlen, die beim Laden hochzählen, Countdown für Fristen, Los-Karten, Laufband der Bankbuchungen. Alles über Design-Tokens in `src/styles.css`. |
| M2 Cockpit | Drei Antworten auf der Bühne: **Geld** (frei heute, Tiefpunkt 13 Wochen, je Gesellschaft gegen Mindestliquidität), **Risiko** (Fristen ≤ 90 Tage, rote Prüffälle, nächste Fristen mit Countdown), **Kapitalbindung** (wohin die internen Darlehen der Holding fließen, nach Segment). Darunter das Laufband, die Segmente und „Im Saal“ mit den nächsten Losen. |
| M3 Wochenrunde | Seite `/board/runde`, Tagesordnung, Vorschläge für Beschlüsse, Beschlüsse erfassen und abhaken, Druckansicht. |
| M4 Baumaschinen | Kennzahlen auf der Bühne, Balken „Lagerwert deckt x % der Finanzierung durch die Gruppe“, Bestand als Los-Karten nach Standzeit (Tabelle weiterhin umschaltbar). |
| M5 Politur | Alle Steuerungsseiten mit Bühne und Kennzahlen darauf, kantige Karten wie in Bens Design, Designseite `/board/design` aktualisiert, Tablet-Ansicht geprüft. |
| M6 Abnahme | 117 Tests grün (25 davon neu), Lint und Typprüfung ohne neue Fehler, Build erfolgreich. Screenshots in `docs/screenshots/phase-3/`. |

## 3. Screenshots

Mit Musterdaten aus dem Demo-Modus, alle Namen fiktiv.

| Seite | Datei |
|---|---|
| Cockpit vorher | `docs/screenshots/phase-3/vorher-cockpit-1440.jpg` |
| Cockpit nachher | `docs/screenshots/phase-3/cockpit-1440.jpg` |
| Wochenrunde | `docs/screenshots/phase-3/runde-1440.jpg` |
| Baumaschinen | `docs/screenshots/phase-3/baumaschinen-1440.jpg` |
| Tablet | `cockpit-768.jpg`, `runde-768.jpg`, `baumaschinen-768.jpg` |
| übrige Seiten | `liquiditaet`, `darlehen`, `pruefliste`, `daten`, `immobilien`, `transaktionen`, `design` (je `-1440.jpg`) |

## 4. Was Ben tun muss

Datenbank-Erweiterungen in dieser Reihenfolge anwenden (beide rein additiv):

1. `supabase/migrations/20261008120000_board_steuerung.sql` (aus PR #3, noch nicht angewendet)
2. `supabase/migrations/20261009070000_board_wochenrunde.sql` (neu: Tabelle `board_beschluesse` mit RLS nach `jwt_darf_schreiben()`)

Ohne Schritt 2 funktioniert die Wochenrunde, nur das Speichern von Beschlüssen ist gesperrt und die Seite sagt das.

Geänderte Bestandsdateien außerhalb der Steuerung (nur Optik): `src/components/layout/TopBar.tsx` (dunkle Kopfzeile), `Sidebar.tsx` (orange Markierung, Marke im Demo-Modus), `Breadcrumb.tsx`, `src/components/op-admin/OpAdminEinstellungen.tsx` (Symbolfarbe). Gelb-Ablage, EBICS, Sollstellung und Salesforce-Export sind unverändert.

## 5. Annahmen

| # | Annahme | Wie ändern |
|---|---|---|
| A1 | „Overnight Auktion“ ist die 24-Stunden-Händlerauktion von TradeAnyMachine/BuyAnyMachine; deren Orange ist die Akzentfarbe. Die Seite selbst konnte ich nicht öffnen (Netzwerksperre), die Farbe #FF6600 stammt aus den Metadaten der Schwesterseite sellanymachine.com. | Farbe in `src/styles.css` (`--brand`, `--brand-text`) |
| A2 | Die Wochenrunde ist montags, 30 Minuten, Teilnehmer frei. | Logik `rundenDatum()` in `src/modules/runde/logik/runde.ts` |
| A3 | Fristen in der Wochenrunde: 90 Tage; rot unter 30 Tagen. | `tagesordnung()` |
| A4 | Kapitalbindung zählt nur aktive interne Darlehen, deren Geber im Segment Holding ist. | `kapitalbindung()` in `src/modules/cockpit/logik/antworten.ts` |
| A5 | Countdown zeigt Stunden nur in der letzten Woche, darüber ganze Tage. | `src/lib/format/countdown.ts` |

## 6. Starten

```bash
npm install
npm run board          # Demo mit Musterdaten: http://localhost:8080/ und /board/runde
npm run check:board    # Lint, Typprüfung, Tests, Build
```
