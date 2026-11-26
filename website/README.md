# Website grenz-co.de (Relaunch, Vorschau)

Statische Website von Grenz & Co. Immobilienberatung. Unabhängig von der Management-App im Repo-Root.

- `index.html` – Startseite, `karriere.html` – Karriere
- `assets/styles.css` – Gestaltung (Grenz-Blau `#163052`, EB Garamond + Roboto, lokal eingebunden, keine Google-Server)
- `assets/main.js` – Menü, feste Kopfzeile, Bewertungsformular (Vorschau: öffnet vorbereitete E-Mail; Livegang: Salesforce Web-to-Lead)
- `assets/img/` – Bilder als WebP, entsättigt und leicht ins Markenblau eingefärbt

## Vorschau / Deployment

Eigenes Vercel-Projekt mit **Root Directory `website`**, Framework „Other“, kein Build-Befehl.
Bis zur Freigabe: `noindex` (Meta-Tag, `X-Robots-Tag`, `robots.txt`). Die alte Seite bleibt bis dahin unter grenz-co.de online.

## Vor dem Livegang

- Kennzahlen bestätigen (6.000+ Investoren, 100 % unabhängig)
- Case Studies durch freigegebene Transaktionen ersetzen, Stellen eintragen
- Impressum und Datenschutz übernehmen (derzeit Links auf die alte Seite)
- Formular an Salesforce anbinden
- `noindex` entfernen, `robots.txt` öffnen, Domain umziehen
