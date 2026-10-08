# Datengrundlage FRENKEN Steuerung

Stand 08.10.2026. Ziel: Jede Zahl im Board hat eine **benannte Quelle, einen Stand und eine Abstimmung**. In der App zeigt **Steuerung → Datenqualität** denselben Stand live (Quellen, Lücken, Eingabe fehlender Werte); KPI-Kacheln nennen ihre Quelle im Tooltip.

## 1. Datenlandkarte

| Datenart | Führendes System | Weg in die Datenbank | Rhythmus | Verantwortlich | Status | Nächster Schritt |
|---|---|---|---|---|---|---|
| Gesellschaften | Bens App | Verwaltung → Gesellschaften | bei Änderung | Maurice | vorhanden | – |
| Segmente | Board | `gesellschaften.segment`, Datenqualität | bei Änderung | Maurice | Annahme gesetzt | Zuordnung bestätigen (Frage 1) |
| Mindestliquidität | Board | `gesellschaften.mindestliquiditaet`, Datenqualität | jährlich | Maurice | **Lücke** | je Gesellschaft festlegen |
| Objekte | Bens App | Verwaltung → Objekte | bei Änderung | Verwaltung | **teilweise** (Strategie bei 5 von 7, Kaufpreis/-datum meist leer) | Pflichtfelder nachtragen |
| Einheiten, Flächen | Bens App | Verwaltung → Einheiten | bei Änderung | Verwaltung | vorhanden (O-06, O-07 ohne Einheiten) | Einheiten SBS/IPS anlegen |
| Mieten (Soll) | Bens App | Mietverhältnisse, Sollstellung | monatlich | Verwaltung | vorhanden, Beleg-Prüfung offen | Mietverträge „geprüft“ setzen |
| Mieteingang (Ist) | Bank | EBICS → Sollstellung-Abgleich | täglich | automatisch | vorhanden für G-01 bis G-05 | – |
| Kontoumsätze | Bank | EBICS C53 (camt.053) | täglich (Cron) | automatisch | vorhanden für 14 Konten (G-01 bis G-05); **Dubletten** | Korrektur siehe 2.3 |
| Kontosalden | Bank | **neu:** `kontosalden` aus camt.053 (CLBD) beim EBICS-Abruf; manuell in Datenqualität | täglich | automatisch / Maurice | **Lücke bis zum nächsten Abruf nach Migration** | Migration anwenden |
| Konten ohne EBICS (FB, TAM, SBS, IPS, GC) | Bank | manuell (Saldo), später CSV-Upload oder Qonto-API | wöchentlich | Buchhaltung | **Lücke** | Bank und Zugangsweg klären (Frage 2) |
| Darlehen | Darlehensregister (Excel, OneDrive) → Bens DB | `darlehen`, Import | bei Änderung | Maurice | vorhanden (54) | IPS-Vertrag (Scan) nachtragen |
| Darlehensbewegungen | Bank | Trigger auf `bankbuchungen` → `darlehen_buchungen` | täglich | automatisch | vorhanden, unklare Buchungen in der Prüfliste | unklare Buchungen einordnen |
| Planposten (Steuern, Gehälter, Bauabrufe) | Board | `planposten`, Datenqualität | monatlich | Maurice / Buchhaltung | **Lücke** | wiederkehrende Posten erfassen |
| Offene Rechnungen | Postfach / Rechnungsfreigabe | `rechnung_historie` | täglich | automatisch | vorhanden (Zählung) | Fälligkeit und Betrag in die Planung (später) |
| Exposés | Postfach | `postfach_exposes` | täglich | automatisch | vorhanden (75) | – |
| Ankauf-Pipeline | Board | `ankauf_pipeline` (Übernahme aus Exposé) | laufend | Akquise | leer | Deals übernehmen |
| Transaktionen Salesforce | Salesforce `Transaktion__c` | lesen über Bens Adapter, Verknüpfung per ID | bei Bedarf | Akquise | Verknüpfung vorbereitet | Feld `salesforce_transaktion_id` füllen |
| Einheitenverkauf (Aufteiler) | Board | `einheiten_verkauf` | laufend | Vertrieb | leer | O-02 Vermarktung erfassen |
| Aufteiler-Projektplan | – | **fehlt** | je Projekt | Maurice | **Lücke** | Tabelle siehe 2.6 |
| Maschinen (Handel) | Excel / Warenwirtschaft (unklar) | `maschinen`, Import Excel/CSV | wöchentlich | FB | **Lücke** | Bestand importieren (Frage 3) |
| Plattformzahlen (GMV, Umsatz) | Plattform | – | monatlich | TAM | **Lücke** | Quelle benennen (Frage 4) |

