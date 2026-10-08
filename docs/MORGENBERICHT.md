# Morgenbericht Nachtlauf Management Board

Stand 07.10.2026 · Branch `nightly/management-board` · alle Zahlen fiktiv (Seed-Daten „Muster …“)

## 1. Die drei wichtigsten Erkenntnisse (So what?)

1. **Die Liquidität ist in der Summe gut, aber falsch verteilt.** Die Gruppe hat heute rund 4,3 Mio. € frei, trotzdem unterschreitet die Muster Beteiligungs GmbH ab 01.12.2026 ihre Mindestliquidität (Lücke rund 818 Tsd. €), zwei weitere Gesellschaften im 24-Monats-Plan. Konsequenz: Das Board muss Liquidität je Gesellschaft und interne Darlehen zusammen zeigen, nicht nur den Gruppensaldo. Genau das leisten Liquidität (Warnung mit Haupttreiber) und Darlehen (Matrix Geber × Nehmer).
2. **Eigenkapital ist der Engpass, nicht der Deal-Fluss.** Die Pipeline braucht ab Phase „Angebot“ rund 2,8 Mio. € Eigenkapital, frei verfügbar sind rund 1,2 Mio. €. Konsequenz: Ankäufe priorisieren oder Fremdkapital erhöhen. Die Pipeline zeigt deshalb je Deal „passt das Eigenkapital?“ direkt aus der Liquiditätsplanung.
3. **Die Finanzierungsseite hat einen Fälligkeitsberg.** 5 Darlehen mit rund 5,8 Mio. € enden oder verlieren in den nächsten 12 Monaten die Zinsbindung. Darunter das Aufteiler-Darlehen DL-2024-006 (2,0 Mio. €, endfällig 31.03.2027, Bürgschaft Muster Holding 1,0 Mio. €), das laut Planung vor dem Ende des Abverkaufs fällig wird. Konsequenz: Anschlussfinanzierung jetzt verhandeln. Die Fälligkeiten-Ansicht im Darlehensmodul zeigt das Zinsänderungsrisiko je Vertrag.

## 2. Was fertig ist und was nicht

| Meilenstein                   | Stand                | Ergebnis                                                                            |
| ----------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| S0 Strategie-Brief            | fertig               | `docs/STRATEGIE-BRIEF.md`, `docs/ARCHITEKTUR.md`                                    |
| M0 Fundament                  | fertig               | Datenmodell als Migration (nicht angewendet), Repository-Muster, Seed-Daten, Vitest |
| M1 App-Shell und Designsystem | fertig               | `/board`, `/board/design`, Befehlspalette ⌘K, Hell/Dunkel ⌘J                        |
| M2 Darlehen                   | fertig               | Zinsplan, Zinsabgleich, Excel-Import, 10 Spezifikations-Testfälle                   |
| M3 Immobilien                 | fertig               | Soll/Ist-Miete, Fristen § 558/§ 573c BGB, Objekt-Cashflow, Aufteiler-Projekte       |
| M4 Liquidität                 | fertig               | 13 Wochen täglich, 24 Monate monatlich, Warnungen, Ankaufs-Szenario                 |
| M5 Ablage v2                  | fertig (Testbetrieb) | Regeln + KI mit Konfidenz je Feld, Messung gegen 30 fiktive Mails                   |
| M6 Salesforce                 | fertig (Mock)        | Adapter mit External IDs, Kanban, Käufer und Reservierungen                         |
| M7 Cockpit und Prüfliste      | fertig               | 6 Kern-KPIs, Lagebild, Fällig diese Woche, gemeinsame Prüfliste                     |
| M8 Politur                    | fertig               | Tablet 768 px, 1024 px, 1280 px, Hell/Dunkel, Leerzustände bei Filter               |

