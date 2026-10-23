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
  personal: "Löhne & Gehälter",
  sozialversicherung: "Sozialversicherung",
  steuern: "Steuern",
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
