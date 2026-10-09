/**
 * Einordnung von Bankbuchungen für den Objekt-Cashflow (reine Funktionen).
 *
 * Jede Buchung bekommt eine Cashflow-Kategorie und, wo möglich, ein Objekt.
 * Reihenfolge der Objekt-Zuordnung: Darlehen/Mietvertrag → Adresse im
 * Verwendungszweck → Konto des Objekts → „Gesellschaft allgemein“.
 * Eine Darlehensrate mit „RECHN.ZINS … TILG. …“ wird in Zins und Tilgung geteilt.
 */
import type { BankAccount, Property, Transaction } from "@/lib/db/typen";

export const CF_GRUPPEN = [
  "einnahmen",
  "bewirtschaftung",
  "kapitaldienst",
  "investition",
  "finanzierung",
  "durchlaufend",
  "gesellschaft",
] as const;
export type CfGruppe = (typeof CF_GRUPPEN)[number];

export const CF_KATEGORIEN = {
  miete: { label: "Mieteinnahmen", gruppe: "einnahmen" },
  sonstige_einnahmen: { label: "Sonstige Einnahmen", gruppe: "einnahmen" },
  versorger: { label: "Energie & Versorger", gruppe: "bewirtschaftung" },
  grundbesitz: { label: "Grundbesitzabgaben", gruppe: "bewirtschaftung" },
  versicherung: { label: "Versicherung", gruppe: "bewirtschaftung" },
  instandhaltung: { label: "Instandhaltung", gruppe: "bewirtschaftung" },
  verwaltung: { label: "Verwaltung & Vermietung", gruppe: "bewirtschaftung" },
  bank: { label: "Bankgebühren", gruppe: "bewirtschaftung" },
  zinsen: { label: "Zinsen", gruppe: "kapitaldienst" },
  tilgung: { label: "Tilgung", gruppe: "kapitaldienst" },
  ankauf: { label: "Ankauf & Nebenkosten", gruppe: "investition" },
  sanierung: { label: "Sanierung & Ausbau", gruppe: "investition" },
  finanzierung: {
    label: "Darlehen & Eigenkapital",
    gruppe: "finanzierung",
  },
  kaution: { label: "Kautionen", gruppe: "durchlaufend" },
  nk_abrechnung: { label: "Nebenkostenabrechnung", gruppe: "durchlaufend" },
  steuern: { label: "Steuern", gruppe: "gesellschaft" },
  personal: { label: "Personal", gruppe: "gesellschaft" },
  gemeinkosten: { label: "Gemeinkosten", gruppe: "gesellschaft" },
  intercompany: { label: "Umbuchung Gruppe", gruppe: "gesellschaft" },
  sonstiges: { label: "Nicht zugeordnet", gruppe: "gesellschaft" },
} as const satisfies Record<string, { label: string; gruppe: CfGruppe }>;
export type CfKategorie = keyof typeof CF_KATEGORIEN;

export const gruppeVon = (k: CfKategorie): CfGruppe => CF_KATEGORIEN[k].gruppe;

export type Zuordnung =
  "darlehen" | "mietvertrag" | "adresse" | "konto" | "keine";

export interface CfPosten {
  txId: string;
  datum: string;
  monat: string;
  companyId: string;
  /** null = Gesellschaft allgemein */
  objektId: string | null;
  kategorie: CfKategorie;
  betrag: number;
  gegenpartei: string;
  zweck: string;
  zuordnung: Zuordnung;
}

export interface EinordnungKontext {
  accounts: BankAccount[];
  properties: Property[];
}

/** Kleinbuchstaben, Umlaute ausgeschrieben, „Straße/Str.“ vereinheitlicht. */
export function normal(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/strasse|str\./g, "str");
}

/**
 * Suchwörter je Objekt aus Straße und Ort: der Straßenname ohne Hausnummer
 * und ohne „str“, dazu der Ort, wenn ihn kein anderes Objekt hat.
 * Varianten ohne Umlaut („Konigsberger“, „Huckelhoven“) werden mit erkannt.
 */
