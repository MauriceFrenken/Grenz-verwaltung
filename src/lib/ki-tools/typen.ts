/**
 * Datenmodell der KI-Tools. Jede Angabe trägt ihren Beleg: Zitat aus einer Unterlage (Seite geprüft),
 * Web-Quelle (URL aus der Websuche), Vorgabe des Nutzers, Berechnung oder eine offen markierte Annahme.
 */

export type Beleg =
  | { art: "dokument"; unterlage: string; seite: number; zitat: string }
  | { art: "web"; url: string; titel: string | null }
  | { art: "nutzer"; hinweis: string }
  | { art: "berechnung"; hinweis: string }
  | { art: "annahme"; hinweis: string };

export type Angabe<T> = {
  wert: T | null;
  beleg: Beleg | null;
  /** true = Beleg geprüft (Zitat steht auf der Seite, URL aus Websuche, Nutzervorgabe, Berechnung). */
  geprueft: boolean;
};

export const leer = <T>(): Angabe<T> => ({
  wert: null,
  beleg: null,
  geprueft: false,
});

/** Unterlage mit Seitenmarken <<<PAGE n>>> (PDF-Seite oder Excel-Blatt). */
export type Unterlage = {
  id: string;
  name: string;
  text: string;
  seiten: number;
};

export type Nutzung =
  | "Wohnen"
  | "Gewerbe"
  | "Stellplatz"
  | "Garagenstellplatz"
  | "Sonstiges";

export const NUTZUNGEN: Nutzung[] = [
  "Wohnen",
  "Gewerbe",
  "Stellplatz",
  "Garagenstellplatz",
  "Sonstiges",
];

export type Mieteinheit = {
  lage: string;
  mieter: string;
  nutzung: Nutzung;
  belegung: "vermietet" | "leer";
  flaeche: number | null;
  kaltmieteIst: number | null;
  kaltmieteSoll: number | null;
  betriebskosten: number | null;
  heizkosten: number | null;
  /** ISO JJJJ-MM-TT oder null */
  vertragBeginn: string | null;
  laufzeit: string;
  info: string;
  beleg: Beleg | null;
  geprueft: boolean;
};

export type Objekt = {
  objektart: Angabe<string>;
  strasse: Angabe<string>;
  plz: Angabe<string>;
  ort: Angabe<string>;
  stadtteil: Angabe<string>;
};

export type MieterlisteDaten = {
  objekt: Objekt;
  kaufpreis: Angabe<number>;
  einheiten: Mieteinheit[];
};

export type KaufpreisDaten = {
  objekt: Objekt;
  flaecheWohnen: Angabe<number>;
  flaecheGewerbe: Angabe<number>;
  mieteMonatIst: Angabe<number>;
  mieteMonatSoll: Angabe<number>;
  marktmieteWohnen: Angabe<number>;
  marktmieteGewerbe: Angabe<number>;
  basisKaufpreis: Angabe<number>;
  schritt: Angabe<number>;
};

export type DcfDaten = {
  objekt: Objekt;
  kaufpreis: Angabe<number>;
  flaeche: Angabe<number>;
  mieteJahrIst: Angabe<number>;
  /** Jahresmiete bei Marktmiete (Zielmiete nach Neuvermietung). */
  mieteJahrMarkt: Angabe<number>;
  einheiten: Angabe<number>;
  mietsteigerung: Angabe<number>;
  anpassungJahre: Angabe<number>;
  mietausfall: Angabe<number>;
  verwaltungProEinheit: Angabe<number>;
  instandhaltungM2: Angabe<number>;
  nichtUmlagefaehig: Angabe<number>;
  kostensteigerung: Angabe<number>;
  diskontierung: Angabe<number>;
  exitFaktor: Angabe<number>;
  haltedauer: Angabe<number>;
  grunderwerbsteuer: Angabe<number>;
  notarGrundbuch: Angabe<number>;
  makler: Angabe<number>;
};

export type Erreichbarkeit = {
  ziel: string;
  minuten: number | null;
  verkehrsmittel: string;
  beleg: Beleg | null;
  geprueft: boolean;
};