## 2. Lücken und Vorschläge

### 2.1 Kontosalden
`bankauszuege` speichert keine Salden. camt.053 enthält sie. **Umgesetzt:** Der Parser liest den Tagesendsaldo (CLBD), der EBICS-Abruf schreibt ihn zusätzlich in `kontosalden` (Upsert, Fehler werden nur protokolliert, der Abruf läuft unverändert weiter). Bis dahin gilt: Konto ohne Saldo → Kachel grau, Hinweis „Daten fehlen“. Manuelle Salden sind in der Datenqualität erfassbar.

### 2.2 Konten ohne EBICS
EBICS ist nur für G-01 bis G-05 eingerichtet. Für FB, TAM, SBS, IPS und GC fehlt jedes Konto. Übergang: Konto mit Saldo in der Datenqualität erfassen (legt `bankkonten` + `kontosalden` an). Danach je Bank: EBICS beantragen, Qonto-API (falls Qonto) oder CSV-Upload. Ben hat mit `src/lib/bankAuszugParse.ts` bereits einen Parser für Auszüge.

### 2.3 Doppelte Bankbuchungen (Vorschlag für Ben)
**Befund:** 185 Zeilen, 132 eindeutige Fingerprints. Alle 53 Dubletten liegen in verschiedenen Sollstellungsläufen.
**Ursache:** `bestehendeFingerprints()` in `src/lib/ebics/sync.ts` sucht bekannte Fingerprints nur in den Auszügen **desselben Laufs**. Ruft ein neuer Lauf denselben Zeitraum ab, werden die Buchungen erneut gespeichert.
**Board heute:** View `bankbuchungen_eindeutig` (eine Zeile je Konto-IBAN und Fingerprint); die Zahl der ausgeblendeten Dubletten steht in der Datenqualität.
**Vorschlag (Ben entscheidet):**
1. Prüfung über alle Läufe je Konto: Fingerprints aller `bankbuchungen` laden, deren Auszug dieselbe Konto-IBAN hat (IBAN steht im Dateinamen `EBICS C53 {IBAN} …`), alternativ eine Spalte `konto_iban` an `bankbuchungen`.
2. Danach einmalig bereinigen und einen eindeutigen Index `(konto_iban, fingerprint)` anlegen.
3. Achtung: `sollstellung_zuordnungen` und `darlehen_buchungen` zeigen teils auf Dubletten. Beim Bereinigen auf die älteste Buchung umhängen.

### 2.4 Objekt-Stammdaten
Fehlende Strategie, Kaufpreis, Kaufdatum oder PLZ erscheinen je Objekt als Lücke. Ohne Strategie rechnet das Board das Objekt als Bestand.

### 2.5 Mindestliquidität und Planposten
Standard ist „nicht festgelegt“ (keine Annahme). Ohne Wert warnt die Liquidität nicht; Cockpit und Liquidität zeigen das an. Planposten (Steuern, Gehälter, Bauabrufe, Ankäufe) sind in der Datenqualität erfassbar, auch monatlich wiederkehrend.

### 2.6 Aufteiler-Projektplan (Vorschlag)
Für Marge und gebundenes Kapital fehlen Plandaten. Vorschlag für eine spätere Migration:

