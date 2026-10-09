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
  verkauf: { label: "Verkaufserlöse", gruppe: "investition" },
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
/**
 * Bestätigte Merkmale ohne Adresse im Text (Urkundennummer, Verkäufer),
 * je Objekt-ID. Von Maurice bestätigt am 09.10.2026.
 */
const OBJEKT_STICHWORTE: Record<string, string[]> = {
  // Kauf Alt-Pempelfort 7: UVZ 1286/2025 Notar Ulbrich, Verkäufer Klees/Scholz
  "O-02": ["1286/2025", "ulrich klees", "michael klees", "gisela gerda scholz"],
};

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
    for (const w of OBJEKT_STICHWORTE[p.id] ?? [])
      alternativen.push(w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"));
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
  { k: "grundbesitz", re: R("grundsteuer|grundbesitzabgab") },
  {
    k: "ankauf",
    re: R(
      "kaufpreis|grunderwerb|notar|makler|gutachter|grundbuch|zahlstelle justiz|amtsgericht",
    ),
  },
  {
    k: "steuern",
    re: R(
      "finanzamt|steuerverwaltung|finanzverwaltung|gewerbesteuer|koerperschaft|lohnsteuer|kapitalertrag|umsatzsteuer \\d{4}|ust-?voranmeldung",
    ),
  },
  {
    k: "sanierung",
    re: R("ordenat|equestrian|bauantrag|architekt|statik|sanierung|quadrat x"),
  },
  {
    k: "personal",
    re: R(
      "gehalt|lohn|aushilf|krankenkasse|knappschaft|\\baok\\b|barmer|\\bdak\\b|\\bikk\\b|sozialversicherung|berufsgenossenschaft|minijob|\\bvbg\\b|bonus|sonderzahlung",
    ),
  },
  {
    k: "versorger",
    re: R(
      "stadtwerke|energie|wasser|\\bstrom|\\bgas\\b|waerme|techem|\\bista\\b|minol|brunata|heizoel|fernwaerme|abfall|awista|entsorgung|schornstein|sonnen herzog|rundfunk",
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
      "haustechnik|sanitaer|heizung|elektro|dachdeck|maler|baumarkt|reparatur|wartung|schaedling|hausmeister|garten|reinigung|aufzug|rohr|schluessel|glaser|handwerk|fliesen|tischler|schreiner|rauchmelder|kleintransport|entruempelung|shk|gebaeudetechnik|geruest|brandschutz|bauhaus|mobau|raiffeisen waren|eisenjansen|baustoff|hornbach|obi\\b",
    ),
    nur: "aus",
  },
  {
    k: "verwaltung",
    re: R(
      "hausverwaltung|immobilienverwaltung|raumgut|immoscout|immobilien ?scout|immowelt|rechtsanw|anwalt|inkasso|mieterverein|hausgeld|\\bweg\\b",
    ),
  },
  {
    k: "bank",
    re: R(
      "^abschluss|abschluss per|jahrespreis girocard|rechnungsabschluss|kontofuehrung|einrichtung ebics|umsatzsteuer auf|ust-umbuchung|^entgelt",
    ),
  },
  {
    k: "gemeinkosten",
    re: R(
      "steuerberat|stbg|telekom|vodafone|microsoft|devbox|paypal|amazon|audible|shell|esso|aral|tankstelle|crefo|ihk|software|envato|apple|google|deutsche post|\\bdhl\\b|postfiliale|altstadtpost|francotyp|cartridge|office discount|boettcher|meta platforms|bundesanzeiger|handelskammer|salesforce|\\btank|\\bjet\\b|couche-tard|mr\\.? wash|trattoria|ristorante|restaurant|adyen|sg-vr payment|bussgeld|hotel|rotonda|immodeal|immomates|visa abrechnung|dz bank|coffee|bundeskasse|comfort m\\.?b\\.?c",
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
  const gruppe =
    (tx.counterpartyIban && eigeneIbans.has(tx.counterpartyIban)) ||
    /frenken|mtf capital|hbf gmbh|grenz & co|tradeanymachine/.test(
      normal(tx.counterpartyName),
    );
  if (gruppe) {
    // reine Zinszahlung auf ein Gruppendarlehen: beim Zahler Kapitaldienst
    const tilgt = /rueckfuehrung|rueckzahlung|auszahlung|tilgung/.test(text);
    if (/zins/.test(text) && !tilgt)
      return [
        { k: tx.amount < 0 ? "zinsen" : "intercompany", betrag: tx.amount },
      ];
    if (
      tilgt ||
      /darle?hn|darlehen|valutierung|ankauf|einlage|stammkapital/.test(text)
    )
      return [{ k: "finanzierung", betrag: tx.amount }];
    if (/gehalt/.test(text)) return [{ k: "personal", betrag: tx.amount }];
    return [{ k: "intercompany", betrag: tx.amount }];
  }
  const kd = kapitaldienstTeile(tx.amount, text);
  if (kd) return kd;
  if (tx.category === "darlehen")
    return [
      { k: tx.amount > 0 ? "finanzierung" : "tilgung", betrag: tx.amount },
    ];
  if (tx.category === "miete") return [{ k: "miete", betrag: tx.amount }];

  if (/kaufpreis/.test(text) && tx.amount > 0)
    return [{ k: "verkauf", betrag: tx.amount }];
  if (/valutierung|darlehensauszahlung|\bdarle?hn\b/.test(text))
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

/** Obergrenze für Eingänge ohne Stichwort, die auf einem Mietkonto als Miete zählen */
const MIETE_OHNE_STICHWORT_BIS = 3_000;

/** Alle Buchungen eingeordnet; Umbuchungen innerhalb der Gruppe bleiben drin (Gruppe „gesellschaft“). */
export function einordnen(
  transactions: Transaction[],
  ctx: EinordnungKontext,
): CfPosten[] {
  const konto = new Map(ctx.accounts.map((a) => [a.iban, a]));
  const eigeneIbans = new Set(ctx.accounts.map((a) => a.iban));
  const muster = objektMuster(ctx.properties);
  const objektFirma = new Map(ctx.properties.map((p) => [p.id, p.companyId]));
  // Gegenbuchung am selben Tag auf einem anderen Konto derselben Gesellschaft
  // (Kontoauszüge aus PDFs haben oft keine Gegen-IBAN)
  const buchungsSchluessel = (firma: string, t: Transaction, betrag: number) =>
    `${firma}|${t.bookingDate}|${betrag.toFixed(2)}`;
  const schluessel = new Map<string, Set<string>>();
  for (const t of transactions) {
    const firma = konto.get(t.accountId)?.companyId ?? "";
    const key = buchungsSchluessel(firma, t, t.amount);
    if (!schluessel.has(key)) schluessel.set(key, new Set());
    schluessel.get(key)!.add(t.accountId);
  }
  const posten: CfPosten[] = [];
  for (const tx of transactions) {
    const k = konto.get(tx.accountId);
    const companyId = k?.companyId ?? "";
    const text = normal(`${tx.counterpartyName} ${tx.purpose}`);
    // Adresse zählt nur für Objekte der eigenen Gesellschaft
    let adresse: string | null = null;
    for (const [id, re] of muster)
      if (objektFirma.get(id) === companyId && re.test(text)) {
        adresse = id;
        break;
      }
    // Umbuchung zwischen zwei Konten derselben Gesellschaft
    const gegen = schluessel.get(buchungsSchluessel(companyId, tx, -tx.amount));
    const eigenUmbuchung =
      (tx.counterpartyIban != null &&
        konto.get(tx.counterpartyIban)?.companyId === companyId) ||
      (gegen != null &&
        [...gegen].some((iban) => iban !== tx.accountId) &&
        /frenken|umbuchung/i.test(`${tx.counterpartyName} ${tx.purpose}`));
    const teile: Array<{ k: CfKategorie; betrag: number }> = eigenUmbuchung
      ? [{ k: "intercompany", betrag: tx.amount }]
      : kategorisieren(tx, eigeneIbans);
    for (const teil of teile) {
      // kleiner Eingang ohne Stichwort auf dem Mietkonto eines Objekts: Miete
      if (
        teil.k === "sonstige_einnahmen" &&
        k?.propertyId &&
        teil.betrag <= MIETE_OHNE_STICHWORT_BIS
      )
        teil.k = "miete";
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