export function objektMuster(properties: Property[]): Map<string, RegExp> {
  const orte = new Map<string, number>();
  for (const p of properties)
    orte.set(normal(p.city), (orte.get(normal(p.city)) ?? 0) + 1);
  const muster = new Map<string, RegExp>();
  for (const p of properties) {
    const woerter = new Set<string>();
    for (const quelle of [p.street, p.name]) {
      const kern = normal(quelle)
        .replace(/\d+\s*[a-z]?\b/g, " ")
        .replace(/str\b|strasse\b/g, " ")
        .replace(/[^a-z\- ]/g, " ")
        .split(/[\s-]+/)
        .filter((w) => w.length >= 5);
      for (const w of kern) woerter.add(w);
    }
    const ort = normal(p.city);
    if (ort.length >= 5 && orte.get(ort) === 1 && !/duesseldorf/.test(ort))
      woerter.add(ort);
    if (woerter.size === 0) continue;
    const alternativen = [...woerter].map((w) =>
      w.replace(/ae|oe|ue/g, (u) => `(?:${u}|${u[0]})`),
    );
    muster.set(p.id, new RegExp(`(${alternativen.join("|")})`, "i"));
  }
  return muster;
}

const R = (s: string) => new RegExp(s, "i");

/** Regeln in Prüfreihenfolge: die erste passende gewinnt. */
const REGELN: Array<{ k: CfKategorie; re: RegExp; nur?: "ein" | "aus" }> = [
  { k: "kaution", re: R("kaution") },
  {
    k: "nk_abrechnung",
    re: R("nebenkosten|betriebskosten|nk-?abrechnung|bk-?abrechnung"),
  },
  { k: "grundbesitz", re: R("grundsteuer|grundbesitz") },
  {
    k: "steuern",
    re: R(
      "finanzamt|steuerverwaltung|finanzverwaltung|gewerbesteuer|koerperschaft|lohnsteuer|kapitalertrag|umsatzsteuer \\d{4}|ust-?voranmeldung",
    ),
  },
  {
    k: "ankauf",
    re: R(
      "kaufpreis|grunderwerb|notar|makler|gutachter|grundbuch|zahlstelle justiz|amtsgericht",
    ),
  },
  {
    k: "sanierung",
    re: R("ordenat|equestrian|bauantrag|architekt|statik|sanierung|quadrat x"),
  },
  {
    k: "personal",
    re: R(
      "gehalt|lohn|aushilf|krankenkasse|knappschaft|\\baok\\b|barmer|\\bdak\\b|\\bikk\\b|sozialversicherung|berufsgenossenschaft|minijob",
    ),
  },
  {
    k: "versorger",
    re: R(
      "stadtwerke|energie|wasser|\\bstrom|\\bgas\\b|waerme|techem|\\bista\\b|minol|brunata|heizoel|fernwaerme|abfall|awista|entsorgung|schornstein",
    ),
  },
  {
    k: "versicherung",
    re: R(
      "versicherung|allianz|\\baxa\\b|provinzial|r\\+v|gothaer|\\bhdi\\b|\\bergo\\b|signal iduna|basler|\\bvhv\\b|wuerttembergische|helvetia",
    ),
  },
  {
    k: "grundbesitz",
    re: R(
      "landeshaupt|stadtkasse|kreiskasse|\\bstadt\\b|gemeinde|kassenzeichen",
    ),
  },
  {
    k: "instandhaltung",
    re: R(
      "haustechnik|sanitaer|heizung|elektro|dachdeck|maler|baumarkt|reparatur|wartung|schaedling|hausmeister|garten|reinigung|aufzug|rohr|schluessel|glaser|handwerk|fliesen|tischler|schreiner|rauchmelder|kleintransport",
    ),
    nur: "aus",
  },
  {
    k: "verwaltung",
    re: R(
      "hausverwaltung|immobilienverwaltung|raumgut|immoscout|immobilien ?scout|immowelt|rechtsanw|anwalt|inkasso|mieterverein",
    ),
  },
  {
    k: "bank",
    re: R(
      "^abschluss|abschluss per|rechnungsabschluss|kontofuehrung|einrichtung ebics|umsatzsteuer auf|ust-umbuchung|^entgelt",
    ),
  },
  {
    k: "gemeinkosten",
    re: R(
      "steuerberat|stbg|telekom|vodafone|microsoft|devbox|paypal|amazon|audible|shell|esso|aral|tankstelle|crefo|ihk|software|envato|apple",
    ),
    nur: "aus",
  },
  {
    k: "miete",
    re: R(
      "miete|mietzahlung|garage|stellplatz|bundesagentur|jobcenter|sozialamt|wohngeld|\\b[1-4]\\.? ?og\\b|\\beg\\b|\\bdg\\b",
    ),
    nur: "ein",
  },
];

const ZINS_TILG =
  /rechn\.?\s*zins\s+([\d.]+,\d\d).*?tilg\.?\/?(?:entg\.?)?\s+([\d.]+,\d\d)/i;
const zahl = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