Nicht gemacht: keine echte Anbindung (Supabase-Tabellen, Microsoft Graph, Salesforce, Bank) und bewusst keine eigene Seite für Baumaschinen und Auktionsplattform (Begründung im Strategie-Brief, Abschnitt „Abweichungen“). Qualität: 78 Tests in 9 Dateien grün, Lint und Typprüfung für neuen Code sauber, Build erfolgreich (`npm run check:board`).

## 3. So startest du das Board

```bash
npm install
npm run board            # http://localhost:8080/board, Demodaten, ohne Anmeldung
npm test                 # alle Fachtests
npm run ablage:messen    # Ablage-v2-Messung, schreibt docs/testdaten/ablage-v2-messbericht.md
npm run check:board      # Lint, Typprüfung, Tests und Build für das Board
```

In einem Container ohne Browser `npm run board -- --host 127.0.0.1` verwenden. Ohne `npm run board` (also ohne `VITE_BOARD_DEMO=1`) verlangt `/board` wie die übrige App eine Anmeldung.

## 4. Die fünf Dinge, die du dir zuerst ansehen solltest

1. **Cockpit** `/board` (`src/modules/cockpit/CockpitSeite.tsx`): Lagebild und „Zu entscheiden“. Stimmt die Reihenfolge der Fragen für deinen Montag?
2. **Liquidität** `/board/liquiditaet` (`src/modules/liquiditaet/logik/liquiditaet.ts`): Ankaufs-Szenario ausprobieren, die Planungsregeln stehen oben in der Logikdatei.
3. **Darlehen** `/board/darlehen` mit Reiter „Fälligkeiten“ und „Geber × Nehmer“ (`docs/modul-darlehen.md`).
4. **Prüfliste** `/board/pruefliste` (`src/modules/pruefliste/logik/pruefliste.ts`): ein Ort für alles, was eine Entscheidung braucht.
5. **Ablage v2 Messung** `/board/ablage`, Reiter „Messung“, und `docs/testdaten/ablage-v2-messbericht.md`.

## 5. Annahmen, die du bestätigen oder korrigieren solltest

- **A1–A8** in `docs/FORTSCHRITT.md` (Push nur dieses Branches, bestehender Stack TanStack Start, Board unter `/board`, Demo-Modus, Gesellschaftsliste, Altbefunde bei Lint/tsc, Paketinstallation mit npm).
- **Liquiditätsplanung:** Bestandsdarlehen werden bei Endfälligkeit prolongiert, Aufteiler-Darlehen aus Verkaufserlösen zurückgeführt. Reservierte Einheiten zahlen nach 45 Tagen, Einheiten im Vertrieb verteilt ab 3 Monaten bis Projektende, Einheiten in Sanierung im letzten Halbjahr. Miete am 3. Werktag, Bewirtschaftung am 15.
- **Pipeline:** Phasen-Wahrscheinlichkeiten (Eingang 5 % bis Notar 90 %), Nebenkosten 8,5 %, Makler 3,57 %, „stockt“ ab 30 bzw. 60 Tagen.
- **Ablage v2:** automatische Ablage erst ab 90 % Konfidenz, Ordnerschema und Dateiname `JJJJ-MM-TT_Dokumenttyp_Objekt-ID_Kurzbeschreibung.pdf`.
- **Salesforce:** Objekt `Real_Estate__c` und die Felder in `docs/salesforce-feldliste.md` sind Vorschläge und müssen mit der echten Org abgeglichen werden.
- **Mindestliquidität** je Gesellschaft ist im Seed gesetzt (z. B. Muster Holding 250 Tsd. €) und sollte von euch festgelegt werden.

## 6. Was für echte Daten nötig ist

