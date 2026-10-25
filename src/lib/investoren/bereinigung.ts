/**
 * Bereinigung der Investorendaten: Investorentyp, Kriterien aus dem Bemerkungsfeld,
 * Regionen verdichten, Status ableiten. Reine Funktionen, testbar.
 */

import { normalisiereFirma } from "@/lib/markt-radar/abgleich";

export const INVESTOR_TYPEN = [
  "Family Office",
  "Fonds/KVG",
  "Institutionell/Versicherung",
  "Bestandshalter",
  "Projektentwickler",
  "Semi-professionell",
  "Privat",
] as const;
export type InvestorTyp = (typeof INVESTOR_TYPEN)[number];

export type InvestorStatus = "aktiv" | "ruhend" | "kein_interesse" | "gesperrt";

/** Werte der Salesforce-Picklist Account.Type je Typ (Bestandshalter gibt es dort nicht). */
export const ACCOUNT_TYPE_JE_TYP: Record<InvestorTyp, string | null> = {
  "Family Office": "Family Office",
  "Fonds/KVG": "Fonds",
  "Institutionell/Versicherung": "Institutionell",
  Bestandshalter: null,
  Projektentwickler: "Projektenwickler",
  "Semi-professionell": "Semi-professionell",
  Privat: "Privat",
};

function klein(s: string | null | undefined): string {
  return (s ?? "").toLocaleLowerCase("de-DE");
}

/** Typ aus einem Salesforce-Wert (Account.Type, Investor_Type__c, Radar-Akteurtyp). */
export function typAusWert(wert: string | null | undefined): InvestorTyp | null {
  const w = klein(wert);
  if (!w) return null;
  if (/multi family|family office/.test(w)) return "Family Office";
  if (/fonds|kvg|fund|reit|spezialfonds/.test(w)) return "Fonds/KVG";
  if (/institiutionell|institutionell|versicherung|pensionskasse|versorgungswerk|bank/.test(w))
    return "Institutionell/Versicherung";
  if (/bestandshalter|wohnungs|asset manager/.test(w)) return "Bestandshalter";
  if (/projektenwickler|projektentwickler|bautr|developer|entwickler/.test(w))
    return "Projektentwickler";
  if (/semi/.test(w)) return "Semi-professionell";
  if (/privat/.test(w)) return "Privat";
  return null;
}

/** Typ aus Firmenname und Bemerkung (Regeln mit Beleg). */
export function typAusText(
  name: string | null,
  bemerkung: string | null,
): { typ: InvestorTyp; beleg: string } | null {
  const regeln: [RegExp, InvestorTyp][] = [
    [/family office|familienholding|vermögensverwaltung|vermoegensverwaltung/i, "Family Office"],
    [/kapitalverwaltung|\bkvg\b|fonds|\bfund\b|investment ?management|\breit\b/i, "Fonds/KVG"],
    [/versicherung|pensionskasse|versorgungswerk|sparkasse|volksbank|\bbank\b/i, "Institutionell/Versicherung"],
    [/wohnungsbau|wohnungsgesellschaft|wohnungsunternehmen|siedlungs|baugenossenschaft|wohnen\s?(gmbh|ag|eg)\b|bestandshalter/i, "Bestandshalter"],
    [/projektentwicklung|projektentwickler|development|bauträger|bautraeger|projekt\s?(gmbh|ag)/i, "Projektentwickler"],
  ];
  for (const [re, typ] of regeln) {
    const m = name?.match(re);
    if (m) return { typ, beleg: `Firmenname „${name}“` };
  }
  // In der Bemerkung steht meist, was gesucht wird („Projektentwicklung“), nicht wer sucht:
  // dort zählen nur eindeutige Selbstbezeichnungen.
  for (const [re, typ] of regeln.slice(0, 3)) {
    const m = bemerkung?.match(re);
    if (m) return { typ, beleg: `Bemerkung: „${m[0]}“` };
  }
  // Natürliche Person als Account (kein Firmenzusatz, zwei bis drei Wörter): Privat.
  if (name && !/[&]|gmbh|ag\b|kg\b|mbh|ug\b|se\b|e\.?k\.?|gbr|eg\b|holding|invest|immobilien|real estate|capital|verwaltung|gruppe|gebr|söhne|soehne/i.test(name)) {
    const woerter = name.trim().split(/\s+/);
    if (woerter.length >= 2 && woerter.length <= 3 && woerter.every((w) => /^[A-ZÄÖÜ][a-zäöüß.-]+$/.test(w)))
      return { typ: "Privat", beleg: `Account ist eine Person („${name}“)` };
  }
  return null;
}

