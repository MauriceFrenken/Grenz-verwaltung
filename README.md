# Grenz & Co. Verwaltung

Internes Verwaltungsprogramm von Grenz & Co.

## Bereiche

| Bereich | Route | Inhalt |
| --- | --- | --- |
| Übersicht | `/` | Kacheln zu allen Bereichen |
| Offene Exposés | `/exposes` | Exposés aus dem Exposé-Postfach (KI-Analyse) |
| Exposé-Import | `/exposes/import` | Exposé-PDF auslesen und nach Salesforce übertragen |
| Postfach | `/dokumente/pruefordner` | Anhänge aus dem Posteingang prüfen und ablegen |
| Dokumentenablage | `/dokumente/ablage` | OneDrive-Ablage durchsuchen |
| Rechnungsfreigabe | `/dokumente/rechnungsfreigabe` | Eingangsrechnungen prüfen, an DATEV senden |
| EBICS | `/ebics` | Kontoumsätze (camt.053) — nur Gesellschaft Grenz & Co. |
| Einstellungen | `/einstellungen/*` | Benutzer, Integrationen, Audit-Trail |

## Stack

- TanStack Start (React 19, Vite, file-based routing in `src/routes/`)
- Supabase (Auth, Postgres mit RLS, Storage, Edge Functions für Benutzer)
- Microsoft Graph app-only (Postfächer, OneDrive), Salesforce (OAuth PKCE), Anthropic
- Tailwind CSS v4, shadcn/ui
- Deployment auf Vercel (Crons in `vercel.json`)

## Einrichtung

1. `npm ci`
2. `.env.example` nach `.env.local` kopieren und ausfüllen (Vercel: dieselben Variablen).
3. Datenbank: in einem leeren Supabase-Projekt `supabase/migrations/20261023120000_grenz_basis.sql`
   einspielen (`supabase db push` oder SQL-Editor). Die Migration legt die Gesellschaft
   `GC` (Grenz & Co.) an.
4. Edge Functions deployen: `supabase functions deploy invite-benutzer update-benutzer delete-benutzer`
5. Ersten Login anlegen: `node scripts/setup-auth-login.mjs`
6. Auth-Mails: `node scripts/sync-auth-email-templates.mjs`

### Gesellschaft und DATEV

Die DATEV-Upload-Adresse für „An DATEV“ steht in `gesellschaften.datev_postfach`:

```sql
update public.gesellschaften
set datev_postfach = '…@uploadmail.datev.de'
where id = 'GC';
```

### EBICS

Nur für die Gesellschaft Grenz & Co. (`GC`, siehe `src/lib/grenz.ts`); die Datenbank
lässt andere Gesellschaften für EBICS nicht zu. Zugang aus der EBICS-Vereinbarung der Bank:

```sql
insert into public.ebics_kunden
  (gesellschaft_id, partner_id, user_id, host_id, url, bank_name, teilnehmer_name)
values ('GC', '<Kunden-ID>', '<Teilnehmer-ID>', '<Host-ID>', '<EBICS-URL>', '<Bank>', '<Unterzeichner>');

insert into public.bankkonten (iban, gesellschaft_id, bank, zugang)
values ('DE…', 'GC', '<Bank>', 'ebics');

insert into public.ebics_konten (ebics_kunde_id, iban, bic)
select id, 'DE…', '<BIC>' from public.ebics_kunden where gesellschaft_id = 'GC';
```

Danach in der App unter **EBICS**: Initialisieren → INI-Briefe an die Bank → nach
Freischaltung **Freischaltung** → **Umsätze abrufen** (oder täglicher Cron
`/api/cron/ebics-umsaetze`).

### Microsoft 365

Postfächer und OneDrive kommen aus `MICROSOFT_MAILBOX`, `MICROSOFT_POST_MAILBOX`
(optional `MICROSOFT_POST_MAILBOX_ZWEIT`) und `MICROSOFT_ONEDRIVE_USER`. Den Zugriff der
Entra-App auf genau diese Postfächer beschränkt `scripts/microsoft-access-policy.ps1`.

## Befehle

```bash
npm run dev        # Entwicklung auf http://localhost:8080
npm run check      # Typecheck, Tests, Build
npm run lint
```
