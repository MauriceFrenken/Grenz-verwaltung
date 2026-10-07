// Zentrales Domain-Modell für FRENKEN Verwaltung.
// Konsistente IDs (Gesellschafts-ID, Objekt-ID) werden modulübergreifend verwendet.

export type GesellschaftId = string;
export type ObjektId = string;
export type EinheitId = string;
export type MietverhaeltnisId = string;
export type MieterId = string;
export type DokumentId = string;
export type TransaktionId = string;
export type BenutzerId = string;

export type ObjektStatus = "aktiv" | "inaktiv" | "in_ankauf" | "verkauft";
export type EinheitStatus = "vermietet" | "leerstand" | "wartung" | "reserviert";
export type EinheitNutzungsart = "wohnen" | "gewerbe" | "garage" | "stellplatz" | "sonstiges";
export type MietverhaeltnisStatus = "aktiv" | "gekuendigt" | "beendet" | "geplant";
export type SollstellungLaufStatus = "offen" | "abgeschlossen" | "storniert";
export type SollstellungPositionStatus =
  | "fehlt"
  | "teilweise"
  | "ausgeglichen"
  | "ueberzahlung"
  | "ohne_iban";
/** @deprecated Alias — alte Domain-Typen; Lauf nutzt SollstellungLaufStatus */
export type SollstellungStatus = SollstellungLaufStatus | "gebucht";
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

/**
 * Stammdaten-Hierarchie: Gesellschaft > Objekt > Einheit > Mietverhältnis.
 * Kennzahlen (Anzahl, Summen, Miete/m², Jahresmiete) kommen berechnet aus den
 * Datenbank-Views und sind daher hier read-only.
 */

export interface Gesellschaft {
  id: GesellschaftId;
  name: string;
  kuerzel: string;
  datevPostfach: string | null;
  datevPostfachBezeichnung: string | null;
  bemerkung: string | null;
  objekteListe: string;
  anzahlObjekte: number;
  anzahlEinheiten: number;
  kaltmiete: number;
  kaltmieteJahr: number;
}

export type GesellschaftEingabe = Pick<
  Gesellschaft,
  "id" | "name" | "kuerzel" | "datevPostfach" | "datevPostfachBezeichnung" | "bemerkung"
>;

export interface Adresse {
  strasse: string;
  plz: string;
  ort: string;
  land: string;
}

export interface Objekt {
  id: ObjektId;
  gesellschaftId: GesellschaftId;
  gesellschaftName: string;
  bezeichnung: string;
  adresse: Adresse;
  status: ObjektStatus;
  bemerkung: string | null;
  einheitenGesamt: number;
  einheitenWohnen: number;
  einheitenStellplatz: number;
  einheitenVermietet: number;
  einheitenLeer: number;
  wohnflaecheM2: number;
  kaltmiete: number;
  kaltmieteJahr: number;
  mieteProM2Wohnen: number | null;
}

export type ObjektEingabe = Pick<
  Objekt,
  "id" | "gesellschaftId" | "bezeichnung" | "adresse" | "status" | "bemerkung"
>;

export interface Einheit {
  id: EinheitId;
  objektId: ObjektId;
  objektBezeichnung: string;
  gesellschaftId: GesellschaftId;
  gesellschaftName: string;
  hausteil: string | null;
  lage: string;
  nutzungsart: EinheitNutzungsart;
  status: EinheitStatus;
  flaecheM2: number | null;
  flaecheAufmassM2: number | null;
  bemerkung: string | null;
  mietverhaeltnisId: MietverhaeltnisId | null;
  mieterName: string | null;
  vertragsbeginn: string | null;
  letzteMieterhoehung: string | null;
  kaltmiete: number;
  nkVorauszahlung: number | null;
  mieteProM2: number | null;
  kaltmieteJahr: number;
}

export type EinheitEingabe = Pick<
  Einheit,
  | "id"
  | "objektId"
  | "hausteil"
  | "lage"
  | "nutzungsart"
  | "status"
  | "flaecheM2"
  | "flaecheAufmassM2"
  | "bemerkung"
>;

export interface Mieter {
  id: MieterId;
  anrede: string | null;
  vorname: string | null;
  nachname: string | null;
  firma: string | null;
  anzeigename: string;
  iban: string | null;
  telefon: string | null;
  eMail: string | null;
  anschrift: string | null;
  bemerkung: string | null;
  anzahlMietverhaeltnisse: number;
}

export type MieterEingabe = {
  id?: MieterId;
  anrede?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  firma?: string | null;
  iban?: string | null;
  telefon?: string | null;
  eMail?: string | null;
  anschrift?: string | null;
  bemerkung?: string | null;
};

export interface Mietverhaeltnis {
  id: MietverhaeltnisId;
  einheitId: EinheitId;
  einheitLage: string;
  hausteil: string | null;
  nutzungsart: EinheitNutzungsart;
  flaecheM2: number | null;
  objektId: ObjektId;
  objektBezeichnung: string;
  gesellschaftId: GesellschaftId;
  gesellschaftName: string;
  mieterId: MieterId | null;
  mieterName: string;
  iban: string | null;
  beginn: string | null; // ISO-Datum
  ende: string | null;
  letzteMieterhoehung: string | null;
  kaltmiete: number;
  nkVorauszahlung: number | null;
  kaltmieteJahr: number;
  mieteProM2: number | null;
  status: MietverhaeltnisStatus;
  bemerkung: string | null;
}

export type MietverhaeltnisEingabe = Pick<
  Mietverhaeltnis,
  | "einheitId"
  | "beginn"
  | "ende"
  | "letzteMieterhoehung"
  | "kaltmiete"
  | "nkVorauszahlung"
  | "status"
  | "bemerkung"
