/** Datentypen der Investorendatenbank (Client und Server). */

export type JsonWert = string | number | boolean | null | JsonWert[] | { [k: string]: JsonWert };

export type PruefungKurz = {
  status: string;
  begruendung: string | null;
  quelleUrl: string | null;
  webseite: string | null;
  ankaufsprofilUrl: string | null;
  ankaufsprofilKurz: string | null;
  aktiv2026: boolean | null;
  letzteAktivitaet: string | null;
  geprueftAm: string;
};

export type InvestorZeile = {
  accountSfId: string;
  name: string;
  profilSfId: string | null;
  typ: string | null;
  typQuelle: string | null;
  status: string;
  statusGrund: string | null;
  prioritaet: string | null;
  herkunft: string;
  nutzungen: string[];
  objektklassen: string[];
  volumenMin: number | null;
  volumenMax: number | null;
  faktorMax: number | null;
  einheitenMin: number | null;
  regionsebene: string | null;
  regionenKurz: string[];
  bemerkung: string | null;
  kriterienHerkunft: Record<string, string>;
  letzterKontaktAm: string | null;
  aktivitaeten12m: number;
  dealsAnzahl: number;
  dealsGewonnen: number;
  kampagnenAnzahl: number;
  radarAnzahl: number;
  letzteMarktaktivitaetAm: string | null;
  kontakteAnzahl: number;
  kontakteMitEmail: number;
  pruefung: PruefungKurz | null;
};

export type VorschlagZeile = {
  id: string;
  accountSfId: string | null;
  investor: string | null;
  profilSfId: string | null;
  art: string;
  feld: string | null;
  alterWert: JsonWert;
  neuerWert: JsonWert;
  quelle: string;
  beleg: string | null;
  ziel: string;
  sfObjekt: string | null;
  sfFeld: string | null;
  status: string;
  createdAt: string;
};

export type InvestorEreignis = {
  am: string | null;
  quelle: string;
  art: string | null;
  titel: string | null;
  detail: string | null;
};

export type InvestorAkte = {
  investor: InvestorZeile;
  ereignisse: InvestorEreignis[];
  vorschlaege: VorschlagZeile[];
  kontakte: { sfId: string; name: string; email: string | null; telefon: string | null }[];
  listen: {
    quelle: string;
    link: string | null;
    nutzungen: string[];
    volumenMin: number | null;
    volumenMax: number | null;
    objekteInteresse: string[];
  }[];
};

export type QuelleZeile = {
  schluessel: string;
  quelle: string;
  firma: string | null;
  person: string | null;
  emails: string[];
  telefon: string | null;
  adresse: string | null;
  webseite: string | null;
  quelleLink: string | null;
  /** Bei Recherche-Funden: was wann gekauft oder gesucht wurde. */
  beleg: string | null;
  typ: string | null;
  nutzungen: string[];
  volumenMin: number | null;
  volumenMax: number | null;
  nrwBezug: string | null;
  objekteInteresse: string[];
  passung: number;
  sfTrefferArt: string | null;
  bearbeitung: string;
  pruefung: PruefungKurz | null;
};

export const STATUS_LABEL: Record<string, string> = {
  aktiv: "Aktiv",
  ruhend: "Ruhend",
  kein_interesse: "Kein Interesse",
  gesperrt: "Gesperrt",
  erloschen: "Erloschen",
  neu: "Neu, nicht in Salesforce",
};

export const PRUEF_LABEL: Record<string, string> = {
  aktiv: "Existiert",
  insolvenz: "Insolvenz",
  liquidation: "Liquidation",
  geloescht: "Gelöscht",
  unklar: "Unklar",
};

export const FELD_LABEL: Record<string, string> = {
  typ: "Investorentyp",
  faktor_max: "Faktor bis",
  einheiten_min: "Einheiten ab",
  grundstueck_ab_m2: "Grundstück ab m²",
  bgf_ab_m2: "BGF ab m²",
  volumen_min: "Volumen min.",
  volumen_max: "Volumen max.",
  volumen: "Volumen",
  account: "Account",
  profil: "Ankaufsprofil",
  erloschen: "Firma erloschen",
};
