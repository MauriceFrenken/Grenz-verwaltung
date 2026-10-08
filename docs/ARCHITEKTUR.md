# Architektur FRENKEN Management Board

Stand 08.10.2026 (Phase 2: Integration in Bens App).

## Zielbild

Eine App, eine Anmeldung, eine Navigation, ein Datenmodell. Das frühere Board ist jetzt der **Steuerungsteil** von Bens App „FRENKEN Verwaltung“:

- **Startseite `/`** ist das Cockpit. Die Steuerungsseiten liegen weiter unter `/board/*` (stabile Links), laufen aber in Bens `AppShell` (Kopfzeile, Seitenleiste).
- **Seitenleiste** (`src/components/layout/Sidebar.tsx`): Steuerung (Cockpit, Liquidität, Darlehen, Prüfliste, Datenqualität) · Immobilien (Portfolio, Transaktionen, Bens Offene Exposés und Exposé-Import) · Baumaschinen · danach unverändert Verwaltung, Buchhaltung, Dokumente, Einstellungen. Die Einträge der Steuerung kommen aus `src/modules/shell/navigation.ts`.
- **Rahmen der Steuerungsseiten** (`src/modules/shell/BoardRahmen.tsx`): Gesellschaftsfilter, Suche/Befehlspalette (⌘K), Hinweis „Demodaten“.
- **Daten:** ausschließlich Bens Schema `public`. Das Schema `board` aus dem Nachtlauf ist gestrichen.

```
src/
├── components/board/      Bausteine der Steuerung (KPI-Karte mit Quelle, Datentabelle, Status, Detail-Panel, Diagramm)
├── modules/
│   ├── shell/             BoardRahmen, Navigation, Gesellschaftsfilter, Befehlspalette
│   ├── cockpit/           Startseite, Segment-Kennzahlen
│   ├── liquiditaet/       Tagessalden, 13 Wochen / 24 Monate, Szenario Ankauf
│   ├── darlehen/          Zinsplan, Abgleich, Matrix, Kontobewegungen (darlehen_buchungen)
│   ├── immobilien/        Bestand, Aufteiler, Fristen
│   ├── transaktionen/     Ankauf (ankauf_pipeline), Exposé-Eingang, Verkauf
│   ├── baumaschinen/      Handel, Plattform, Import
│   ├── daten/             Datenqualität
│   ├── pruefliste/        gemeinsame Prüfliste, Abstimmungen
│   └── ablage-v2/         Labor
├── lib/db/
│   ├── typen.ts           Datenmodell + zod
│   ├── repository.ts      Interface BoardRepository
│   ├── live/              Supabase: repository.ts (Laden/Speichern), abbildung.ts (reine Abbildung + Lücken)
│   ├── mock/              Musterdaten für Demo und Tests
│   └── config.ts          Auswahl live/mock
└── routes/board.*.tsx, index.tsx
```

## Datenquelle

`boardRepository()` (`src/lib/db/config.ts`):

| Bedingung | Quelle |
|---|---|
| `VITE_BOARD_DATENQUELLE=mock` oder `live` | wie gesetzt |
| `VITE_BOARD_DEMO=1` (`npm run board`) oder Tests | Musterdaten |
| sonst (Produktion) | **live**, Bens Supabase mit der Anmeldung des Benutzers (RLS) |

## Mapping Board-Entität → Tabelle in `public`

| Board | Tabelle / View | Hinweis |
|---|---|---|
| Company | `gesellschaften` | neu: `segment`, `mindestliquiditaet`, `getrennter_bereich` |
| Party | `personen` | Banken als `typ = bank` |
| Property | `objekte` | `strategie` leer → Bestand + Datenlücke |
| Unit | `einheiten` + letzter Stand aus `einheiten_verkauf` | |
| Lease / Tenant | `mietverhaeltnisse` | Mietername aus der Zeile |
| LeaseEvent | `mieterhoehungen` | |
| Loan | `darlehen` + View `darlehen_stand` | Ist-Saldo aus der View hat Vorrang vor dem Zinsplan |
| Darlehens-Kontobewegung | `darlehen_buchungen` | Einordnung unklarer Buchungen im Detail |
| BankAccount | neu `bankkonten` (+ `ebics_konten`/`ebics_kunden`) | `zugang`: ebics, qonto, csv, manuell |
| Kontosaldo | neu `kontosalden` | camt.053 CLBD beim EBICS-Abruf, manuell, Import |
| Transaction | neue View `bankbuchungen_eindeutig` (Fallback `bankbuchungen` + `bankauszuege`) | eine Zeile je Konto und Fingerprint |
| Mietzuordnung | `sollstellung_zuordnungen` → `sollstellung_positionen` | Zuordnung über Fingerprint |
| PlannedPayment | neu `planposten` | |
| Ankauf | `ankauf_pipeline` | neu: `stufe_seit`, `naechster_schritt(_am)`, `strategie`, `ek_quote`, `salesforce_transaktion_id` u. a. |
| Exposé | `postfach_exposes` | Felder aus `felder` (JSON) |
| Objektverkauf | neu `objekt_verkauf` | |
| Einheitenverkauf / Reservierung | `einheiten_verkauf` | |
| Machine / MachineCost | neu `maschinen`, `maschinen_kosten` | ID `BM-JJJJ-NNN` |
| ReviewItem-Status | neu `pruefliste_status` | Fälle selbst werden berechnet, nicht gespeichert |
| Rechnungen | `rechnung_historie` (nur Zählung in Datenstand) | Rechnungsfreigabe-Zahl im Cockpit über Bens Server-Funktion |

Alles Neue steht in `supabase/migrations/20261008120000_board_steuerung.sql` (rein additiv, RLS mit `jwt_darf_schreiben()`).

## Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | Steuerung in Bens AppShell, Cockpit auf `/`, Pfade `/board/*` bleiben | eine App; vorhandene Links bleiben gültig, `/board` leitet auf `/` |
| E2 | Bens Farbwelt als Basis, global nur Statusfarben (ok, warn, bad) ergänzt; Dunkelmodus entfällt | Bens App ist hell und monochrom; zwei Designs nebeneinander wirken wie zwei Produkte |
| E3 | Ein Repository-Interface, Live und Mock | Fachlogik und Oberfläche unabhängig von der Quelle, Tests ohne Datenbank |
| E4 | Abbildung als reine Funktion mit Lückenliste (`abbildung.ts`) | testbar; fehlende Werte werden nicht geschätzt, sondern als Lücke gemeldet |
| E5 | Fehlt die Migration, lädt das Board trotzdem (Fallbacks) und meldet sie als rote Lücke | App bleibt nutzbar, bevor Ben migriert |
| E6 | Dubletten in `bankbuchungen` werden im Board ausgeblendet, Bens Abruf bleibt unverändert | harte Regel: EBICS-Verhalten nicht ändern; Korrekturvorschlag in `docs/DATENGRUNDLAGE.md` |
| E7 | Kontosalden: kleiner Zusatz im EBICS-Abruf (eigener Commit), fehlertolerant | ohne Salden keine echte Liquidität; der Abruf selbst ändert sich nicht |
| E8 | Darlehen: eine Seite `/board/darlehen`, `/verwaltung/darlehen` leitet dorthin | PR #1 und Board zusammengeführt; `src/api/darlehen.ts` bleibt die Schreib-API für Buchungen |
| E9 | Ablage v2 nur mit `VITE_BOARD_LABOR=1` in der Navigation | Gelb-Ablage ist produktiv |
| E10 | Qualitäts-Gate `npm run check:board` | Altbefunde auf `main` bleiben unberührt |
