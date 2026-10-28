/**
 * Kennzahlen › Markt: amtliche Kennzahlen zum Immobilienmarkt für das Kundengespräch. Alle
 * Reihen kommen aus der Zeitreihen-Datenbank der Deutschen Bundesbank (offene SDMX-Schnittstelle,
 * kein Schlüssel), die auch die Indizes von Destatis, vdp und bulwiengesa weitergibt.
 * Reine Funktionen; der Abruf steht in server-fn.ts.
 */

export type IndikatorGruppe =
  "zinsen" | "preise" | "mieten" | "faktoren" | "bau";

export const GRUPPEN: {
  id: IndikatorGruppe;
  label: string;
  hinweis: string;
}[] = [
  {
    id: "zinsen",
    label: "Zinsen und Inflation",
    hinweis:
      "Finanzierungskosten der Käufer und Vergleichsrendite sicherer Anlagen",
  },
  {
    id: "preise",
    label: "Kaufpreise",
    hinweis: "Preisentwicklung gegenüber dem Vorjahr",
  },
  {
    id: "mieten",
    label: "Mieten",
    hinweis: "Mietentwicklung gegenüber dem Vorjahr",
  },
  {
    id: "faktoren",
    label: "Faktoren",
    hinweis: "Kaufpreis im Verhältnis zur Jahresmiete",
  },
  {
    id: "bau",
    label: "Neubau",
    hinweis: "Wie viel neues Angebot entsteht",
  },
];

export type Frequenz = "M" | "Q" | "A";

export type IndikatorDefinition = {
  id: string;
  gruppe: IndikatorGruppe;
  label: string;
  quelle: string;
  /** Schlüssel der Bundesbank: Datenbestand/Reihe. */
  reihe: string;
  frequenz: Frequenz;
  /** wert: Wert so zeigen; vorjahr: Veränderung eines Index gegenüber dem Vorjahr in %. */
  darstellung: "wert" | "vorjahr";
  einheit: string;
  stellen: number;
  /** Ein Satz, wie man die Zahl im Gespräch einordnet. */
  hinweis: string;
};

