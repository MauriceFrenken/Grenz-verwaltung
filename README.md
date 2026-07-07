# FRENKEN Verwaltung

Internes Verwaltungsprogramm der FRENKEN Holding GmbH. Diese Anwendung ist der
Bediener-Frontend und die typisierte API-Client-Schicht für drei verbundene
Automatisierungen:

1. **Dokumentenablage** — Outlook → OneDrive, Human-in-the-Loop-Prüfung.
2. **Miet- & NK-Verwaltung** — Objekte, Einheiten, Mietverhältnisse, Sollstellung,
   Zahlungen, Nebenkostenabrechnung.
3. **Transaktionsliste** — Exposé-PDF-Import mit Übernahme in Salesforce.

## Stack

- Vite + React 19, TypeScript strict
- TanStack Router (file-based) für Routing
- Zustand für globalen State
- Plain fetch-basierter, typisierter API-Client
- react-hook-form + zod
- shadcn/ui mit override auf `--radius: 0` (kantiges FRENKEN-Design)
- Tailwind CSS v4, monochromes Theme, nur Light-Mode
- date-fns (de-DE)

## Ordnerstruktur

```
src/
├── api/            Typisierter API-Client (Stubs, ein Modul je Domäne)
├── components/
│   ├── layout/     TopBar, Sidebar, Breadcrumb, PageWrapper, MandantSwitcher, AppShell
│   ├── shared/     DataTable, EmptyState, KpiCard, StatusBadge, ReviewQueue, AuditTrail, PageHeader, LoadingState
│   └── ui/         shadcn Primitive
├── features/
│   ├── dashboard/
│   ├── verwaltung/
│   ├── dokumente/
│   ├── transaktionen/
│   └── einstellungen/
├── hooks/          useApi, useAuth, useMandant, useFilters, usePagination
├── lib/            format, constants, errors, utils
├── routes/         TanStack-Router Route-Dateien (dünne Wrapper um Feature-Pages)
├── store/          Zustand-Stores (auth, mandant, ui)
├── styles.css      Design-System (monochrom, radius 0, Inter)
└── types/          Zentrales Domain-Modell
```

## API-Layer verbinden

Alle Funktionen unter `src/api/` sind **Stubs**:

- Read-Endpunkte liefern leere, typisierte Ergebnisse (`{ items: [], gesamt: 0 }`).
- Mutations werfen `NotImplementedError` aus `src/lib/errors.ts`.

Das Frontend ist so gebaut, dass jede Liste ohne Backend läuft und einen
ordentlichen Empty-/Loading-State zeigt. Um ein echtes Backend anzubinden:

1. `VITE_API_BASE_URL` als Umgebungsvariable setzen (Basis-URL des REST-Backends).
2. In `src/api/<bereich>.ts` die Stub-Rückgaben durch `apiRequest<T>(pfad, options)`
   aus `src/api/client.ts` ersetzen. Signatur der Funktionen bleibt gleich —
   die UI hängt nur an den Typen aus `src/types/`.
3. `getAuthToken()` in `src/api/client.ts` mit der echten Session-Quelle
   verdrahten (z. B. aus dem Auth-Store).

Der optionale Rollen-/Berechtigungs-Layer sitzt in `src/hooks/useAuth.ts` und
`src/store/auth.ts`. Solange `benutzer === null`, verhalten sich Guards
permissiv (UI zeigt Aktionen, aber ohne Backend passiert nichts) — sobald der
`benutzer` gesetzt ist, greifen die rollenbasierten Prüfungen.

## Multi-Mandantenfähigkeit

Der aktive Mandant liegt in `useMandantStore`. Jede Feature-Page
scoped ihre Datenabrufe automatisch über `useMandant()`. Sobald echte
Endpunkte verbunden sind, werden `mandantId`-Filter durchgereicht.

## Design-System

Monochrom, kantig, flach:

- Schwarz `#0A0A0A`, Weiß `#FFFFFF`, Grautöne für Struktur.
- Ecken sind scharf (`--radius: 0`), Struktur kommt aus 1px-Hairlines.
- Ein einziger `--accent` (Standard: Schwarz) — später mit FRENKEN-Brand-
  Farbe befüllbar, ohne Komponenten anzufassen.
- Rot (`--danger`) nur für Rückstände / Fehler.
- Wordmark `FRENKEN Verwaltung` (aus `src/lib/constants.ts`, umbenennbar).

## Skripte

- `bun dev` — Dev-Server
- `bun run build` — Production Build
- `bun run lint`
- `bun run format`