function zahlDe(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export type Fund = { wert: number; beleg: string };

export type BemerkungsKriterien = {
  faktorMax?: Fund;
  einheitenMin?: Fund;
  grundstueckAbM2?: Fund;
  bgfAbM2?: Fund;
  renditeMin?: Fund;
};

/**
 * Liest Zahlenkriterien aus dem Freitext „Bemerkungsfeld“ der Ankaufsprofile.
 * Nur eindeutige Muster; der Beleg ist die gefundene Textstelle.
 */
export function kriterienAusBemerkung(text: string | null | undefined): BemerkungsKriterien {
  const t = text ?? "";
  const k: BemerkungsKriterien = {};
  const faktor =
    t.match(/(?:faktor|vervielfältiger|multiplikator)\s*(?:max\.?|maximal|bis(?: zu)?|von)?\s*(\d{1,2}(?:[.,]\d)?)/i) ??
    t.match(/(?:bis(?: zum)?|max\.?|maximal)\s*(\d{1,2}(?:[.,]\d)?)\s*-?\s*(?:fach|x\b|-fache)/i);
  if (faktor) {
    const w = zahlDe(faktor[1]);
    if (w >= 5 && w <= 50) k.faktorMax = { wert: w, beleg: faktor[0].trim() };
  }
  const einheiten = t.match(/(?:ab|mind\.?|mindestens|min\.?)\s*(\d{1,4})\s*(?:WE\b|Wohneinheiten|Einheiten|Wohnungen)/i);
  if (einheiten) k.einheitenMin = { wert: zahlDe(einheiten[1]), beleg: einheiten[0].trim() };
  const grund = t.match(/grundst(?:ü|ue)ck\w*\s*(?:ab|mind\.?|mindestens|min\.?)\s*([\d.,]+)\s*(?:m2|m²|qm)/i);
  if (grund) k.grundstueckAbM2 = { wert: zahlDe(grund[1]), beleg: grund[0].trim() };
  const bgf =
    t.match(/(?:min\.?|mind\.?|ab)\s*([\d.,]+)\s*(?:m2|m²|qm)?\s*BGF/i) ??
    t.match(/BGF\s*(?:ab|min\.?|mind\.?)\s*([\d.,]+)/i);
  if (bgf) k.bgfAbM2 = { wert: zahlDe(bgf[1]), beleg: bgf[0].trim() };
  const rendite = t.match(/(?:rendite|mietrendite)\s*(?:ab|min\.?|mind\.?|von)?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
  if (rendite) k.renditeMin = { wert: zahlDe(rendite[1]), beleg: rendite[0].trim() };
  return k;
}

/** Kreise und kreisfreie Städte je NRW-Regierungsbezirk, Schreibweise wie in Salesforce. */
export const NRW_BEZIRKE: Record<string, string[]> = {
  Düsseldorf: [
    "Düsseldorf", "Mönchengladbach", "Krefeld", "Duisburg", "Oberhausen", "Mülheim a. d. Ruhr", "Essen",
    "Wuppertal", "Solingen", "Remscheid", "Rhein-Kreis Neuss", "Kreis Mettmann", "Kreis Viersen", "Kreis Kleve",
    "Kreis Wesel",
  ],
  Köln: [
    "Köln", "Bonn", "Leverkusen", "Aachen", "Kreis Aachen", "Kreis Düren", "Rhein-Erft-Kreis", "Kreis Euskirchen",
    "Kreis Heinsberg", "Oberbergischer Kreis", "Rheinisch-Bergischer Kreis", "Rhein-Sieg-Kreis",
  ],
  Münster: [
    "Bottrop", "Gelsenkirchen", "Münster", "Kreis Borken", "Kreis Coesfeld", "Kreis Recklinghausen",
    "Kreis Steinfurt", "Kreis Warendorf",
  ],
  Arnsberg: [
    "Bochum", "Dortmund", "Hagen", "Hamm", "Herne", "Ennepe-Ruhr-Kreis", "Hochsauerlandkreis", "Märkischer Kreis",
    "Kreis Olpe", "Kreis Siegen-Wittgenstein", "Kreis Soest", "Kreis Unna",
  ],
  Detmold: [
    "Bielefeld", "Kreis Gütersloh", "Kreis Herford", "Kreis Höxter", "Kreis Lippe", "Kreis Minden-Lübbecke",
    "Kreis Paderborn",
  ],
};

/** Kommagetrennte Salesforce-Textliste („Köln , Bonn ,Köln ,“) ohne Leerwerte und Wiederholungen. */
export function textListe(wert: unknown): string[] {
  if (typeof wert !== "string") return [];
  const gesehen = new Set<string>();
  const ergebnis: string[] = [];
  for (const teil of wert.split(/[;,\n\r]+/)) {
    const t = teil.replace(/\s+/g, " ").trim();
    if (!t || t.toLowerCase() === "all") continue;
    const s = klein(t);
    if (gesehen.has(s)) continue;
    gesehen.add(s);
    ergebnis.push(t);
  }
  return ergebnis;
}

export type Regionsebene = "bundesweit" | "bundesland" | "regierungsbezirk" | "kreis" | "gemeinde";

/**
 * Verdichtet die Suchregionen eines Profils auf die gröbste vollständige Ebene:
 * alle Kreise eines Bezirks → „Bezirk Köln“, alle fünf Bezirke → „Nordrhein-Westfalen“.
 */
export function verdichteRegionen(sf: Record<string, unknown>): {
  ebene: Regionsebene | null;
  kurz: string[];
} {
  const laender = textListe(sf.Search_Bundesland__c);
  const kreise = textListe(sf.Search_Kreis_kreisfreie_Stadt__c);
  const gemeinden = textListe(sf.Search_Stadt_Gemeinde__c);
  const kreisSet = new Set(kreise.map(klein));
  const volle = Object.entries(NRW_BEZIRKE)
    .filter(([, ks]) => ks.every((k) => kreisSet.has(klein(k))))
    .map(([b]) => b);
  if (laender.length) {
    const nurNrw = laender.every((l) => /nordrhein/i.test(l));
    if (!nurNrw || volle.length === 5) return { ebene: "bundesland", kurz: laender };
  }
  if (volle.length === 5) return { ebene: "bundesland", kurz: ["Nordrhein-Westfalen"] };
  if (kreise.length) {
    const inVollen = new Set(volle.flatMap((b) => NRW_BEZIRKE[b]).map(klein));
    const rest = kreise.filter((k) => !inVollen.has(klein(k)));
    const kurz = [...volle.map((b) => `Bezirk ${b}`), ...rest];
    return { ebene: volle.length && !rest.length ? "regierungsbezirk" : "kreis", kurz };
  }
  if (gemeinden.length) return { ebene: "gemeinde", kurz: gemeinden };
  return { ebene: null, kurz: [] };
}

/** Volumen gilt erst ab 250.000 € als gepflegt (Werte wie 100.000 € sind Eingabefehler). */
export function volumenPlausibel(wert: number | null | undefined): boolean {
  return wert != null && Number.isFinite(wert) && wert >= 250_000 && wert <= 2_000_000_000;
}

export type StatusEingabe = {
  gesperrt: boolean;
  letzterKontaktAm: Date | null;
  /** Letzte Reaktion des Investors (Anruf, eingehende E-Mail, Interesse in einer Kampagne). */
  letzteRueckmeldungAm: Date | null;
  letzteMarktaktivitaetAm: Date | null;
  dealsOffen: number;
  absagen: number;
  interesse: number;
  heute: Date;
};

/**
 * aktiv: Rückmeldung des Investors, offener Deal oder Marktaktivität in 12 Monaten.
 * Reines Anschreiben durch Grenz zählt nicht. kein Interesse: nur Absagen.
 */
export function statusAus(e: StatusEingabe): { status: InvestorStatus; grund: string } {
  if (e.gesperrt) return { status: "gesperrt", grund: "DO NOT CONTACT in Salesforce" };
  const grenze = new Date(e.heute);
  grenze.setFullYear(grenze.getFullYear() - 1);
  if (e.letzteMarktaktivitaetAm && e.letzteMarktaktivitaetAm >= grenze)
    return { status: "aktiv", grund: "Ankauf oder Suche laut Markt-Radar in den letzten 12 Monaten" };
  if (e.dealsOffen > 0) return { status: "aktiv", grund: "Offener Deal" };
  if (e.absagen >= 2 && e.interesse === 0)
    return { status: "kein_interesse", grund: `${e.absagen} Absagen, kein Interesse gemeldet` };
  if (e.letzteRueckmeldungAm && e.letzteRueckmeldungAm >= grenze)
    return { status: "aktiv", grund: "Rückmeldung in den letzten 12 Monaten" };
  if (e.letzterKontaktAm && e.letzterKontaktAm >= grenze)
    return { status: "ruhend", grund: "In 12 Monaten nur angeschrieben, keine Rückmeldung" };
  return {
    status: "ruhend",
    grund: e.letzterKontaktAm ? "Letzter Kontakt älter als 12 Monate" : "Noch kein Kontakt erfasst",
  };
}

/** Schlüssel für Dublettenvergleich von Firmen. */
export function firmenSchluessel(name: string): string {
  return normalisiereFirma(name);
}

/** Paare von Accounts mit gleichem Firmenschlüssel. */
export function dublettenPaare<T extends { id: string; name: string }>(liste: T[]): [T, T][] {
  const je = new Map<string, T[]>();
  for (const x of liste) {
    const s = firmenSchluessel(x.name);
    if (s.length < 3) continue;
    je.set(s, [...(je.get(s) ?? []), x]);
  }
  const paare: [T, T][] = [];
  for (const gruppe of je.values()) {
    for (let i = 1; i < gruppe.length; i++) paare.push([gruppe[0], gruppe[i]]);
  }
  return paare;
}
