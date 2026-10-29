/**
 * Marktbericht Zinshäuser Rheinland (Tool unter „Tools“). Halbjahres- und Jahresbericht im
 * Grenz-&-Co.-Design. Kennzahlen werden beim Anlegen oder Neuberechnen eingefroren, damit ein
 * freigegebener Bericht seine Zahlen nicht still ändert.
 */

export type PeriodenArt = "H1" | "GJ";

export type Periode = { jahr: number; art: PeriodenArt };

export const TEILMAERKTE = [
  "Köln",
  "Düsseldorf",
  "Bonn",
  "Übriges Rheinland",
  "Übriges NRW",
] as const;
/** „Sonstige“: außerhalb NRW oder ohne Ort und PLZ. */
export type Teilmarkt = (typeof TEILMAERKTE)[number] | "Sonstige";

/** Unter dieser Fallzahl weist der Bericht für eine Zelle keinen Wert aus. */
export const MINDEST_FALLZAHL = 5;

export type Verteilung = {
  median: number;
  p25: number;
  p75: number;
  n: number;
};

export type AngebotsZeile = {
  teilmarkt: Teilmarkt | "Gesamt";
  angebote: number;
  mitPreis: number;
  faktor: Verteilung | null;
  preisM2: Verteilung | null;
  mieteM2: Verteilung | null;
  volumen: number;
};

export type Angebotsmarkt = {
  zeilen: AngebotsZeile[];
  objektarten: { label: string; wert: number }[];
  /** Gesamtzeile der Vorperiode, falls dort genug Fälle waren. */
  vorperiode: AngebotsZeile | null;
  ersterEingang: string | null;
};

export type Kaeuferindex = {
  profile: number;
  mitVolumen: number;
  regionen: { label: string; wert: number }[];
  volumenbaender: { label: string; wert: number }[];
  assetklassen: { label: string; wert: number }[];
  investorTypen: { label: string; wert: number }[];
  medianVolumenMax: number | null;
};

export type Vermarktung = {
  neueMandate: number;
  abschluesse: number;
  abschlussVolumen: number;
  verloren: number;
};

export type Zeitreihe = {
  id: "bauzins" | "bund10";
  label: string;
  quelle: string;
  reihe: string;
  einheit: string;
  werte: { monat: string; wert: number }[];
};

export type Zinsumfeld = {
  reihen: Zeitreihe[];
  fehler: string | null;
};

export type RadarMeldung = {
  seite: "kaeufer" | "verkaeufer";
  akteur: string;
  ereignis: string;
  ort: string | null;
  volumen: number | null;
  datum: string | null;
  url: string;
};

export type MarktberichtKennzahlen = {
  periode: Periode;
  von: string;
  bis: string;
  /** Stichtag der Zahlen: Periodenende oder heute, wenn die Periode noch läuft. */
  stichtag: string;
  vorlaeufig: boolean;
  angebot: Angebotsmarkt;
  kaeufer: Kaeuferindex;
  vermarktung: Vermarktung;
  vermarktungVorperiode: Vermarktung;
  zinsen: Zinsumfeld;
  radar: { kaeufer: number; verkaeufer: number; auswahl: RadarMeldung[] };
  /**
   * Hatte die Periode zu wenige eigene Fälle, zeigen Angebotsmarkt bzw. Markt-Radar stattdessen
   * die laufende Erhebung in diesem Zeitraum (eigene Quellen erst seit 2026).
   */
  erhebung?: { von: string; bis: string; angebot: boolean; radar: boolean };
};