export const INDIKATOREN: IndikatorDefinition[] = [
  {
    id: "bauzins",
    gruppe: "zinsen",
    label: "Bauzins, Zinsbindung über 10 Jahre",
    quelle:
      "Deutsche Bundesbank, Effektivzinssätze Wohnungsbaukredite, Neugeschäft",
    reihe: "BBIM1/M.DE.B.A2C.P.R.A.2250.EUR.N",
    frequenz: "M",
    darstellung: "wert",
    einheit: "%",
    stellen: 2,
    hinweis:
      "Liegt der Bauzins über der Bruttorendite, rechnet sich ein fremdfinanzierter Kauf erst über Mietsteigerung.",
  },
  {
    id: "bund10",
    gruppe: "zinsen",
    label: "Rendite 10-jährige Bundesanleihe",
    quelle: "Deutsche Bundesbank, Zinsstruktur Bundeswertpapiere, 10 Jahre",
    reihe: "BBSIS/M.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A",
    frequenz: "M",
    darstellung: "wert",
    einheit: "%",
    stellen: 2,
    hinweis:
      "Sichere Alternative zum Zinshaus: Der Abstand zur Mietrendite ist die Risikoprämie.",
  },
  {
    id: "ezb",
    gruppe: "zinsen",
    label: "EZB-Einlagesatz",
    quelle: "Deutsche Bundesbank, Zinssätze des Eurosystems",
    reihe: "BBIN1/M.D0.ECB.ECBFAC.EUR.ME",
    frequenz: "M",
    darstellung: "wert",
    einheit: "%",
    stellen: 2,
    hinweis:
      "Leitzins der EZB; Senkungen ziehen kurzfristige Finanzierungen mit, Bauzinsen nur zum Teil.",
  },
  {
    id: "inflation",
    gruppe: "zinsen",
    label: "Inflation (Verbraucherpreise)",
    quelle:
      "Statistisches Bundesamt über Deutsche Bundesbank, Verbraucherpreisindex",
    reihe: "BBDP1/M.DE.N.VPI.C.A00000.I20.A",
    frequenz: "M",
    darstellung: "vorjahr",
    einheit: "%",
    stellen: 1,
    hinweis:
      "Indexmieten folgen der Inflation; Sachwerte gelten als Schutz davor.",
  },
  {
    id: "mfh_top7",
    gruppe: "preise",
    label: "Mehrfamilienhäuser, 7 größte Städte",
    quelle: "Gewerbeimmobilienpreisindex (vdp/Bundesbank), Mehrfamilienhäuser",
    reihe: "BBDY1/Q.B10.N.G175.P0910.A",
    frequenz: "Q",
    darstellung: "vorjahr",
    einheit: "%",
    stellen: 1,
    hinweis: "Düsseldorf und Köln gehören zu den sieben größten Städten.",
  },
  {
    id: "mfh_de",
    gruppe: "preise",
    label: "Mehrfamilienhäuser, Deutschland",
    quelle: "Gewerbeimmobilienpreisindex (vdp/Bundesbank), Mehrfamilienhäuser",
    reihe: "BBDY1/Q.B10.N.G175.P0900.A",
    frequenz: "Q",
    darstellung: "vorjahr",
    einheit: "%",
    stellen: 1,
    hinweis: "Preise für Zinshäuser im ganzen Bundesgebiet.",
  },
  {
    id: "wohnen_destatis",
    gruppe: "preise",
    label: "Wohnimmobilien insgesamt",
    quelle: "Statistisches Bundesamt, Häuserpreisindex",
    reihe: "BBDY1/Q.B10.N.G100.P0050.A",
    frequenz: "Q",
    darstellung: "vorjahr",
    einheit: "%",
    stellen: 1,
    hinweis:
      "Amtlicher Index für Häuser und Wohnungen aus tatsächlichen Kauffällen.",
  },
  {
    id: "mieten_neu",
    gruppe: "mieten",
    label: "Neuvertragsmieten, 7 größte Städte",
    quelle:
      "Wohnimmobilienpreisindex der Bundesbank (bulwiengesa), Mieten Eigentumswohnungen",
    reihe: "BBDY1/A.B10.N.G300.P0800.A",
    frequenz: "A",
    darstellung: "vorjahr",
    einheit: "%",
    stellen: 1,
    hinweis:
      "Bei Neuvermietung erzielbare Miete; zeigt das Mietsteigerungspotenzial im Bestand.",
  },
  {
    id: "mieten_bestand",
    gruppe: "mieten",
    label: "Bestandsmieten, Deutschland",
    quelle: "Statistisches Bundesamt, Verbraucherpreisindex Wohnungsmieten",
    reihe: "BBDY1/Q.B10.N.G300.P0830.A",
    frequenz: "Q",
    darstellung: "vorjahr",
    einheit: "%",
    stellen: 1,
    hinweis:
      "Wie schnell laufende Mieten steigen; deutlich langsamer als Neuvertragsmieten.",
  },
  {
    id: "faktor_top7",
    gruppe: "faktoren",
    label: "Kaufpreis/Jahresmiete, 7 größte Städte",
    quelle:
      "Deutsche Bundesbank, Indikatorensystem Wohnimmobilienmarkt (Eigentumswohnungen)",
    reihe: "BBDY1/A.B10.N.G250.P0600.A",
    frequenz: "A",
    darstellung: "wert",
    einheit: "-fach",
    stellen: 1,
    hinweis:
      "Eigentumswohnungen; Zinshäuser handeln meist darunter (vgl. Angebotsfaktoren unten).",
  },
  {
    id: "faktor_127",
    gruppe: "faktoren",
    label: "Kaufpreis/Jahresmiete, 127 Städte",
    quelle:
      "Deutsche Bundesbank, Indikatorensystem Wohnimmobilienmarkt (Eigentumswohnungen)",
    reihe: "BBDY1/A.B10.N.G250.P0610.A",
    frequenz: "A",
    darstellung: "wert",
    einheit: "-fach",
    stellen: 1,
    hinweis: "Breiterer Markt einschließlich mittlerer Großstädte.",
  },
  {
    id: "genehmigungen",
    gruppe: "bau",
    label: "Baugenehmigungen, Wohnungen",
    quelle: "Statistisches Bundesamt über Deutsche Bundesbank",
    reihe: "BBDY1/A.B30.N.G700.R0020.A",
    frequenz: "A",
    darstellung: "wert",
    einheit: "Tsd.",
    stellen: 0,
    hinweis:
      "Wenig Genehmigungen heute heißt knappes Angebot in zwei bis drei Jahren.",
  },
  {
    id: "fertigstellungen",
    gruppe: "bau",
    label: "Baufertigstellungen, Wohnungen",
    quelle: "Statistisches Bundesamt über Deutsche Bundesbank",
    reihe: "BBDY1/A.B30.N.G700.R0010.A",
    frequenz: "A",
    darstellung: "wert",
    einheit: "Tsd.",
    stellen: 0,
    hinweis: "Bedarf laut Bundesregierung rund 400.000 Wohnungen im Jahr.",
  },
];

