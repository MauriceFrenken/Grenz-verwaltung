/**
 * Ordnet Bankbuchungen von Grenz & Co. einer Kennzahlen-Kategorie zu.
 * Regelbasiert über Auftraggeber + Verwendungszweck; die erste passende Regel gewinnt.
 */

export type Kategorie =
  | "provision"
  | "erstattung"
  | "zinsertrag"
  | "einnahme_sonstige"
  | "intern"
  | "umsatzsteuer"
  | "personal"
  | "sozialversicherung"
  | "steuern"
  | "buero"
  | "fahrzeug"
  | "marketing"
  | "it"
  | "beratung"
  | "gebuehren"
  | "bank"
  | "darlehen"
  | "bewirtung"
  | "sonstiges";

export const KATEGORIE_LABEL: Record<Kategorie, string> = {
  provision: "Provisionen",
  erstattung: "Erstattungen",
  zinsertrag: "Zinserträge",
  einnahme_sonstige: "Sonstige Einnahmen",
  intern: "Interne Umbuchung",
  umsatzsteuer: "Umsatzsteuer (durchlaufend)",
  personal: "Löhne & Gehälter",
  sozialversicherung: "Sozialversicherung",
  steuern: "Ertragsteuern",
  buero: "Büro",
  fahrzeug: "Fahrzeug",
  marketing: "Portale & Marketing",
  it: "IT & Telefon",
  beratung: "Steuerberatung",
  gebuehren: "Behörden & Gebühren",
  bank: "Bankgebühren",
  darlehen: "Darlehenszinsen",
  bewirtung: "Bewirtung & Kleinkram",
  sonstiges: "Sonstiges",
};

/** Kategorien, die im Ergebnis als Einnahme zählen. */
export const EINNAHME_KATEGORIEN: ReadonlySet<Kategorie> = new Set([
  "provision",
  "erstattung",
  "zinsertrag",
  "einnahme_sonstige",
]);

/**
 * Pauschaler USt-Satz je Kategorie, um Bruttozahlungen auf netto zu rechnen.
 * 0 = ohne Umsatzsteuer (Löhne, Abgaben, Gebühren, Bank, Zinsen).
 * „Sonstiges“ bleibt brutto, weil unklar ist, ob Vorsteuer abziehbar war.
 */
export const UST_SATZ: Record<Kategorie, number> = {
  provision: 0.19,
  erstattung: 0,
  zinsertrag: 0,
  einnahme_sonstige: 0,
  intern: 0,
  umsatzsteuer: 0,
  personal: 0,
  sozialversicherung: 0,
  steuern: 0,
  buero: 0.19,
  fahrzeug: 0.19,
  marketing: 0.19,
  it: 0.19,
  beratung: 0.19,
  gebuehren: 0,
  bank: 0,
  darlehen: 0,
  bewirtung: 0.19,
  sonstiges: 0,
};

export type BuchungFuerKategorie = {
  betrag: number;
  gegenkontoIban: string | null;
  auftraggeberName: string | null;
  verwendungszweck: string | null;
};

type Regel = { kategorie: Kategorie; muster: RegExp };

const AUSGABE_REGELN: Regel[] = [
  { kategorie: "personal", muster: /\b(lohn|gehalt|gehälter)\b/ },
  { kategorie: "darlehen", muster: /darlehen/ },
  {
    kategorie: "steuern",
    muster:
      /steuerverwaltung|finanzamt|kapitalertragsteuer|solidaritätszuschlag/,
  },
  {
    kategorie: "sozialversicherung",
    muster:
      /barmer|\baok\b|techniker krankenkasse|knappschaft|minijob|\bvbg\b|berufsgenossenschaft/,
  },
  { kategorie: "beratung", muster: /steuerberat|\brks\b|notar|rechtsanw/ },
  { kategorie: "buero", muster: /office club|büromiete/ },
  {
    kategorie: "fahrzeug",
    muster:
      /miete auto|autohaus|shell|\baral\b|\bjet\b|tamoil|avex|tankstelle|sb tank|couche-tard|total service|mr\. wash|park(haus|hochhaus|en)|q park/,
  },
  {
    kategorie: "marketing",
    muster:
      /immobilien ?scout|immowelt|immodeal|\bimv\b|immobilien-marktdaten|immobilienwerker|wiesenberg/,
  },
  {
    kategorie: "it",
    muster:
      /microsoft|adobe|telekom|placetel|vodafone|coolblue|chips at work|apple|google/,
  },
  {
    kategorie: "gebuehren",
    muster:
      /stadtkasse|stadt k(oe|ö|o)ln|stadt |kreis|industrie- und handelskammer|\bihk\b|bundesanzeiger|rundfunk|deutsche post/,
  },
  { kategorie: "bank", muster: /^abschluss|girocard|volksbank|ebics/ },
  {
    kategorie: "bewirtung",
    muster:
      /restaurant|food|gastronomie|burger|cafe|sumup|rewe|aldi|kodi|dschunke/,
  },
];

