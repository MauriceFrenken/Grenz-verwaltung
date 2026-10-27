/**
 * Gesellschafterbericht: monatlicher Kennzahlenbericht an die FRENKEN Management App.
 * Format laut „Schnittstelle Beteiligungsbericht (Version 1)“. Es fließen nur
 * zusammengefasste Kennzahlen, keine Kunden-, Eigentümer-, Investoren- oder Personendaten.
 */

export const BERICHT_VERSION = 1 as const;
export const BERICHT_ABSENDER = "grenz-verwaltung" as const;
export const KOMMENTAR_MAX = 4000;

export type BerichtArt = "ist" | "plan";

/** Euro-Felder und Köpfe auf oberster Ebene des Berichts. */
export const HAUPTWERTE = [
  "umsatz",
  "rohertrag",
  "ebitda",
  "ergebnis",
  "liquiditaet",
  "mitarbeiter",
] as const;
export type Hauptwert = (typeof HAUPTWERTE)[number];

/** Erlaubte Schlüssel unter `kennzahlen` für Makler (Grenz & Co.). */
export const MAKLER_KENNZAHLEN = [
  "mandate",
  "pipeline",
  "abschluesse",
  "provisionsquote",
  "forderungen",
] as const;
export type MaklerKennzahl = (typeof MAKLER_KENNZAHLEN)[number];

export type Feldname = Hauptwert | MaklerKennzahl;

export const FELD_INFO: Record<
  Feldname,
  { label: string; einheit: "euro" | "anzahl" | "prozent"; erklaerung: string }
> = {
  umsatz: {
    label: "Umsatz",
    einheit: "euro",
    erklaerung: "Euro im Berichtsmonat, netto",
  },
  rohertrag: {
    label: "Rohertrag",
    einheit: "euro",
    erklaerung: "Euro im Berichtsmonat",
  },
  ebitda: { label: "EBITDA", einheit: "euro", erklaerung: "Euro im Berichtsmonat" },
  ergebnis: {
    label: "Ergebnis",
    einheit: "euro",
    erklaerung: "Euro im Berichtsmonat",
  },
  liquiditaet: {
    label: "Liquidität",
    einheit: "euro",
    erklaerung: "Bankbestand zum Monatsende",
  },
  mitarbeiter: {
    label: "Mitarbeiter",
    einheit: "anzahl",
    erklaerung: "Köpfe zum Monatsende",
  },
  mandate: {
    label: "Aktive Mandate",
    einheit: "anzahl",
    erklaerung: "Aktive Mandate zum Monatsende",
  },
  pipeline: {
    label: "Pipeline",
    einheit: "euro",
    erklaerung: "Kaufpreisvolumen der aktiven Mandate",
  },
  abschluesse: {
    label: "Abschlüsse",
    einheit: "anzahl",
    erklaerung: "Notarielle Abschlüsse im Monat",
  },
  provisionsquote: {
    label: "Provisionsquote",
    einheit: "prozent",
    erklaerung: "Durchschnittliche Provision der Abschlüsse in Prozent",
  },
  forderungen: {
    label: "Offene Forderungen",
    einheit: "euro",
    erklaerung: "Offene Provisionsforderungen",
  },
};

/** Ein Wert des Entwurfs mit Herkunft. */
export type EntwurfWert = {
  wert: number | null;
  /** Woher der Wert stammt, oder warum er leer bleibt. */
  quelle: string;
  /** true = aus den Daten der App berechnet, false = manuell einzutragen. */
  automatisch: boolean;
};

export type Entwurf = {
  periode: string;
  art: BerichtArt;
  werte: Record<Feldname, EntwurfWert>;
};

/** Genau das JSON, das an die FRENKEN-App geht. */
export type BerichtInhalt = {
  version: typeof BERICHT_VERSION;
  periode: string;
  art: BerichtArt;
  umsatz: number | null;
  rohertrag: number | null;
  ebitda: number | null;
  ergebnis: number | null;
  liquiditaet: number | null;
  mitarbeiter: number | null;
  kennzahlen: Record<MaklerKennzahl, number | null>;
  kommentar: string;
  freigegeben_von: string;
  freigegeben_am: string;
  absender: typeof BERICHT_ABSENDER;
};

/** Eingabe aus dem Formular (ohne Freigabe-Angaben, die setzt der Server). */
export type BerichtFormular = {
  periode: string;
  art: BerichtArt;
  werte: Record<Feldname, number | null>;
  kommentar: string;
};

export type GesendeterBericht = {
  id: string;
  periode: string;
  art: BerichtArt;
  inhalt: BerichtInhalt;
  freigegebenVon: string;
  freigegebenAm: string;
  gesendetAm: string | null;
  antwortStatus: number | null;
  antwortText: string | null;
  erfolgreich: boolean;
};

export type GesellschafterberichtDto = {
  entwurf: Entwurf;
  historie: GesendeterBericht[];
  /** Hinweis, wenn die Historie nicht lesbar ist (z. B. Migration fehlt). */
  einrichtungsHinweis: string | null;
  /** Geschäftsführung bzw. Administrator: darf freigeben und senden. */
  darfFreigeben: boolean;
  /** FRENKEN_BERICHT_URL und FRENKEN_BERICHT_SCHLUESSEL sind gesetzt. */
  konfiguriert: boolean;
  /** Name, der als freigegeben_von eingetragen wird. */
  freigabeName: string | null;
};

export type SendeErgebnis = {
  erfolgreich: boolean;
  antwortStatus: number | null;
  antwortText: string;
  bericht: GesendeterBericht;
};