> & { id?: MietverhaeltnisId; mieterId: MieterId };

export interface SollstellungLauf {
  id: string;
  zeitraum: string; // "YYYY-MM"
  gesellschaftId: GesellschaftId | null;
  gesellschaftName: string | null;
  gesellschaftKuerzel: string | null;
  status: SollstellungLaufStatus;
  bemerkung: string | null;
  createdAt: string;
  anzahlPositionen: number;
  sollSumme: number;
  istSumme: number;
  differenzSumme: number;
  anzahlFehlt: number;
  anzahlTeilweise: number;
  anzahlAusgeglichen: number;
  anzahlUeberzahlung: number;
  anzahlOhneIban: number;
  anzahlBankauszuege: number;
}

export interface SollstellungPosition {
  id: string;
  laufId: string;
  mietverhaeltnisId: MietverhaeltnisId;
  mieterName: string;
  iban: string | null;
  einheitId: EinheitId;
  einheitLage: string;
  objektId: ObjektId;
  objektBezeichnung: string;
  gesellschaftId: GesellschaftId;
  gesellschaftName: string;
  kaltmiete: number;
  nkVorauszahlung: number | null;
  sollBetrag: number;
  istBetrag: number;
  differenz: number;
  status: SollstellungPositionStatus;
}

export interface Bankauszug {
  id: string;
  laufId: string;
  gesellschaftId: GesellschaftId;
  gesellschaftName: string;
  gesellschaftKuerzel: string;
  dateiname: string;
  zeitraumVon: string | null;
  zeitraumBis: string | null;
  anzahlBuchungen: number;
  createdAt: string;
}

export interface Bankbuchung {
  id: string;
  bankauszugId: string;
  buchungsdatum: string;
  betrag: number;
  gegenkontoIban: string | null;
  auftraggeberName: string | null;
  verwendungszweck: string | null;
}

export interface SollstellungZuordnung {
  id: string;
  positionId: string;
  bankbuchungId: string;
  betrag: number;
  buchung: Bankbuchung;
}

/** @deprecated — Positionen leben jetzt unter SollstellungPosition */
export interface Sollstellung {
  id: string;
  mietverhaeltnisId: MietverhaeltnisId;
  zeitraum: string;
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
  gesellschaftId: GesellschaftId | null;
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
  gesellschaftId: string;
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
    gesellschaftId: GesellschaftId | null;
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

export type GesellschaftZuweisung = "alle" | "mehrere" | "einzeln";

/** Rollen-Definition aus der Datenbank (System + benutzerdefiniert). */
export interface RollenDefinition {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  rang: number;
  istSystem: boolean;
  gesellschaftZuweisung: GesellschaftZuweisung;
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
  rollen: Array<{ rolle: RolleName; gesellschaftId: GesellschaftId | "*" }>;
}

export type GesellschaftZugriff = GesellschaftId[] | "*";

export interface BenutzerEinladungInput {
  name: string;
  email: string;
  stellenbezeichnung: string;
  rolle: EinladungsRolle;
  gesellschaftZugriff: GesellschaftZugriff;
}

export interface BenutzerUpdateInput {
  id: string;
  name: string;
  stellenbezeichnung: string;
  rolle: EinladungsRolle;
  gesellschaftZugriff: GesellschaftZugriff;
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
  gesellschaftId?: GesellschaftId;
  status?: string;
  von?: string;
  bis?: string;
}


// ------------------------------------------------------------------ Darlehen

export type DarlehenArt = "bank" | "intercompany" | "gesellschafter" | "sonstige";
export type DarlehenStatus = "entwurf" | "aktiv" | "beendet" | "ersetzt";
export type DarlehenHinweis =
  | "überfällig"
  | "vermutlich zurückgezahlt"
  | "Zinsbindung endet"
  | "bald fällig"
  | "Buchung prüfen";
export type DarlehenBuchungTyp =
  | "Auszahlung"
  | "Rückzahlung"
  | "Zinsen"
  | "Tilgung"
  | "Rate"
  | "unklar";

/** Eine Zeile der View `darlehen_stand` inkl. aufgelöster Namen. */
export interface Darlehen {
  id: string;
  art: DarlehenArt;
  status: DarlehenStatus;
  geberId: string | null;
  geberName: string;
  nehmerId: string | null;
  nehmerName: string;
  objektId: string | null;
  objektBezeichnung: string | null;
  betrag: number;
  zinsPa: number | null;
  zinsArt: "fest" | "variabel" | null;
  zinsbindungBis: string | null;
  vertragsdatum: string | null;
  ende: string | null;
  tilgung: string | null;
  rateMonatlich: number | null;
  tilgungMonatlich: number | null;
  nichtAbgerufen: number | null;
  saldoBank: number | null;
  saldoAm: string | null;
  saldoAktuell: number;
  rueckzahlungen: number;
  zinsenLfdJahr: number;
  letzteZinszahlung: string | null;
  letzteBuchung: string | null;
  unklareBuchungen: number;
  zinsenPaRechnerisch: number | null;
  hinweis: DarlehenHinweis | null;
}

export interface DarlehenBuchung {
  id: string;
  darlehenId: string;
  buchungsdatum: string;
  betrag: number;
  seite: "geber" | "nehmer" | "bank";
  typ: DarlehenBuchungTyp;
  zinsAnteil: number | null;
  tilgungAnteil: number | null;
  zuordnung: "auto" | "manuell";
  regel: string | null;
  auftraggeberName: string | null;
  verwendungszweck: string | null;
}
