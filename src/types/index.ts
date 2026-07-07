// Zentrales Domain-Modell für FRENKEN Verwaltung.
// Konsistente IDs (Mandanten-ID, Objekt-ID) werden modulübergreifend verwendet.

import type { KonfigurierbareRolle } from "@/lib/permissions/registry";

export type MandantId = string;
export type ObjektId = string;
export type EinheitId = string;
export type MietverhaeltnisId = string;
export type DokumentId = string;
export type TransaktionId = string;
export type BenutzerId = string;

export type ObjektStatus = "aktiv" | "inaktiv" | "in_ankauf" | "verkauft";
export type EinheitStatus = "vermietet" | "leerstand" | "wartung" | "reserviert";
export type MietverhaeltnisStatus = "aktiv" | "gekuendigt" | "beendet" | "geplant";
export type SollstellungStatus = "offen" | "gebucht" | "storniert";
export type ZahlungsQuelle = "bankimport" | "manuell" | "verrechnung";
export type Mahnstufe = 0 | 1 | 2 | 3;

export type DokumentStatus = "abgelegt" | "in_pruefung" | "abgelehnt" | "archiviert" | "analysiert";
export type Dokumententyp =
  | "rechnung"
  | "vertrag"
  | "kontoauszug"
  | "expose"
  | "nk_abrechnung"
  | "korrespondenz"
  | "sonstiges";

export type PruefEntscheidung = "bestaetigt" | "neu_zugeordnet" | "abgelehnt" | "offen";
export type SalesforceStatus = "neu" | "in_pruefung" | "verhandlung" | "abgeschlossen" | "verworfen";

export type VerteilerschluesselArt = "flaeche" | "einheiten" | "personen" | "verbrauch" | "individuell";

export interface Mandant {
  id: MandantId;
  name: string;
  kuerzel: string;
  anzahlObjekte: number;
}

export interface Adresse {
  strasse: string;
  plz: string;
  ort: string;
  land: string;
}

export interface Objekt {
  id: ObjektId;
  bezeichnung: string;
  adresse: Adresse;
  mandantId: MandantId;
  anzahlEinheiten: number;
  status: ObjektStatus;
}

export interface Einheit {
  id: EinheitId;
  objektId: ObjektId;
  lage: string;
  flaecheM2: number;
  aktuellesMietverhaeltnisId: MietverhaeltnisId | null;
  aktuellesMietverhaeltnisMieterName: string | null;
  status: EinheitStatus;
}

export interface Mietverhaeltnis {
  id: MietverhaeltnisId;
  mieterName: string;
  einheitId: EinheitId;
  objektId: ObjektId;
  kaltmiete: number;
  nkVorauszahlung: number;
  beginn: string; // ISO-Datum
  ende: string | null;
  status: MietverhaeltnisStatus;
  umlagefaehigeKostenarten: string[];
}

export interface Sollstellung {
  id: string;
  mietverhaeltnisId: MietverhaeltnisId;
  zeitraum: string; // "YYYY-MM"
  sollBetrag: number;
  status: SollstellungStatus;
}

export interface Zahlung {
  id: string;
  datum: string; // ISO-Datum
  betrag: number;
  mietverhaeltnisId: MietverhaeltnisId | null;
  quelle: ZahlungsQuelle;
  verwendungszweck: string;
}

export interface Rueckstand {
  mietverhaeltnisId: MietverhaeltnisId;
  mieterName: string;
  objektId: ObjektId;
  offenerBetrag: number;
  aeltesteOffenePosition: string;
  mahnstufe: Mahnstufe;
}

export interface Kostenart {
  id: string;
  bezeichnung: string;
  umlagefaehig: boolean;
  standardVerteilerschluesselArt: VerteilerschluesselArt;
}

export interface Verteilerschluessel {
  id: string;
  bezeichnung: string;
  art: VerteilerschluesselArt;
}

export interface Kostenposition {
  id: string;
  objektId: ObjektId;
  kostenartId: string;
  betrag: number;
  zeitraumVon: string;
  zeitraumBis: string;
  umlagefaehig: boolean;
  verteilerschluesselId: string;
  belegDokumentId: DokumentId | null;
}

export interface NkAbrechnungErgebnis {
  einheitId: EinheitId;
  mieterName: string;
  vorauszahlungen: number;
  anteilKosten: number;
  differenz: number; // >0 = Nachzahlung, <0 = Guthaben
}

