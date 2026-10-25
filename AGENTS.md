## Agenten-Hinweise

Grenz & Co. Verwaltung — Seitenleiste nach dem Vorbild von admin.buyanymachine.com: Hauptmenü (Übersicht, Kennzahlen mit Reitern Wachstum/Liquidität/Markt über `?tab=`), Vermarktung = Käuferseite (Mandate, Investoren), Akquise = Verkäuferseite (Verkäufer), KI-Dokumentenerstellung (KI-Tools aus `src/lib/ki-tools/tools.ts` mit `bereich: "dokumente"`, Routen `/tools/…`), Tools (Exposéanalyse = eingehende Fremd-Exposés unter `/exposes`, Marktkarte, Marktbericht), System (Benutzer, Integrationen, Audit-Trail). Badges kommen aus `navZaehlerFn`. Jedes Mandat ist eine Akte mit Reitern (Überblick, Käufer-Matching, Interessenten, Eigentümer-Report). Der Überblick sucht den Objektordner in der OneDrive-Ablage „Grenz & Co (neu)“ (`src/lib/microsoft/objekt-ablage.ts`, Env `MICROSOFT_OBJEKTE_*`, eigener Tenant möglich), ordnet die Unterlagen ein und erstellt auf Knopfdruck einen KI-Steckbrief mit wörtlichen Belegen. Das Käufer-Matching zeigt intern Ankaufsprofile und Interessenten ähnlicher Mandate, extern aktive Käufer aus dem Markt-Radar (`src/lib/matching/zusatz.ts`). Investoren und Verkäufer zeigen das Markt-Radar (`src/lib/markt-radar`, Cron `/api/cron/markt-radar` täglich, Claude mit Websuche; Funde nur mit belegter Quell-URL). Die Seitenleiste kommt aus `src/components/layout/navigation.ts`; `/ebics`, `/exposes/auswertung` leiten auf Kennzahlen weiter.

Clientseitig gibt es **kein** Rollen-/Rechte-Matrix-System. Alle authentifizierten Benutzer sehen dieselben Seiten und Aktionen. Rollen existieren nur noch als Benutzer-Attribut (Anzeige / Einladen), nicht als UI-Zugriffskontrolle.

### Auth (Sicherheit)

- Session wird vor der App-Shell mit `getUser()` bestätigt (`src/lib/session-pruefen.ts`).
- Geschützte Dokument-Requests werden serverseitig auf `/anmelden` umgeleitet (`src/start.ts` + Root-`beforeLoad`).
- Öffentliche Pfade: `src/lib/auth-pfade.ts`. Daten-/API-Schutz bleibt JWT + Supabase-RLS / Server-Fn-Checks.

### Konfiguration

- Postfächer, OneDrive, Salesforce-Org und App-Origin kommen aus Env (`.env.example`) — keine festen Adressen im Code.
- Datenbank-Schema: `supabase/migrations/20261023120000_grenz_basis.sql`.

### EBICS (Bankabruf)

- Nur Abruf (`C53` / camt.053), keine Zahlungsauslösung.
- Nur für die Gesellschaft Grenz & Co. (`GRENZ_GESELLSCHAFT_ID` in `src/lib/grenz.ts`, DB-Check auf `ebics_kunden`).
- Server-Env `EBICS_MASTER_KEY` (≥16 Zeichen) — nie `VITE_*`, nie in der UI.
- Einmalig: Zugang in `ebics_kunden` eintragen (README) → **EBICS** → Initialisieren → INI-Briefe an die Bank → nach Freischaltung **Freischaltung** → danach **Umsätze abrufen** / Cron `/api/cron/ebics-umsaetze`.
- Details: `src/lib/ebics/bank-handoff.ts`.

**Git / Vercel:** Commits und Pushes auf `main` immer mit Author **und** Committer `MauriceFrenken <338118561+MauriceFrenken@users.noreply.github.com>` (Repo `MauriceFrenken/Grenz-verwaltung`, Vercel Hobby: sonst blockiert Vercel das Deployment). Env für den Commit setzen, nicht `git config` ändern:

```bash
GIT_AUTHOR_NAME="MauriceFrenken" \
GIT_AUTHOR_EMAIL="338118561+MauriceFrenken@users.noreply.github.com" \
GIT_COMMITTER_NAME="MauriceFrenken" \
GIT_COMMITTER_EMAIL="338118561+MauriceFrenken@users.noreply.github.com" \
git commit ...
```
