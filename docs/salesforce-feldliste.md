# Salesforce-Feldliste (Management Board)

Stand: Nachtlauf `nightly/management-board`. Der Board-Adapter (`src/lib/integrations/salesforce.ts`) läuft im Demo-Modus gegen fiktive Daten. Für den Live-Betrieb muss diese Liste mit der Salesforce-Administration abgeglichen werden. Felder mit **neu** existieren nach heutigem Code-Stand noch nicht in der Org.

Grundsätze:

- **Upsert über External ID** `Board_ID__c` (Text, eindeutig, extern) auf jedem Objekt. Das Board vergibt die IDs (`AK-JJJJ-NNN`, `IM-JJJJ-NNN`, `IM-…-WEnn`), Salesforce-IDs werden zusätzlich in `crm_links` gespeichert.
- REST-Pfad: `PATCH /services/data/v61.0/sobjects/{Objekt}/Board_ID__c/{ID}` (anlegen oder aktualisieren), Lesen per SOQL.
- **Führend:** Salesforce für Ankaufsphase, Makler, Käufer und Reservierungen. Board für Objekt-/Einheiten-Stammdaten, Darlehen, Mieten, Liquidität.
- Der bestehende Exposé-Export (`src/lib/salesforce`) bleibt unverändert und nutzt `Real_Estate__c` bereits; das Board liest dasselbe Objekt.

## Real_Estate__c – Ankaufsobjekte (Pipeline)

| Board-Feld | Salesforce-Feld | Typ | Status |
|---|---|---|---|
| id (`AK-JJJJ-NNN`) | `Board_ID__c` | Text(20), External ID, eindeutig | **neu** |
| name | `Name` | Text | vorhanden |
| strasse | `Street_Name__c` (+ `Street_Number__c`) | Text | vorhanden |
| ort | `City__c` | Text | vorhanden |
| assetKlasse | `Real_Estate_Type__c` | Picklist: Wohnen, Wohn- und Geschäftshaus, Gewerbe | vorhanden, Werte abgleichen |
| einheiten | `Anzahl_Wohnungen__c` | Zahl | vorhanden |
| flaeche | `Wohnfl_che__c` (+ `Gewerbefl_che__c`) | Zahl | vorhanden |
| angebotspreis | `Angebotspreis__c` | Währung | vorhanden |
| jahresnettokaltmiete | `Jahresnettokaltmiete__c` | Währung | vorhanden |
| makler | `Makler__c` | Lookup/Text | vorhanden |
| phase | `Status__c` | Picklist: Neu, In Prüfung, Besichtigung, Angebot abgegeben, Due Diligence, Notartermin, Gekauft, Abgesagt | vorhanden, Werte abgleichen |
| phaseSeit | `Status_seit__c` | Datum (per Flow bei Statuswechsel setzen) | **neu** |
| naechsterSchritt | `Naechster_Schritt__c` | Text(255) | **neu** |
| zielGesellschaftId | `Ziel_Gesellschaft__c` | Picklist/Lookup auf Account | **neu** |
| ekQuote | `EK_Quote__c` | Prozent | **neu** |
| notartermin | `Notartermin__c` | Datum | **neu** |
| strategie | `Strategie__c` | Picklist: bestand, aufteiler | **neu** |
| verantwortlich | `OwnerId` | Lookup User | vorhanden |

## Einheit__c – Aufteiler-Einheiten (**neues Objekt**)

| Board-Feld | Salesforce-Feld | Typ |
|---|---|---|
| unit.id (`IM-JJJJ-NNN-WEnn`) | `Board_ID__c` | Text, External ID |
| propertyId | `Real_Estate__c` | Master-Detail auf Real_Estate__c (über dessen Board_ID__c) |
| label | `Name` | Text |
| area | `Flaeche__c` | Zahl |
| listPrice | `Listenpreis__c` | Währung |
| status | `Vertriebsstatus__c` | Picklist: im Vertrieb, reserviert, verkauft (nur lesend im Board, Abgleich) |

## Transaktion__c – Reservierungen und Kaufverträge

`Transaktion__c` existiert bereits (Exposé-Kontext). Vorschlag: Datensatztyp „Einheitenverkauf“.

| Board-Feld | Salesforce-Feld | Typ | Status |
|---|---|---|---|
| id | `Board_ID__c` | Text, External ID | **neu** |
| unitId | `Einheit__c` | Lookup Einheit__c | **neu** |
| kaeuferId | `Kaeufer__c` | Lookup Contact | **neu** |
| status | `Status__c` | Picklist: Interessent, reserviert, Notartermin, beurkundet, storniert | vorhanden, Werte ergänzen |
| preis | `Kaufpreis__c` | Währung | prüfen |
| datum | `Reservierungsdatum__c` | Datum | **neu** |
| notartermin | `Notartermin__c` | Datum | **neu** |

## Contact – Käufer

| Board-Feld | Salesforce-Feld | Typ |
|---|---|---|
| name | `FirstName`, `LastName` | Standard |
| email | `Email` | Standard |
| finanzierung | `Finanzierungsstatus__c` | Picklist: bestätigt, offen, Barkauf (**neu**) |

## Abgleichsregeln im Board

- Reservierung „reserviert“ oder „Notartermin“ ⇒ Einheit im Board „reserviert“; „beurkundet“ ⇒ „verkauft“. Abweichungen erscheinen als Prüffall (Quelle Salesforce).
- Board „reserviert“/„verkauft“ ohne passende Reservierung im CRM ⇒ Prüffall.
- Ankauf länger als 30 Tage in einer Phase ⇒ gelb, ab 60 Tagen rot; ab Phase „Angebot“ als Prüffall.

## Für den Live-Betrieb nötig

1. Connected App / bestehende OAuth-Verbindung (`src/lib/salesforce/oauth.ts`) serverseitig nutzen; keine Tokens im Browser.
2. Felder oben anlegen, `Board_ID__c` als External ID markieren, Picklist-Werte abgleichen.
3. Flow „Status_seit__c bei Statuswechsel setzen“.
4. `VITE_BOARD_DATENQUELLE=live` erst setzen, wenn `SalesforceLive` implementiert ist (heute wirft er „nicht konfiguriert“).