| Modul      | Nötig                                                                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alle       | Migration `supabase/migrations/20261007120000_board_kerndatenmodell.sql` prüfen und anwenden, Live-Repository in `src/lib/db/` implementieren, `VITE_BOARD_DATENQUELLE=live`                                     |
| Darlehen   | Darlehensregister per Excel-Import einlesen (Import ist fertig), Kontoumsätze aus dem bestehenden EBICS-Abruf zuordnen                                                                                           |
| Immobilien | Objekte, Einheiten, Mietverträge und Sollstellungen aus der Verwaltung übernehmen                                                                                                                                |
| Liquidität | Kontosalden aus EBICS/Qonto, offene Rechnungen, Planposten und Mindestliquidität je Gesellschaft                                                                                                                 |
| Ablage v2  | Microsoft-Graph-Adapter (`src/lib/integrations/microsoft-graph.ts`) mit eigener App-Registrierung, echter KI-Klassifikator mit API-Schlüssel serverseitig, Messung mit echten (anonymisierten) Mails wiederholen |
| Pipeline   | Salesforce-Verbindung über `src/lib/integrations/salesforce.ts`, Feld `Board_ID__c` als External ID anlegen                                                                                                      |

## 7. Offene Probleme und Risiken

- **Ablage-Messung ist kein Qualitätsnachweis der KI.** Die 97 % Treffer stammen von einer deterministischen Heuristik, und das Testset wurde parallel dazu geschrieben. Gemessen ist nur, dass die Pipeline (Regeln, Schwelle, Benennung, Prüfliste) funktioniert. Vor dem Produktivbetrieb mit echten Mails und echtem Modell neu messen.
- **Planungslogik ist regelbasiert.** Abweichungen der echten Zahlungsrhythmen (z. B. Mieteingänge, Bauabrufe) verändern Tiefpunkte deutlich. Die Regeln sind getestet, aber nicht kalibriert.
- **Dev-Server-Hinweis:** Im Dev-Modus meldet die Konsole eine Hydration-Abweichung der Entwickler-Werkzeuge (`data-tsd-source` in `src/routes/__root.tsx`). Sie kommt aus der bestehenden Vite-Konfiguration, betrifft nur den Dev-Server und nicht den Build.
- **Altbefunde:** `tsc` (17 Fehler) und `eslint` (rund 1.400 Formatierungsbefunde) sind auf `main` bereits rot. Neuer Code ist sauber, Altdateien wurden nicht angefasst.

## 8. Hinweise für Bens Review

- **Umfang:** 10 Commits, rund 100 Dateien, fast alles neu unter `src/modules/`, `src/components/board/`, `src/lib/db/`, `src/lib/integrations/`, `src/lib/ai/` und `docs/`.
- **Änderungen an bestehenden Dateien** (bitte gezielt ansehen): `src/routes/__root.tsx` (`/board` nutzt nach der Session-Prüfung die eigene Board-Shell statt der App-Shell), `src/lib/auth-pfade.ts` (`/board` nur bei `VITE_BOARD_DEMO=1` ohne Anmeldung erreichbar), `src/components/layout/Sidebar.tsx` (Link „Management Board“), `src/styles.css` (Board-Theme unter `.board-theme`), `package.json` (Skripte `board`, `test`, `typecheck`, `check:board`, `ablage:messen` u. a.), neue Hilfsskripte unter `scripts/`.
- **Pakete:** Installation mit npm, `package-lock.json` synchronisiert und um `vitest` ergänzt. `bun.lock` bitte mit `bun install` nachziehen.
- **Nicht angefasst:** produktive Gelb-Ablage (`src/lib/dokument-postfach`, `src/lib/microsoft`), bestehender Salesforce-Exposé-Export (`src/lib/salesforce`), keine Datenbank angewendet, keine `.env` gelesen.
- **Datenbank:** nur die Migrationsdatei im Repo, Schema `board`, nicht angewendet.
- Pull Request #2 (https://github.com/BitBenByte/frenken-expose-ai/pull/2) wurde am 08.10.2026 über die Oberfläche angelegt; kein Push auf `main`. Für Vercel gilt weiter: Commits auf `main` mit Author und Committer BitBenByte.