export interface NkAbrechnung {
  id: string;
  objektId: ObjektId;
  zeitraumVon: string;
  zeitraumBis: string;
  erstelltAm: string;
  status: "entwurf" | "freigegeben" | "versendet";
  ergebnisse: NkAbrechnungErgebnis[];
}

export interface Dokument {
  id: DokumentId;
  dateiname: string;
  mandantId: MandantId | null;
  objektId: ObjektId | null;
  kategorieId: string | null;
  transaktionId: TransaktionId | null;
  typ: Dokumententyp;
  datum: string;
  ablageort: string; // OneDrive-Pfad
  status: DokumentStatus;
  kategorieName?: string | null;
  betreff?: string | null;
  absender?: string | null;
  anhangName?: string | null;
  emailText?: string | null;
}

export type DokumentMetadatenKorrektur = {
  mandantId: string;
  objektId: string;
  kategorieId: string;
  dateiname: string;
};

export interface DokumentKategorie {
  id: string;
  name: string;
  beschreibung: string;
}

export interface PruefAufgabe {
  id: string;
  dokumentId: DokumentId;
  dateiname: string;
  absender: string;
  betreff: string;
  emailText?: string | null;
  anhangName?: string | null;
  vorschlag: {
    mandantId: MandantId | null;
    objektId: ObjektId | null;
    typ: Dokumententyp;
    kategorieId: string | null;
    kategorieName: string | null;
  };
  konfidenz: number; // 0..1
  entscheidung: PruefEntscheidung;
  eingegangenAm: string;
}

export interface Transaktion {
  id: TransaktionId;
  objektadresse: string;
  kaufpreis: number | null;
  flaecheM2: number | null;
  einheiten: number | null;
  baujahr: number | null;
  faktor: number | null;
  makler: string | null;
  kontakt: string | null;
  salesforceStatus: SalesforceStatus;
  salesforceLink: string | null;
  exposeDokumentId: DokumentId | null;
}

export interface ExposeImportAufgabe {
  id: string;
  dokumentId: DokumentId;
  extrahiert: {
    objektadresse: string | null;
    kaufpreis: number | null;
    flaecheM2: number | null;
    einheiten: number | null;
    baujahr: number | null;
    faktor: number | null;
    makler: string | null;
  };
  konfidenz: number;
  dublettenHinweis: boolean;
  eingegangenAm: string;
}

export interface AuditEintrag {
  id: string;
  zeitpunkt: string;
  ausloeser: string;
  aktion: string;
  ergebnis: "erfolg" | "warnung" | "fehler";
  bezug: string;
}

export type RolleName =
  | "op_admin"
  | "administrator"
  | "leser"
  | "manager"
  | "mitarbeiter"
  | (string & {});

export type MandantZuweisung = "alle" | "mehrere" | "einzeln";

/** Rollen-Definition aus der Datenbank (System + benutzerdefiniert). */
export interface RollenDefinition {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  rang: number;
  istSystem: boolean;
  mandantZuweisung: MandantZuweisung;
}

/** Rollen, die beim Einladen neuer Benutzer wählbar sind (ohne OP-Admin). */
export type EinladungsRolle = string;

export interface Rolle {
  name: RolleName;
  bezeichnung: string;
  beschreibung: string;
  rang?: number;
  istSystem?: boolean;
}

export interface Benutzer {
  id: BenutzerId;
  name: string;
  email: string;
  initialen: string;
  stellenbezeichnung: string;
  rollen: Array<{ rolle: RolleName; mandantId: MandantId | "*" }>;
}

export type MandantZugriff = MandantId[] | "*";

export interface BenutzerEinladungInput {
  name: string;
  email: string;
  stellenbezeichnung: string;
  rolle: EinladungsRolle;
  mandantZugriff: MandantZugriff;
}

export interface BenutzerUpdateInput {
  id: string;
  name: string;
  stellenbezeichnung: string;
  rolle: EinladungsRolle;
  mandantZugriff: MandantZugriff;
}

export interface Integration {
  id: "microsoft365" | "onedrive" | "salesforce" | "dms" | "datev" | "bank";
  name: string;
  status: "verbunden" | "getrennt" | "fehler";
  letzteSynchronisierung: string | null;
}

export interface Paginated<T> {
  items: T[];
  gesamt: number;
}

export interface Filter {
  suche?: string;
  mandantId?: MandantId;
  status?: string;
  von?: string;
  bis?: string;
}

export type {
  BerechtigungId,
  SeitenBerechtigungId,
  AktionsBerechtigungId,
  KonfigurierbareRolle,
  RolleBerechtigungenMap,
} from "@/lib/permissions/registry";