## Agenten-Hinweise

Grenz & Co. Verwaltung — Bereiche: Exposés (Offene Exposés, Exposé-Import), Dokumente (Postfach, Dokumentenablage, Rechnungsfreigabe), EBICS, Einstellungen (Benutzer, Integrationen, Audit-Trail). Die Seitenleiste kommt aus `src/components/layout/navigation.ts`.

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

**Git / Vercel:** Commits und Pushes auf `main` immer mit Author **und** Committer `BitBenByte <233641966+BitBenByte@users.noreply.github.com>` (sonst blockiert Vercel Deployment). Env für den Commit setzen, nicht `git config` ändern:

```bash
GIT_AUTHOR_NAME="BitBenByte" \
GIT_AUTHOR_EMAIL="233641966+BitBenByte@users.noreply.github.com" \
GIT_COMMITTER_NAME="BitBenByte" \
GIT_COMMITTER_EMAIL="233641966+BitBenByte@users.noreply.github.com" \
git commit ...
```
