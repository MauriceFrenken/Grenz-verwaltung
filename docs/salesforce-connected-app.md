# Salesforce: Connected App für den Grenz-Sync (JWT Bearer Flow)

Der Sync läuft serverseitig ohne Browser-Login. Dafür braucht es eine Connected App mit
Zertifikat und einen eigenen Integrationsuser, der nur Grenz-Datensätze sieht.

## 1. Schlüsselpaar erzeugen (einmalig, lokal)

```bash
openssl req -x509 -sha256 -nodes -days 1095 -newkey rsa:2048 \
  -keyout grenz-sf.key -out grenz-sf.crt -subj "/CN=Grenz App Sync"
```

`grenz-sf.crt` wird in Salesforce hochgeladen. `grenz-sf.key` ist geheim und kommt nur in Vercel
(`SF_PRIVATE_KEY`), nie ins Repo oder in einen Chat.

## 2. Integrationsuser anlegen

Setup → Benutzer → Neu:
- Lizenz: „Salesforce Integration“ (kostenlos, nur API) oder „Salesforce“, falls nicht verfügbar.
- Profil: „Minimum Access - API Only Integrations“.
- Benutzername z. B. `grenz-sync@grenz-co.de.integration`.

Berechtigungssatz „Grenz App Sync“ anlegen und zuweisen:

| Objekt | Lesen | Anlegen | Bearbeiten | Hinweis |
|---|---|---|---|---|
| Mandate__c | ✓ | | ✓ | Status, Preis |
| Real_Estate__c | ✓ | | | |
| Investorprofile__c, Search_Location__c, Location__c | ✓ | | | |
| Account, Contact, Lead | ✓ | ✓ | | Übernahme aus recherche_pool |
| Campaign | ✓ | ✓ | | Vermarktungskampagnen |
| CampaignMember | ✓ | ✓ | ✓ | Käufer-Matching |
| Opportunity | ✓ | | | Record Type Real Estate Broker |
| Task, Event | ✓ | ✓ | | Report-Versand, Postfach-Sync |
| EmailMessage, EmailMessageRelation | ✓ | ✓ | | Postfach-Sync |
| ContentVersion, ContentDocumentLink | ✓ | ✓ | | Exposé/Report am Mandat |

Feldrechte: Lesen auf alle Felder der Objekte oben. Systemberechtigungen: „API aktiviert“,
„Alle Daten anzeigen“ **nicht** vergeben. Sichtbarkeit der Datensätze über Freigaberegeln:
Datensätze mit Owner Sebastian Grenz bzw. „Business Development SG“ für den Integrationsuser
freigeben. Die App filtert zusätzlich selbst (siehe `src/lib/sf-sync/config.ts`).

## 3. Connected App

Setup → App-Manager → Neue verbundene App (bzw. „External Client App“):
- Name: „Grenz App Sync“, Kontakt-E-Mail Maurice.
- OAuth aktivieren, Callback-URL `https://login.salesforce.com/services/oauth2/success` (wird nicht genutzt).
- „Digitale Signaturen verwenden“: `grenz-sf.crt` hochladen.
- OAuth-Bereiche: „Ihre Daten jederzeit verwalten (api)“ und „Anfragen jederzeit durchführen (refresh_token, offline_access)“.
- Speichern, dann „Verwalten“ → Richtlinien bearbeiten: „Zulässige Benutzer: Vom Administrator genehmigte Benutzer sind vorab autorisiert“.
- Unter „Berechtigungssätze“ den Satz „Grenz App Sync“ hinzufügen.
- Consumer Key kopieren (`SF_CLIENT_ID`).

## 4. Vercel-Umgebungsvariablen (Projekt grenz-verwaltung, Production und Preview)

| Variable | Wert |
|---|---|
| `SF_LOGIN_URL` | `https://login.salesforce.com` (oder My Domain) |
| `SF_CLIENT_ID` | Consumer Key der Connected App |
| `SF_USERNAME` | Benutzername des Integrationsusers |
| `SF_PRIVATE_KEY` | Inhalt von `grenz-sf.key` (komplett, mit BEGIN/END-Zeilen) |
| `SF_GRENZ_USER_IDS` | optional, Standard: `005J5000001Uue4IAC,005Jy00000CzIcDIAV` |

Danach neu deployen. In der App unter Einstellungen › Integrationen steht dann
„Connected App (JWT)“; „Alles neu abrufen“ startet den ersten vollen Lauf.

## 5. Zeitplan

Vercel Hobby erlaubt Crons nur einmal am Tag (05:30 UTC, `vercel.json`). Für den
15-Minuten-Takt aus dem Masterplan: entweder Vercel Pro, oder Supabase `pg_cron` ruft
`/api/cron/salesforce-sync` mit `Authorization: Bearer <CRON_SECRET>` auf (Secret im Vault).
Bis dahin: Button „Jetzt abrufen“ in den Integrationen.