export type Messwert = { periode: string; wert: number };

/** CSV der Bundesbank: Kopfzeilen, dann „2026-03;3,74;“, „2026-Q2;204,6;“ oder „2025;30,6;“. */
export function bundesbankCsv(csv: string): Messwert[] {
  const werte: Messwert[] = [];
  for (const zeile of csv.split(/\r?\n/)) {
    const m = /^(\d{4}(?:-\d{2}|-Q[1-4])?);(-?\d+(?:,\d+)?);/.exec(
      zeile.trim(),
    );
    if (m) werte.push({ periode: m[1], wert: Number(m[2].replace(",", ".")) });
  }
  return werte;
}

const VERSATZ: Record<Frequenz, number> = { M: 12, Q: 4, A: 1 };

/** Veränderung gegenüber dem Vorjahreswert in %, je Periode mit Vorjahreswert. */
export function vorjahresraten(
  werte: Messwert[],
  frequenz: Frequenz,
): Messwert[] {
  const n = VERSATZ[frequenz];
  const raten: Messwert[] = [];
  for (let i = n; i < werte.length; i++) {
    const alt = werte[i - n].wert;
    if (!alt) continue;
    raten.push({
      periode: werte[i].periode,
      wert: Math.round((werte[i].wert / alt - 1) * 100 * 10) / 10,
    });
  }
  return raten;
}

export type IndikatorStand = {
  id: string;
  gruppe: IndikatorGruppe;
  label: string;
  quelle: string;
  reihe: string;
  einheit: string;
  stellen: number;
  hinweis: string;
  darstellung: "wert" | "vorjahr";
  /** Angezeigter Wert (bei „vorjahr“ die Veränderung in %). */
  wert: number;
  periode: string;
  /** Derselbe Wert ein Jahr zuvor. */
  vorjahr: number | null;
  /** Verlauf des angezeigten Werts, höchstens fünf Jahre. */
  verlauf: Messwert[];
};

/** Aus den Rohwerten einer Reihe den angezeigten Stand machen; null ohne Werte. */
export function indikatorStand(
  d: IndikatorDefinition,
  roh: Messwert[],
): IndikatorStand | null {
  const reihe =
    d.darstellung === "vorjahr" ? vorjahresraten(roh, d.frequenz) : roh;
  if (!reihe.length) return null;
  const letzter = reihe[reihe.length - 1];
  const n = VERSATZ[d.frequenz];
  const vor = reihe.length > n ? reihe[reihe.length - 1 - n] : null;
  return {
    id: d.id,
    gruppe: d.gruppe,
    label: d.label,
    quelle: d.quelle,
    reihe: d.reihe,
    einheit: d.einheit,
    stellen: d.stellen,
    hinweis: d.hinweis,
    darstellung: d.darstellung,
    wert: letzter.wert,
    periode: letzter.periode,
    vorjahr: vor && vor.periode < letzter.periode ? vor.wert : null,
    verlauf: reihe.slice(-5 * n),
  };
}

/** „2026-08“ → „Aug. 2026“, „2026-Q2“ → „2. Quartal 2026“, „2025“ → „2025“. */
export function periodeText(p: string): string {
  const q = /^(\d{4})-Q([1-4])$/.exec(p);
  if (q) return `${q[2]}. Quartal ${q[1]}`;
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (m) {
    const monate = [
      "Jan.",
      "Feb.",
      "März",
      "Apr.",
      "Mai",
      "Juni",
      "Juli",
      "Aug.",
      "Sep.",
      "Okt.",
      "Nov.",
      "Dez.",
    ];
    return `${monate[Number(m[2]) - 1]} ${m[1]}`;
  }
  return p;
}

/** Beginn des Abrufs im Format der Frequenz (die Bundesbank lehnt „2020“ bei Monatsreihen ab). */
export function startPeriode(frequenz: Frequenz, jahr: number): string {
  return frequenz === "M"
    ? `${jahr}-01`
    : frequenz === "Q"
      ? `${jahr}-Q1`
      : `${jahr}`;
}
