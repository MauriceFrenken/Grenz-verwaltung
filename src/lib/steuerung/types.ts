export type MaklerDto = {
  /** Jüngster Datenstand (ISO) und Quelle der Auszüge. */
  stand: string | null;
  quellen: string[];
  kacheln: {
    pipelineProvision: number;
    pipelinePreise: number;
    beauftragt: number;
    beauftragtOhnePreis: number;
    gewinnquote: number | null;
    vermittelterKaufpreis: number;
    verkaeufe: number;
    offeneDeals: number;
  };
  /** Mandate je Phase in Pipeline-Reihenfolge. */
  phasen: Array<{ phase: string; anzahl: number; provision: number }>;
  /** Neue Mandate je Quartal. */
  mandateJeQuartal: Array<{ quartal: string; anzahl: number }>;
  pipeline: Array<{
    mandat: string;
    objekt: string;
    preis: number | null;
    provisionProzent: number | null;
    provision: number | null;
    art: string | null;
    betreuer: string | null;
  }>;
  /** Vermittelter Kaufpreis (Invoice Paid) je Jahr. */
  dealsJeJahr: Array<{
    jahr: string;
    kaufpreis: number;
    gewonnen: number;
    verloren: number;
  }>;
  deals: Array<{
    name: string;
    phase: string;
    kaufpreis: number | null;
    datum: string | null;
  }>;
  /** Summen über alle Vermarktungskampagnen. */
  funnel: Array<{ stufe: string; anzahl: number }>;
  kampagnen: Array<{
    name: string;
    status: string;
    start: string | null;
    kontakte: number;
    gesendet: number;
    interesse: number;
    besichtigung: number;
    angebot: number;
    absage: number;
  }>;
  aktivitaet: Array<{
    monat: string;
    Akquisebrief: number;
    Anruf: number;
    "E-Mail": number;
    Aufgabe: number;
  }>;
  aktivitaetSummen: Array<{ typ: string; vorjahr: number; jahr: number }>;
  finanzen: Array<{
    kennzahl: string;
    wert: number;
    einheit: string;
    quelle: string;
    hinweis: string | null;
  }>;
  umsatzVergleich: Array<{
    zeitraum: string;
    umsatz: number;
    kosten: number | null;
    ergebnis: number | null;
  }>;
  objekte: {
    gesamt: number;
    jeStatus: Array<{ name: string; anzahl: number }>;
    jeSalesforce: Array<{ name: string; anzahl: number }>;
    jeOrt: Array<{ name: string; anzahl: number }>;
  };
  gesellschaft: Array<{ feld: string; wert: string }>;
  finanzunterlagen: Array<{
    unterlage: string;
    jahr: string;
    status: string;
    hinweis: string | null;
  }>;
};