/** Zitierter Vergleichswert aus einem fremden Marktbericht oder einer amtlichen Quelle. */
export type Benchmark = {
  id: string;
  kennzahl: string;
  region: string;
  wert: number;
  einheit: string;
  /** Veränderung zur Vorperiode als Text, z. B. „+34 % y/y“ oder „+10 bp“. */
  veraenderung?: string;
  quelle: string;
  stichtag: string;
  seite?: number;
  url?: string;
  zitat?: string;
  /** KI-Auszüge aus hochgeladenen Berichten sind ungeprüft, bis ein Nutzer sie bestätigt. Nur geprüfte Werte werden gedruckt. */
  geprueft: boolean;
  /** automatisch = Zitat und Zahl wurden im Originaltext des Dokuments gefunden. */
  pruefung?: "automatisch" | "nutzer";
  /** Bedeutung für einen Zinshaus-Bericht Rheinland, 0 bis 100 (aus der Auslese). */
  relevanz?: number;
  /** Herkunft aus der Bibliothek (marktbericht_dokumente.id). */
  dokumentId?: string;
};

export type Trend = "steigend" | "stabil" | "fallend";

export type MarktberichtTexte = {
  thesen?: string[];
  /** Kurzfassung unter den Kennzahlen auf „Auf einen Blick“. */
  einleitung?: string;
  rahmen?: string;
  angebot?: string;
  nachfrage?: string;
  vermarktung?: string;
  ausblick?: string;
  /** Schlagzeile je Abschnitt (Kernaussage), steht im PDF unter dem Seitentitel. */
  schlagzeilen?: {
    rahmen?: string;
    angebot?: string;
    nachfrage?: string;
    ausblick?: string;
  };
  /** „Was das für Investoren bedeutet“: drei bis vier konkrete Hinweise für Privatanleger. */
  empfehlungen?: string[];
  ausblickTrends?: { kennzahl: string; trend: Trend; prognose: Trend }[];
  /** Hinweise der Prüfung, z. B. Zahlen im KI-Text, die nicht in den Kennzahlen stehen. */
  pruefhinweise?: string[];
};

export type MarktberichtInhalt = {
  texte: MarktberichtTexte;
  benchmarks: Benchmark[];
  /** Ids der automatisch übernommenen Bibliothekswerte; gelöschte kommen so nicht zurück. */
  uebernommen?: string[];
  /** Texte stammen unverändert von der KI; dann dürfen sie bei neuen Daten neu geschrieben werden. */
  texteAutomatisch?: boolean;
  /** Seit dem letzten automatischen Text kamen neue Vergleichswerte hinzu. */
  texteFaellig?: boolean;
  /** Fassung der KI-Vorgaben, mit der die Texte geschrieben wurden (siehe TEXT_FASSUNG). */
  textFassung?: number;
};

/**
 * Fassung der KI-Vorgaben. 2 = Bericht für private und semi-professionelle Investoren als
 * „Grenz & Co. Research“ ohne Nennung fremder Quellen. 3 = strengere Stil- und Längenvorgaben,
 * Schlagzeilen je Abschnitt. Automatische Texte älterer Fassungen
 * schreibt der Cron neu.
 */
export const TEXT_FASSUNG = 3;

/** Noch keine Texte geschrieben (frisch angelegter Bericht). */
export function texteLeer(t: MarktberichtTexte): boolean {
  return (
    !t.thesen?.some((x) => x.trim()) &&
    !t.empfehlungen?.some((x) => x.trim()) &&
    ![
      t.einleitung,
      t.rahmen,
      t.angebot,
      t.nachfrage,
      t.vermarktung,
      t.ausblick,
    ].some((x) => x?.trim())
  );
}

export type MarktberichtStatus = "entwurf" | "freigegeben";

export function periodeSchluessel(p: Periode): string {
  return `${p.jahr}-${p.art}`;
}

export function periodeText(p: Periode): string {
  return p.art === "H1" ? `1. Halbjahr ${p.jahr}` : `Gesamtjahr ${p.jahr}`;
}

export function periodeVonBis(p: Periode): { von: string; bis: string } {
  return {
    von: `${p.jahr}-01-01`,
    bis: p.art === "H1" ? `${p.jahr}-06-30` : `${p.jahr}-12-31`,
  };
}

/** Vergleichsperiode wie bei BNPP und C&W: derselbe Zeitraum im Vorjahr. */
export function vorperiode(p: Periode): Periode {
  return { jahr: p.jahr - 1, art: p.art };
}