```sql
create table public.aufteiler_projekte (
  objekt_id text primary key references public.objekte(id),
  ek_einsatz numeric, sanierungsbudget numeric,
  plan_erloes numeric, plan_vertriebsstart date, plan_abschluss date,
  bemerkung text, created_at timestamptz default now(), updated_at timestamptz default now()
);
```
Ist-Kosten kommen aus Rechnungen und Bankbuchungen mit Objektbezug, Erlöse aus `einheiten_verkauf`.

### 2.7 Maschinen und Plattform
Keine Quelle im System. Übergang ist der Import (Steuerung → Baumaschinen → Bestand importieren, Vorlage zum Herunterladen). Plattformzahlen bleiben leer, bis eine Quelle benannt ist.

## 3. Abstimmungen

| Abstimmung | Status | Ergebnis |
|---|---|---|
| Darlehensstand (Ist-Saldo aus `darlehen_stand`) gegen Restschuld laut Zinsplan | **umgesetzt** | Prüffall bei Abweichung > 2 % und > 1.000 € |
| Soll-Zins/-Rate gegen Bankumsatz | umgesetzt (Nachtlauf) | Prüffall, wenn nach 5 Tagen kein Umsatz |
| Soll-Miete gegen Mieteingang | umgesetzt (Rückstände je Mieter) | Prüffall ab einer Monatsmiete |
| Unklare Darlehensbuchungen | umgesetzt | Lücke + Prüffall, Einordnung im Darlehens-Detail |
| IC-Darlehen beidseitig gleich | durch das Datenmodell erfüllt | ein Datensatz je Vertrag, Geber und Nehmer gespiegelt |
| Summe Buchungen gegen Saldoänderung je Auszug | **offen** | braucht Anfangs- und Endsaldo je Auszug (OPBD/CLBD); nach der Migration als nächster Schritt |
| Plan gegen Ist der Liquidität (Monatsrückblick) | **offen** | braucht gespeicherte Planstände; Vorschlag: monatlicher Schnappschuss |

## 4. Fragen an Maurice

Nur Fragen, die sich aus Repo, Datenbank und Salesforce nicht beantworten lassen. Jeweils mit Vorschlag als Standard.

1. **Segmente:** Stimmt die Zuordnung in der Tabelle im Strategie-Brief (G-02, G-03, G-04, G-07, G-08 als Immobilien Bestand)? *Standard: ja, änderbar in der Datenqualität.*
2. **Banken ohne EBICS:** Bei welchen Banken führen FB, TAM, SBS, IPS und GC ihre Konten, und gibt es Online-Zugänge (Qonto, CSV-Export)? *Standard: monatlich Saldo manuell erfassen, EBICS für FB beantragen.*
3. **Maschinenbestand:** Wo wird der Bestand von FRENKEN Baumaschinen heute geführt (Excel, Warenwirtschaft, Portal)? *Standard: Excel-Import mit der Vorlage aus der App.*
4. **Plattform:** Gibt es eine Auswertung zu Umsatz/GMV von TradeAnyMachine? *Standard: nur Liquidität, Burn-Rate und Runway.*
5. **Mindestliquidität:** Welcher Puffer je Gesellschaft? *Standard: zwei Monate Kapitaldienst plus Bewirtschaftung je Immobiliengesellschaft, 50.000 € für die Holding.*
6. **Strategie der Objekte:** O-01, O-03, O-05, O-06 und O-07 haben keine Strategie. *Standard: Bestand.*
7. **EK-Quote bei Ankäufen:** Mit welcher Eigenkapitalquote planen wir? *Standard: 30 % des Kaufpreises plus Nebenkosten.*
8. **Salesforce:** Welche Stufe führt Salesforce, welche das Board? *Standard: Salesforce führt Vermarktung und Status „Auf dem Markt/Verkauft“, das Board führt die Ankaufsstufen bis Notar.*