export type ExposeDaten = {
  objekt: Objekt;
  /** Zeilen der Titelbox, z. B. „Entwicklungsobjekt im Severinsviertel“. */
  titelzeile: Angabe<string>;
  kaufpreis: Angabe<number>;
  mieteJahrIst: Angabe<number>;
  mieteJahrSoll: Angabe<number>;
  vermietungsstand: Angabe<number>;
  provision: "kaeufer" | "provisionsfrei";
  grundstueck: Angabe<number>;
  bodenrichtwert: Angabe<string>;
  flaecheGesamt: Angabe<number>;
  wohneinheiten: Angabe<number>;
  flaecheWohnen: Angabe<number>;
  gewerbeeinheiten: Angabe<number>;
  flaecheGewerbe: Angabe<number>;
  sonstigeFlaechen: Angabe<number>;
  stellplaetze: Angabe<number>;
  baujahr: Angabe<string>;
  geschosse: Angabe<string>;
  bauweise: Angabe<string>;
  geschossdecken: Angabe<string>;
  fenster: Angabe<string>;
  heizsystem: Angabe<string>;
  energietraeger: Angabe<string>;
  baujahrHeizung: Angabe<string>;
  balkone: Angabe<string>;
  aufzug: Angabe<string>;
  dachgeschoss: Angabe<string>;
  denkmalschutz: Angabe<string>;
  besonderheiten: Angabe<string>[];
  mieter: Mieteinheit[];
  erreichbarkeit: Erreichbarkeit[];
  mikrolage: Angabe<string>;
  ausweistyp: Angabe<string>;
  energiekennwert: Angabe<string>;
  effizienzklasse: Angabe<string>;
};

export type Vergleichsobjekt = {
  adresse: string;
  objektart: string;
  flaeche: number | null;
  mieteJahr: number | null;
  preis: number | null;
  preisart: "kauf" | "angebot";
  datum: string | null;
  einordnung: string[];
  beleg: Beleg | null;
  geprueft: boolean;
};

export type EinschaetzungObjekt = {
  bezeichnung: string;
  /** Adresse der Liegenschaft (für Vergleichssuche und Geokodierung). */
  objekt?: Objekt;
  grundstueck: Angabe<number>;
  wohneinheiten: Angabe<number>;
  gewerbeeinheiten: Angabe<string>;
  flaecheWohnen: Angabe<number>;
  flaecheGewerbe: Angabe<number>;
  mieteJahrIst: Angabe<number>;
  mieteJahrSoll: Angabe<number>;
  mieteM2Wohnen: Angabe<number>;
  mieteM2Gewerbe: Angabe<number>;
  besonderheiten: string[];
  /** Kaufpreis-Einschätzung Grenz & Co. */
  preisGrenz: Angabe<number>;
  preisAnmerkung: string;
  /** Preisvorstellung des Eigentümers, falls genannt. */
  preisEigentuemer: Angabe<number>;
};

export type MarktpreisDaten = {
  empfaenger: string;
  datum: string;
  untertitel: string;
  objekte: EinschaetzungObjekt[];
  vergleiche: Vergleichsobjekt[];
  zusammenfassung: string[];
  vorgehen: string[];
  /** Kennwerte aus der internen Vergleichsdatenbank (Grenz-Bewertung). */
  intern: {
    anzahl: number;
    faktor: { min: number; mittel: number; max: number } | null;
    preisM2: { min: number; mittel: number; max: number } | null;
  } | null;
};

export type ToolDaten = {
  expose: ExposeDaten;
  marktpreis: MarktpreisDaten;
  mieterliste: MieterlisteDaten;
  dcf: DcfDaten;
  kaufpreis: KaufpreisDaten;
};

/** Tools, die aus Unterlagen eine Datei in einer Grenz-Vorlage füllen. */
export type DateiToolId = keyof ToolDaten;

export const DATEI_TOOLS: DateiToolId[] = [
  "expose",
  "marktpreis",
  "mieterliste",
  "dcf",
  "kaufpreis",
];

export const istDateiTool = (id: string): id is DateiToolId =>
  (DATEI_TOOLS as string[]).includes(id);

export type ToolErgebnis<T extends DateiToolId = DateiToolId> = {
  tool: T;
  daten: ToolDaten[T];
  /** Was fehlt oder unsicher ist, in Klartext. */
  hinweise: string[];
  /** Anzahl verworfener Angaben (Zitat stand nicht auf der genannten Seite o. ä.). */
  verworfen: number;
};