function kapitaldienstTeile(
  betrag: number,
  text: string,
): Array<{ k: CfKategorie; betrag: number }> | null {
  const m = text.match(ZINS_TILG);
  if (m && betrag < 0) {
    const zins = zahl(m[1]);
    const tilg = zahl(m[2]);
    if (Math.abs(zins + tilg + betrag) < 0.05)
      return [
        { k: "zinsen", betrag: -zins },
        { k: "tilgung", betrag: -tilg },
      ];
  }
  if (/darlehensabschluss|zinsen|zinszahlung|\bzins\b/i.test(text))
    return [{ k: "zinsen", betrag }];
  if (/tilgung|teilzahlung darlehen|darlehenstilgung/i.test(text))
    return [{ k: betrag < 0 ? "tilgung" : "finanzierung", betrag }];
  return null;
}

/** Kategorie(n) einer Buchung, ohne Objekt. */
export function kategorisieren(
  tx: Transaction,
  eigeneIbans: Set<string>,
): Array<{ k: CfKategorie; betrag: number }> {
  const text = normal(`${tx.counterpartyName} ${tx.purpose}`);
  const kd = kapitaldienstTeile(tx.amount, text);
  if (kd) return kd;
  if (tx.category === "darlehen")
    return [
      { k: tx.amount > 0 ? "finanzierung" : "tilgung", betrag: tx.amount },
    ];
  if (tx.category === "miete") return [{ k: "miete", betrag: tx.amount }];

  const gruppe =
    (tx.counterpartyIban && eigeneIbans.has(tx.counterpartyIban)) ||
    /frenken|mtf capital|hbf gmbh|grenz & co|tradeanymachine/.test(
      normal(tx.counterpartyName),
    );
  if (gruppe) {
    if (/darle?hn|darlehen|valutierung|ankauf|einlage|stammkapital/.test(text))
      return [{ k: "finanzierung", betrag: tx.amount }];
    if (/gehalt/.test(text)) return [{ k: "personal", betrag: tx.amount }];
    return [{ k: "intercompany", betrag: tx.amount }];
  }
  if (/valutierung|darlehensauszahlung/.test(text))
    return [{ k: "finanzierung", betrag: tx.amount }];

  const richtung = tx.amount >= 0 ? "ein" : "aus";
  for (const r of REGELN) {
    if (r.nur && r.nur !== richtung) continue;
    if (r.re.test(text)) return [{ k: r.k, betrag: tx.amount }];
  }
  if (richtung === "ein")
    return [{ k: "sonstige_einnahmen", betrag: tx.amount }];
  return [{ k: "sonstiges", betrag: tx.amount }];
}

/** Alle Buchungen eingeordnet; Umbuchungen innerhalb der Gruppe bleiben drin (Gruppe „gesellschaft“). */
export function einordnen(
  transactions: Transaction[],
  ctx: EinordnungKontext,
): CfPosten[] {
  const konto = new Map(ctx.accounts.map((a) => [a.iban, a]));
  const eigeneIbans = new Set(ctx.accounts.map((a) => a.iban));
  const muster = objektMuster(ctx.properties);
  const posten: CfPosten[] = [];
  for (const tx of transactions) {
    const k = konto.get(tx.accountId);
    const companyId = k?.companyId ?? "";
    const text = normal(`${tx.counterpartyName} ${tx.purpose}`);
    let adresse: string | null = null;
    for (const [id, re] of muster)
      if (re.test(text)) {
        adresse = id;
        break;
      }
    for (const teil of kategorisieren(tx, eigeneIbans)) {
      const g = gruppeVon(teil.k);
      let objektId: string | null = null;
      let zuordnung: Zuordnung = "keine";
      if (g !== "gesellschaft") {
        if (
          tx.propertyId &&
          (tx.category === "darlehen" || tx.category === "miete")
        ) {
          objektId = tx.propertyId;
          zuordnung = tx.category === "darlehen" ? "darlehen" : "mietvertrag";
        } else if (adresse) {
          objektId = adresse;
          zuordnung = "adresse";
        } else if (k?.propertyId) {
          objektId = k.propertyId;
          zuordnung = "konto";
        }
      }
      posten.push({
        txId: tx.id,
        datum: tx.bookingDate,
        monat: tx.bookingDate.slice(0, 7),
        companyId,
        objektId,
        kategorie: teil.k,
        betrag: teil.betrag,
        gegenpartei: tx.counterpartyName,
        zweck: tx.purpose,
        zuordnung,
      });
    }
  }
  return posten;
}
