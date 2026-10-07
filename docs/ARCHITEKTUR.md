# Architektur FRENKEN Management Board

## Ist-Stand (07.10.2026)

- **Stack:** TanStack Start (React 19, Vite 8, file-based Routing), TypeScript strict, Tailwind CSS v4, shadcn/ui (Radix), Zustand, TanStack Query, Recharts, cmdk, sonner, zod, date-fns. Deployment auf Vercel (Nitro). **Kein Next.js**: Der Auftrag nennt Next.js App Router; es gilt die Leitplanke „bestehenden Stack weiterverwenden“.
- **Bestehende App „FRENKEN Verwaltung“:** Verwaltung (Gesellschaften, Objekte, Einheiten, Mieter, Mietverhältnisse, Sollstellung mit EBICS-Abruf), Dokumente (Postfach, Gelb-Ablage, Rechnungsfreigabe), Transaktionen (Exposé-Import nach Salesforce), Einstellungen. Daten in Supabase (Schema `public`, deutsche Tabellennamen), Auth über Supabase, Session-Prüfung vor der App-Shell.
- **Produktiv:** Gelb-Ablage (Outlook → OneDrive, Cron `/api/cron/postfach-analyse`), EBICS-Abruf. Diese Teile werden vom Board **nicht verändert**.
- **Qualitäts-Basis:** `npm run build` grün. `tsc --noEmit` hat 17 vorhandene Fehler in 7 Altdateien, `eslint .` meldet ~1.400 vorhandene Prettier-Befunde. Tests gab es keine.

## Zielbild

Das Management Board ist ein **eigener Bereich `/board`** in derselben App, mit eigener Shell (Seitenleiste, Gesellschaftsfilter, Suche, Befehlspalette, Hell/Dunkel). Die Verwaltung bleibt unverändert unter ihren Pfaden erreichbar; ein Link in der alten Seitenleiste führt ins Board.

```
src/
├── components/board/      Designsystem des Boards (KPI-Karte, Datentabelle, Status-Badge, Leerzustand, Detail-Panel, Diagramm)
├── modules/
│   ├── shell/             BoardShell, Seitenleiste, Gesellschaftsfilter, Befehlspalette, Theme
│   ├── darlehen/          Zinsplan, Abgleich, Excel-Import, Matrix, Seiten
│   ├── immobilien/        Soll/Ist-Miete, Fristen (§ 558, § 573c BGB), Objekt-Cashflow, Aufteiler
│   ├── liquiditaet/       Tagessalden, Planung 13 W / 24 M, Konsolidierung, Szenario
│   ├── ablage-v2/         Regeln → KI → Konfidenz, Benennung, Messung
│   ├── pipeline/          Ankaufspipeline, Käufer/Reservierungen (Salesforce)
│   ├── pruefliste/        gemeinsame Prüfliste aller Module
│   └── cockpit/           Startseite
├── lib/
│   ├── db/                Typen + zod-Schemas, Repository-Interfaces, Mock (Seed), Live (Gerüst), Konfiguration
│   ├── integrations/      microsoft-graph, ebics, qonto, salesforce, excel (je Interface + Mock + Live-Gerüst)
│   ├── ai/                Klassifikation mit strukturierter Ausgabe, Konfidenz, Mock deterministisch
│   └── format/            de-DE: Beträge, Datum, Prozent, Fläche
└── routes/board.*.tsx     dünne Routen-Wrapper
supabase/migrations/20261007120000_board_kerndatenmodell.sql   Schema `board` (nicht angewendet)
```

## Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | Board unter `/board/*` statt Ersatz der Startseite | Bestehende Funktionen bleiben unberührt (harte Regel 3); Ben kann später entscheiden, `/` umzuleiten. |
| E2 | Eigenes DB-Schema `board` mit englischen Tabellennamen | Keine Kollision mit den produktiven deutschen Tabellen (`objekte`, `darlehen` …). Abbildung auf Bestandstabellen ist eine spätere Entscheidung (siehe Morgenbericht). |
| E3 | Repository-Muster: `BoardRepository`-Interface, `MockRepository` (Seed, aktiv) und `LiveRepository` (wirft „nicht konfiguriert“); Umschaltung nur über `VITE_BOARD_DATENQUELLE` (`mock` Standard, `live`). | App läuft sofort; echte Anbindung wird eingesteckt, ohne UI anzufassen. |
| E4 | Fachlogik als reine Funktionen in `src/modules/*/logik/` mit Vitest-Tests | Prüfbar ohne UI und DB; Stichtag wird immer als Parameter übergeben. |
| E5 | Seed-Daten deterministisch (eigener PRNG, fester Seed) relativ zum Stichtag | Gleiche Daten bei jedem Start, Fristen bleiben „aktuell“. |
| E6 | Demo-Modus `VITE_BOARD_DEMO=1` macht `/board` ohne Anmeldung erreichbar, startet mit Dummy-Supabase-Werten (`npm run board`) | Lokales Ansehen ohne Zugangsdaten und ohne `.env`. In Produktion ist `/board` wie alles andere geschützt. |
| E7 | Theme des Boards über Klasse `board-theme` (und `dark`) an `<html>`, nur solange das Board offen ist | Portale (Sheet, Dialog, Befehlspalette) erben die Farben; Verwaltung bleibt monochrom/kantig. |
| E8 | Akzentfarbe dunkles Petrol `oklch(0.42 0.07 205)`; Status Grün/Gelb/Rot nur für Bedeutung | Vorgabe Design. |
| E9 | Qualitäts-Gates für Neues: `npm run check:board` = ESLint auf neuen Pfaden, `tsc` ohne neue Fehler (Altfehler-Liste in `scripts/typecheck-board.mjs`), `vitest run`, `vite build` | Altbefunde sind nicht Teil des Auftrags und dürfen nicht anfassen werden (Risiko für Produktivfunktionen). |
| E10 | Live-Adapter liegen nur als Gerüst vor, Secrets nur serverseitig, nie `VITE_*` | Regel aus `AGENTS.md` und `.cursor/rules`. |

## Datenmodell (Schema `board`)

`companies` → `bank_accounts` → `transactions`; `parties` (Personen, Banken, Externe); `properties` → `units` → `leases` (→ `tenants`) → `lease_events`; `loans` → `interest_schedule`; `invoices`; `documents` (nur Link nach OneDrive); `review_items` (gemeinsame Prüfliste); `crm_links` (Salesforce External IDs); zusätzlich `projects` (Aufteiler) und `planned_payments` (manuelle Planposten).

Grundprinzip: **Jeder Vertrag erzeugt Soll-Zahlungen** (Mietvertrag → Soll-Miete, Darlehen → Zinsplan, Rechnung → Fälligkeit). **Jeder Umsatz wird einer Soll-Zahlung zugeordnet.** Abweichungen landen in `review_items`.
