/**
 * Grenz-Design-Vorlage und gemeinsames Inhaltsmodell aller Dokumente
 * (Exposé, Teaser, Eigentümer-Report, Bewertung). PDF und PPTX rendern
 * aus derselben Definition.
 */

export type DokumentTyp =
  | "allgemein"
  | "expose"
  | "teaser"
  | "pitch"
  | "eigentuemer_report"
  | "bewertung";

/** In PDF und PPTX ohne eigene Schriftdateien verfügbar. */
export type SchriftArt = "serif" | "sans";

export type DesignDefinition = {
  farben: {
    primaer: string;
    akzent: string;
    text: string;
    textHell: string;
    linie: string;
    flaeche: string;
  };
  schriften: { titel: SchriftArt; text: SchriftArt };
  /** Pfad im Storage-Bucket „vorlagen“; leer = eingebautes Grenz-Logo. */
  logoPfad: string | null;
  firma: {
    name: string;
    anschrift: string;
    telefon: string;
    email: string;
    web: string;
    register: string;
  };
  fusszeile: string;
  disclaimer: string;
  provisionshinweis: string;
  widerrufsbelehrung: string;
  seitenformat: "A4";
};

export type AbschnittDefinition = {
  id: string;
  titel: string;
  sichtbar: boolean;
};

export type DesignVorlage = {
  id: string | null;
  name: string;
  typ: DokumentTyp;
  design: DesignDefinition;
  abschnitte: AbschnittDefinition[];
  version: number;
};

/** Beleg für eine Aussage. Ohne Quelle wird keine Aussage erzeugt (Masterplan, harte Regel). */
export type Quelle = {
  id: string;
  art:
    | "feld"
    | "dokument"
    | "aktivitaet"
    | "eingabe"
    | "berechnung"
    | "marktdaten";
  bezeichnung: string;
  /** Salesforce-Id, Tabellenzeile oder Dateipfad. */
  verweis?: string;
  seite?: number;
  zitat?: string;
};

export type Block =
  | { art: "absatz"; text: string; quellen?: string[] }
  | {
      art: "kennzahlen";
      eintraege: { label: string; wert: string; quellen?: string[] }[];
    }
  | {
      art: "tabelle";
      kopf: string[];
      zeilen: string[][];
      ausrichtung?: ("links" | "rechts")[];
    }
  | { art: "liste"; punkte: string[] }
  | { art: "balken"; eintraege: { label: string; wert: number }[] }
  | { art: "luecke"; text: string }
  | { art: "hinweis"; text: string };

export type InhaltAbschnitt = {
  id: string;
  titel: string;
  bloecke: Block[];
};

export type DokumentInhalt = {
  typ: DokumentTyp;
  titel: string;
  untertitel?: string;
  /** ISO-Datum des Dokuments. */
  datum: string;
  abschnitte: InhaltAbschnitt[];
  quellen: Quelle[];
  /** Status-Stempel auf jeder Seite, z. B. „Entwurf“. */
  stempel?: string;
  /**
   * Quellenverweise drucken (Standard). Freigegebene Exposés und Teaser gehen an Käufer:
   * dort bleiben die Belege im Entwurf gespeichert, werden aber nicht gedruckt.
   */
  quellenDrucken?: boolean;
};