function text(b: BuchungFuerKategorie): string {
  return `${b.auftraggeberName ?? ""} ${b.verwendungszweck ?? ""}`.toLowerCase();
}

export function kategorisiere(
  b: BuchungFuerKategorie,
  eigeneIbans: ReadonlySet<string>,
): Kategorie {
  const gegen = b.gegenkontoIban?.replace(/\s+/g, "").toUpperCase() ?? "";
  if (gegen && eigeneIbans.has(gegen)) return "intern";

  const t = text(b);
  if (b.betrag > 0) {
    if (/provision|courtage|\bar\d{2}-\d+/.test(t)) return "provision";
    if (/^abschluss/.test(t)) return "zinsertrag";
    if (/erstattung|steuerverwaltung|finanzamt|barmer|rundfunk/.test(t)) {
      return "erstattung";
    }
    return "einnahme_sonstige";
  }

  for (const regel of AUSGABE_REGELN) {
    if (regel.muster.test(t)) return regel.kategorie;
  }
  return "sonstiges";
}

const FINANZAMT = /steuerverwaltung|finanzamt/;

/** Steuerart im Verwendungszweck → Kategorie (Lohnsteuer zählt zum Personal). */
const STEUERART: Array<{ muster: RegExp; kategorie: Kategorie }> = [
  { muster: /^umsatzsteuer/, kategorie: "umsatzsteuer" },
  { muster: /^(lohnsteuer|kirchensteuer|solidarit)/, kategorie: "personal" },
];

/**
 * Zerlegt eine Buchung in Kategorie-Anteile. Zahlungen ans Finanzamt fassen oft
 * mehrere Steuerarten zusammen („Umsatzsteuer Aug. 26 9.049,96 Lohnsteuer
 * 3.Vj.26 2.182,98“); die Beträge werden dann aus dem Verwendungszweck gelesen.
 */
export function zerlege(
  b: BuchungFuerKategorie,
  eigeneIbans: ReadonlySet<string>,
): Array<{ kategorie: Kategorie; betrag: number }> {
  const kategorie = kategorisiere(b, eigeneIbans);
  const t = text(b);
  if (kategorie === "intern" || !FINANZAMT.test(t)) {
    return [{ kategorie, betrag: b.betrag }];
  }
  const teile: Array<{ kategorie: Kategorie; betrag: number }> = [];
  const re =
    /(umsatzsteuer|lohnsteuer|kirchensteuer|solidarit\S*|gewerbesteuer|k(?:ö|oe)rperschaft\S*|einkommensteuer)\b[^,]*?(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  for (const m of t.matchAll(re)) {
    const betrag = Number(m[2].replace(/\./g, "").replace(",", "."));
    const art = STEUERART.find((a) => a.muster.test(m[1]));
    teile.push({
      kategorie: art?.kategorie ?? "steuern",
      betrag: betrag * Math.sign(b.betrag),
    });
  }
  const summe = teile.reduce((s, x) => s + x.betrag, 0);
  if (teile.length === 0 || Math.abs(summe - b.betrag) > 0.05) {
    // Ohne lesbare Aufteilung: nur eindeutige Fälle zuordnen.
    if (
      /umsatzsteuer/.test(t) &&
      !/lohnsteuer|gewerbe|rperschaft|einkommen/.test(t)
    ) {
      return [{ kategorie: "umsatzsteuer", betrag: b.betrag }];
    }
    if (
      /lohnsteuer/.test(t) &&
      !/umsatzsteuer|gewerbe|rperschaft|einkommen/.test(t)
    ) {
      return [{ kategorie: "personal", betrag: b.betrag }];
    }
    return [{ kategorie, betrag: b.betrag }];
  }
  return teile;
}

/**
 * Letzter Monat (JJJJ-MM), für den laut Verwendungszweck Umsatzsteuer
 * abgerechnet wurde, z. B. „Umsatzsteuer Aug. 26“ → 2026-08, „1.Vj.26“ → 2026-03.
 */
export function ustZeitraumEnde(zweck: string | null): string | null {
  if (!zweck) return null;
  const t = zweck.toLowerCase();
  const MONATE = [
    /^jan/,
    /^feb/,
    /^(mär|mrz|mar)/,
    /^apr/,
    /^mai/,
    /^jun/,
    /^jul/,
    /^aug/,
    /^sep/,
    /^okt/,
    /^nov/,
    /^dez/,
  ];
  let ende: string | null = null;
  for (const m of t.matchAll(
    /umsatzsteuer\s+(?:(\d)\.\s*vj\.?\s*|([a-zä]+)\.?\s+)(\d{2})\b/g,
  )) {
    const jahr = 2000 + Number(m[3]);
    let monat: number | null = null;
    if (m[1]) monat = Number(m[1]) * 3;
    else {
      const i = MONATE.findIndex((r) => r.test(m[2]));
      if (i >= 0) monat = i + 1;
    }
    if (!monat) continue;
    const z = `${jahr}-${String(monat).padStart(2, "0")}`;
    if (!ende || z > ende) ende = z;
  }
  return ende;
}
