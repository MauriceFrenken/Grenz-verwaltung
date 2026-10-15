/**
 * Cashflow je Liegenschaft aus echten Bankumsätzen (reine Funktionen).
 *
 * Aufbau wie die DCF-Kalkulation (Mieteinnahmen → Bewirtschaftung → NOI →
 * Kapitaldienst → Cashflow), aber monatlich, aus der Bank (Ist) und mit
 * Soll aus den Mietverträgen und einem Plan daneben.
 * Kosten ohne Objektbezug stehen getrennt unter „Gesellschaft allgemein“.
 *
 * Periodisierung: Jahres-, Halbjahres- und Quartalszahlungen (Grundbesitz-
 * abgaben, Versicherungen, Wartungsverträge) werden auf die Monate verteilt,
 * für die sie gelten. Der Unterschied zur Zahlung steht als „Zeitliche
 * Abgrenzung“ unter dem Cashflow, so dass die Veränderung des Bankbestands
 * weiter stimmt.
 */
import {
  monatsanfang,
  monatsende,
  plusMonate,
  type IsoDatum,
} from "@/lib/kalender";
import type { BoardDaten, ObjektFixkosten } from "@/lib/db/typen";
import type { DarlehenStand } from "@/modules/darlehen/logik/auswertung";
import { runden } from "@/modules/darlehen/logik/zinsplan";
import { sollMiete } from "@/modules/immobilien/logik/mieten";
import {
  CF_KATEGORIEN,
  einordnen,
  gruppeVon,
  normal,
  UMLAGEFAEHIG,
  type CfGruppe,
  type CfKategorie,
  type CfPosten,
} from "./einordnung";

/** Plan-Annahmen; Werte aus der bisherigen DCF-Kalkulation übernommen. */
export const PLAN_ANNAHMEN = {
  /** nicht umlagefähige Instandhaltung je m² Wohnfläche und Jahr */
  instandhaltungJeQmJahr: 10,
  /** Verwaltung und Vermietung in % der Kaltmiete */
  verwaltungQuote: 0.04,
  /** Mietausfall in % der Netto-Kaltmiete */
  mietausfallQuote: 0.02,
} as const;

export type Summenzeile =
  | "einnahmen"
  | "betriebskosten"
  | "nichtUmlagefaehig"
  | "bewirtschaftung"
  | "noi"
  | "cfVorTilgung"
  | "kapitaldienst"
  | "cfNachKd"
  | "investition"
  | "finanzierung"
  | "durchlaufend"
  | "netto";

type Werte = Record<CfKategorie, number>;

const leer = (): Werte =>
  Object.fromEntries(
    (Object.keys(CF_KATEGORIEN) as CfKategorie[]).map((k) => [k, 0]),
  ) as Werte;

function summen(w: Werte): Record<Summenzeile, number> {
  const g = (gr: CfGruppe) =>
    (Object.keys(w) as CfKategorie[])
      .filter((k) => gruppeVon(k) === gr)
      .reduce((s, k) => s + w[k], 0);
  const einnahmen = g("einnahmen");
  const bewirtschaftung = g("bewirtschaftung");
  const betriebskosten = (Object.keys(w) as CfKategorie[])
    .filter((k) => UMLAGEFAEHIG.has(k))
    .reduce((s, k) => s + w[k], 0);
  const noi = einnahmen + bewirtschaftung;
  const kapitaldienst = g("kapitaldienst");
  const cfNachKd = noi + kapitaldienst;
  const investition = g("investition");
  const finanzierung = g("finanzierung");
  const durchlaufend = g("durchlaufend");
  return {
    einnahmen: runden(einnahmen),
    betriebskosten: runden(betriebskosten),
    nichtUmlagefaehig: runden(bewirtschaftung - betriebskosten),
    bewirtschaftung: runden(bewirtschaftung),
    noi: runden(noi),
    cfVorTilgung: runden(noi + w.zinsen),
    kapitaldienst: runden(kapitaldienst),
    cfNachKd: runden(cfNachKd),
    investition: runden(investition),
    finanzierung: runden(finanzierung),
    durchlaufend: runden(durchlaufend),
    netto: runden(cfNachKd + investition + finanzierung + durchlaufend),
  };
}

export interface CfMonat {
  /** JJJJ-MM */
  monat: string;
  /** false = laufender Monat, zählt nicht in die 12-Monats-Summe */
  abgeschlossen: boolean;
  /** true = für diesen Monat liegen Bankdaten des Objekts vor */
  mitDaten: boolean;
  /** Netto-Kaltmiete laut Verträgen */
  sollMiete: number;
  werte: Werte;
  summen: Record<Summenzeile, number>;
}

export interface CfPlan {
  /** Netto-Kaltmiete laut Verträgen */
  sollMiete: number;
  mietausfall: number;
  /** Nebenkostenvorauszahlungen laut Verträgen (decken die umlagefähigen Kosten) */
  umlagefaehig: number;
  instandhaltung: number;
  verwaltung: number;
  noi: number;
  kapitaldienst: number;
  cfNachKd: number;
}

/** Kennzahlen eines Investors, auf 12 Monate hochgerechnet aus dem Vergleichszeitraum */
export interface Kennzahlen {
  /** Anzahl Monate, aus denen hochgerechnet wird */
  monate: number;
  noiJahr: number;
  cfJahr: number;
  tilgungJahr: number;
  /** Cashflow nach Kapitaldienst / eingesetztes Eigenkapital */
  cashOnCash: number | null;
  /** NOI / (Kaufpreis + Kaufnebenkosten) */
  noiRendite: number | null;
  /** nicht umlagefähige Kosten / Ist-Netto-Kaltmiete */
  kostenquote: number | null;
}

export interface ObjektCf {
  /** null = Gesellschaft allgemein */
  objektId: string | null;
  companyId: string;
  name: string;
  flaeche: number;
  einheiten: number;
  monate: CfMonat[];
  /** Summe der abgeschlossenen Monate mit Daten */
  summe: {
    werte: Werte;
    summen: Record<Summenzeile, number>;
    sollMiete: number;
  };
  /** Plan über dieselben Monate wie die Summe */
  plan: CfPlan;
  /** Anzahl Monate im Vergleich (abgeschlossen und mit Daten) */
  vergleichsMonate: number;
  /** erster Monat mit Bankdaten, null = keine */
  datenAb: string | null;
  /** Ist-Netto-Kaltmiete / Soll-Netto-Kaltmiete im Vergleichszeitraum */
  mieteQuote: number | null;
  /** NOI / Kapitaldienst im Vergleichszeitraum */
  dscr: number | null;
  /** eingesetztes Eigenkapital laut Stammdaten */
  eigenkapital: number | null;
  /** Kaufpreis + Kaufnebenkosten */
  gesamtinvest: number | null;
  kennzahlen: Kennzahlen;
  /** Bankbuchungen wie gezahlt (ohne Periodisierung) */
  posten: CfPosten[];
}

export interface CashflowAuswertung {
  monate: string[];
  objekte: ObjektCf[];
  allgemein: ObjektCf[];
  /** Posten, die eine Prüfung brauchen (keine Kategorie oder kein Objekt) */
  pruefliste: CfPosten[];
  portfolio: {
    monate: CfMonat[];
    summe: ObjektCf["summe"];
    plan: CfPlan;
    dscr: number | null;
    kennzahlen: Kennzahlen;
    eigenkapital: number;
  };
  /** Anteil der Ausgaben, die eine Kategorie haben (0–1) */
  einordnungsQuote: number;
}

/** Monatsschlüssel: die letzten `anzahl` abgeschlossenen Monate plus der laufende. */
export function cfMonate(stichtag: IsoDatum, anzahl = 12): string[] {
  const monate: string[] = [];
  for (let i = anzahl; i >= 0; i--)
    monate.push(monatsanfang(plusMonate(stichtag, -i)).slice(0, 7));
  return monate;
}

const plusMonat = (monat: string, n: number) =>
  plusMonate(`${monat}-01`, n).slice(0, 7);

function monatsReihe(von: string, anzahl: number): string[] {
  return Array.from({ length: anzahl }, (_, i) => plusMonat(von, i));
}

/** Kategorien, deren Zahlungen auf mehrere Monate verteilt werden können */
const PERIODISIERBAR: ReadonlySet<CfKategorie> = new Set<CfKategorie>([
  "grundbesitz",
  "versicherung",
  "versorger",
  "instandhaltung",
]);
const ZEITRAUM =
  /zeitraum:?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:-|bis)\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/;
/** Abgaben der Kommune, die quartalsweise (15.2./15.5./15.8./15.11.) fällig werden */
const QUARTALS_ABGABE =
  /grundsteuer|grundbesitzabgab|abgaben lt|abfall|strassenreinigung|schmutzwasser|niederschlag/;

/**
 * Monate, auf die eine Ausgabe wirtschaftlich entfällt; null = Monat der Zahlung.
 * Reihenfolge: „Zeitraum TT.MM.JJJJ-TT.MM.JJJJ“ im Text → passender Eintrag
 * in den festen Kosten des Objekts (Betrag ±1 %) → Versicherung jährlich,
 * Grundbesitzabgaben quartalsweise.
 */
export function abdeckung(
  p: CfPosten,
  fix: ObjektFixkosten[] = [],
): string[] | null {
  if (p.betrag >= 0 || !PERIODISIERBAR.has(p.kategorie)) return null;
  const text = normal(`${p.gegenpartei} ${p.zweck}`);
  const z = text.match(ZEITRAUM);
  if (z) {
    const von = `${z[3]}-${z[2].padStart(2, "0")}`;
    const bis = `${z[6]}-${z[5].padStart(2, "0")}`;
    // „bis 31.12.“ schließt den Monat ein, „bis 12.05.“ (Jahrestag) nicht
    const letzter = Number(z[4]) >= 28 ? bis : plusMonat(bis, -1);
    const reihe: string[] = [];
    for (let m = von; m <= letzter && reihe.length < 25; m = plusMonat(m, 1))
      reihe.push(m);
    if (reihe.length >= 2 && reihe.length <= 24) return reihe;
  }
  const betrag = -p.betrag;
  const treffer = fix.find(
    (f) =>
      f.rhythmus !== "monatlich" &&
      f.betrag > 0 &&
      Math.abs(f.betrag - betrag) <= Math.max(1, f.betrag * 0.01),
  );
  const rhythmus =
    treffer?.rhythmus ??
    (p.kategorie === "versicherung" && betrag >= 100
      ? "jaehrlich"
      : p.kategorie === "grundbesitz" &&
          (QUARTALS_ABGABE.test(text) ||
            ([2, 5, 8, 11].includes(Number(p.datum.slice(5, 7))) &&
              Number(p.datum.slice(8, 10)) >= 10 &&
              Number(p.datum.slice(8, 10)) <= 20))
        ? "quartalsweise"
        : null);
  if (!rhythmus || rhythmus === "monatlich") return null;
  const jahr = p.monat.slice(0, 4);
  const mon = Number(p.monat.slice(5, 7));
  if (rhythmus === "jaehrlich") return monatsReihe(p.monat, 12);
  if (rhythmus === "halbjaehrlich")
    return monatsReihe(`${jahr}-${mon <= 6 ? "01" : "07"}`, 6);
  const q = Math.floor((mon - 1) / 3) * 3 + 1;
  return monatsReihe(`${jahr}-${String(q).padStart(2, "0")}`, 3);
}

/**
 * Verteilt Jahres-/Quartalszahlungen auf ihre Monate. Die Zahlung selbst
 * wird zur „Zeitlichen Abgrenzung“, jeder Monat bekommt seinen Anteil als
 * Kosten und als Gegenposten in der Abgrenzung. `vorlauf` sind Zahlungen vor
 * dem Auswertungszeitraum, deren Anteile noch in ihn fallen.
 */
export function periodisieren(
  posten: CfPosten[],
  fix: ObjektFixkosten[] = [],
  vorlauf: CfPosten[] = [],
): CfPosten[] {
  const ergebnis: CfPosten[] = [];
  const verteilen = (p: CfPosten, monate: string[]) => {
    const anteil = runden(p.betrag / monate.length);
    monate.forEach((monat, i) => {
      const betrag =
        i === monate.length - 1
          ? runden(p.betrag - anteil * (monate.length - 1))
          : anteil;
      ergebnis.push({ ...p, monat, betrag });
      ergebnis.push({ ...p, monat, kategorie: "abgrenzung", betrag: -betrag });
    });
  };
  for (const p of vorlauf) {
    const monate = abdeckung(p, fix);
    if (monate) verteilen(p, monate);
  }
  for (const p of posten) {
    const monate = abdeckung(p, fix);
    if (!monate) {
      ergebnis.push(p);
      continue;
    }
    ergebnis.push({ ...p, kategorie: "abgrenzung" });
    verteilen(p, monate);
  }
  return ergebnis;
}

function kennzahlenBerechnen(
  monate: number,
  werte: Werte,
  s: Record<Summenzeile, number>,
  eigenkapital: number | null,
  gesamtinvest: number | null,
): Kennzahlen {
  const f = monate ? 12 / monate : 0;
  const noiJahr = runden(s.noi * f);
  const cfJahr = runden(s.cfNachKd * f);
  return {
    monate,
    noiJahr,
    cfJahr,
    tilgungJahr: runden(-werte.tilgung * f),
    cashOnCash: monate && eigenkapital ? cfJahr / eigenkapital : null,
    noiRendite: monate && gesamtinvest ? noiJahr / gesamtinvest : null,
    kostenquote: werte.miete > 0 ? -s.nichtUmlagefaehig / werte.miete : null,
  };
}

function kapitaldienstPlan(
  staende: DarlehenStand[],
  objektId: string,
  monat: string,
): number {
  const anfang = `${monat}-01`;
  const ende = monatsende(anfang);
  return staende
    .filter((s) => s.loan.propertyId === objektId)
    .reduce(
      (s, d) =>
        s +
        d.plan
          .filter((z) => z.dueDate >= anfang && z.dueDate <= ende)
          .reduce(
            (a, z) =>
              a +
              z.interest +
              (d.loan.repayment.kind === "endfaellig" ? 0 : z.principal),
            0,
          ),
      0,
    );
}

/**
 * Mieteingänge auf der Bank sind Warmmiete. Je Monat wird der Anteil der
 * Nebenkostenvorauszahlungen laut Verträgen als „Umlagen“ abgespalten, so
 * dass Mieteinnahmen die Netto-Kaltmiete zeigen. Die Umlagen stehen in der
 * Bewirtschaftung gegen die umlagefähigen Kosten.
 */
export function mieteTeilen(
  posten: CfPosten[],
  soll: (monat: string) => { warm: number; kalt: number },
): CfPosten[] {
  const ergebnis: CfPosten[] = [];
  for (const p of posten) {
    if (p.kategorie !== "miete") {
      ergebnis.push(p);
      continue;
    }
    const { warm, kalt } = soll(p.monat);
    const anteil = warm > 0 ? (warm - kalt) / warm : 0;
    const umlage = runden(p.betrag * anteil);
    if (!umlage) {
      ergebnis.push(p);
      continue;
    }
    ergebnis.push({ ...p, betrag: runden(p.betrag - umlage) });
    ergebnis.push({ ...p, kategorie: "umlagen", betrag: umlage });
  }
  return ergebnis;
}

function aufbauen(
  kopf: Pick<
    ObjektCf,
    | "objektId"
    | "companyId"
    | "name"
    | "flaeche"
    | "einheiten"
    | "eigenkapital"
    | "gesamtinvest"
  >,
  posten: CfPosten[],
  monate: string[],
  laufend: string,
  datenAb: string | null,
  soll: (monat: string) => { warm: number; kalt: number },
  kdPlan: (monat: string) => number,
  anzeige: CfPosten[] = posten,
): ObjektCf {
  const cfMonate: CfMonat[] = monate.map((monat) => {
    const werte = leer();
    for (const p of posten)
      if (p.monat === monat) werte[p.kategorie] += p.betrag;
    for (const k of Object.keys(werte) as CfKategorie[])
      werte[k] = runden(werte[k]);
    return {
      monat,
      abgeschlossen: monat < laufend,
      mitDaten: datenAb != null && monat >= datenAb,
      sollMiete: runden(soll(monat).kalt),
      werte,
      summen: summen(werte),
    };
  });
  const vergleich = cfMonate.filter((m) => m.abgeschlossen && m.mitDaten);
  const werte = leer();
  for (const m of vergleich)
    for (const k of Object.keys(werte) as CfKategorie[]) werte[k] += m.werte[k];
  for (const k of Object.keys(werte) as CfKategorie[])
    werte[k] = runden(werte[k]);
  const s = summen(werte);
  const sollWarm = vergleich.reduce((a, m) => a + soll(m.monat).warm, 0);
  const sollKalt = vergleich.reduce((a, m) => a + m.sollMiete, 0);
  const kd = vergleich.reduce((a, m) => a + kdPlan(m.monat), 0);
  // Plan auf Basis Netto-Kaltmiete; umlagefähige Kosten und Umlagen heben sich auf
  const mietausfall = sollKalt * PLAN_ANNAHMEN.mietausfallQuote;
  const umlagefaehig = sollWarm - sollKalt;
  const instandhaltung =
    (kopf.flaeche * PLAN_ANNAHMEN.instandhaltungJeQmJahr * vergleich.length) /
    12;
  const verwaltung = sollKalt * PLAN_ANNAHMEN.verwaltungQuote;
  const noiPlan = sollKalt - mietausfall - instandhaltung - verwaltung;
  const plan: CfPlan = {
    sollMiete: runden(sollKalt),
    mietausfall: runden(mietausfall),
    umlagefaehig: runden(umlagefaehig),
    instandhaltung: runden(instandhaltung),
    verwaltung: runden(verwaltung),
    noi: runden(noiPlan),
    kapitaldienst: runden(kd),
    cfNachKd: runden(noiPlan - kd),
  };
  return {
    ...kopf,
    monate: cfMonate,
    summe: { werte, summen: s, sollMiete: runden(sollKalt) },
    plan,
    vergleichsMonate: vergleich.length,
    datenAb,
    mieteQuote: sollKalt > 0 ? werte.miete / sollKalt : null,
    dscr: s.kapitaldienst < 0 ? s.noi / -s.kapitaldienst : null,
    kennzahlen: kennzahlenBerechnen(
      vergleich.length,
      werte,
      s,
      kopf.eigenkapital,
      kopf.gesamtinvest,
    ),
    posten: anzeige.slice().sort((a, b) => b.datum.localeCompare(a.datum)),
  };
}

function zusammenfassen(teile: ObjektCf[], monate: string[]) {
  const pm: CfMonat[] = monate.map((monat, i) => {
    const werte = leer();
    for (const t of teile)
      for (const k of Object.keys(werte) as CfKategorie[])
        werte[k] += t.monate[i].werte[k];
    for (const k of Object.keys(werte) as CfKategorie[])
      werte[k] = runden(werte[k]);
    return {
      monat,
      abgeschlossen: teile[0]?.monate[i].abgeschlossen ?? false,
      mitDaten: teile.some((t) => t.monate[i].mitDaten),
      sollMiete: runden(teile.reduce((a, t) => a + t.monate[i].sollMiete, 0)),
      werte,
      summen: summen(werte),
    };
  });
  const werte = leer();
  for (const t of teile)
    for (const k of Object.keys(werte) as CfKategorie[])
      werte[k] += t.summe.werte[k];
  for (const k of Object.keys(werte) as CfKategorie[])
    werte[k] = runden(werte[k]);
  const s = summen(werte);
  const plan = teile.reduce<CfPlan>(
    (a, t) => ({
      sollMiete: a.sollMiete + t.plan.sollMiete,
      mietausfall: a.mietausfall + t.plan.mietausfall,
      umlagefaehig: a.umlagefaehig + t.plan.umlagefaehig,
      instandhaltung: a.instandhaltung + t.plan.instandhaltung,
      verwaltung: a.verwaltung + t.plan.verwaltung,
      noi: a.noi + t.plan.noi,
      kapitaldienst: a.kapitaldienst + t.plan.kapitaldienst,
      cfNachKd: a.cfNachKd + t.plan.cfNachKd,
    }),
    {
      sollMiete: 0,
      mietausfall: 0,
      umlagefaehig: 0,
      instandhaltung: 0,
      verwaltung: 0,
      noi: 0,
      kapitaldienst: 0,
      cfNachKd: 0,
    },
  );
  // Portfolio: Summe der hochgerechneten Objektwerte
  const noiJahr = teile.reduce((a, t) => a + t.kennzahlen.noiJahr, 0);
  const cfJahr = teile.reduce((a, t) => a + t.kennzahlen.cfJahr, 0);
  const mitEk = teile.filter((t) => t.eigenkapital && t.kennzahlen.monate);
  const eigenkapital = mitEk.reduce((a, t) => a + (t.eigenkapital ?? 0), 0);
  const mitInvest = teile.filter((t) => t.gesamtinvest && t.kennzahlen.monate);
  const invest = mitInvest.reduce((a, t) => a + (t.gesamtinvest ?? 0), 0);
  const kennzahlen: Kennzahlen = {
    monate: Math.max(0, ...teile.map((t) => t.kennzahlen.monate)),
    noiJahr: runden(noiJahr),
    cfJahr: runden(cfJahr),
    tilgungJahr: runden(
      teile.reduce((a, t) => a + t.kennzahlen.tilgungJahr, 0),
    ),
    cashOnCash: eigenkapital
      ? mitEk.reduce((a, t) => a + t.kennzahlen.cfJahr, 0) / eigenkapital
      : null,
    noiRendite: invest
      ? mitInvest.reduce((a, t) => a + t.kennzahlen.noiJahr, 0) / invest
      : null,
    kostenquote: werte.miete > 0 ? -s.nichtUmlagefaehig / werte.miete : null,
  };
  return {
    monate: pm,
    kennzahlen,
    eigenkapital,
    summe: {
      werte,
      summen: s,
      sollMiete: runden(teile.reduce((a, t) => a + t.summe.sollMiete, 0)),
    },
    plan,
    dscr: s.kapitaldienst < 0 ? s.noi / -s.kapitaldienst : null,
  };
}

export function cashflowAuswerten(
  daten: Pick<
    BoardDaten,
    | "stichtag"
    | "companies"
    | "properties"
    | "units"
    | "leases"
    | "leaseEvents"
    | "bankAccounts"
    | "transactions"
    | "fixkosten"
  >,
  staende: DarlehenStand[],
  anzahlMonate = 12,
): CashflowAuswertung {
  const monate = cfMonate(daten.stichtag, anzahlMonate);
  const laufend = monate[monate.length - 1];
  const erster = `${monate[0]}-01`;
  const separat = new Set(
    daten.companies.filter((c) => c.separateArea).map((c) => c.id),
  );
  const accounts = daten.bankAccounts.filter((a) => !separat.has(a.companyId));
  const ibans = new Set(accounts.map((a) => a.iban));
  // zwölf Monate Vorlauf für Jahreszahlungen, die noch in den Zeitraum wirken
  const vorlaufAb = `${plusMonat(monate[0], -12)}-01`;
  const txAlle = daten.transactions.filter(
    (t) => ibans.has(t.accountId) && t.bookingDate >= vorlaufAb,
  );
  const tx = txAlle.filter((t) => t.bookingDate >= erster);
  const alle = einordnen(txAlle, { accounts, properties: daten.properties });
  const posten = alle.filter((x) => x.datum >= erster);
  const vorlauf = alle.filter((x) => x.datum < erster);

  // erster Buchungsmonat je Konto = ab da liegen Bankdaten vor
  const kontoAb = new Map<string, string>();
  for (const t of tx) {
    const m = t.bookingDate.slice(0, 7);
    const alt = kontoAb.get(t.accountId);
    if (!alt || m < alt) kontoAb.set(t.accountId, m);
  }
  const fruehester = (liste: (string | undefined)[]) =>
    liste.filter((x): x is string => Boolean(x)).sort()[0] ?? null;

  const objekte = daten.properties
    .filter((p) => !separat.has(p.companyId))
    .map((p) => {
      const units = daten.units.filter((u) => u.propertyId === p.id);
      const unitIds = new Set(units.map((u) => u.id));
      const leases = daten.leases.filter((l) => unitIds.has(l.unitId));
      const roh = posten.filter((x) => x.objektId === p.id);
      // Datenbasis: Konten der Gesellschaft (Mietkonto oder Hauptkonto)
      const konten = accounts.filter(
        (a) =>
          a.propertyId === p.id ||
          (a.companyId === p.companyId && a.propertyId == null),
      );
      const kaufMonat = p.purchaseDate?.slice(0, 7) ?? null;
      let datenAb = fruehester([
        ...konten.map((a) => kontoAb.get(a.iban)),
        ...roh.map((x) => x.monat),
      ]);
      if (datenAb && kaufMonat && kaufMonat > datenAb) datenAb = kaufMonat;
      const soll = (monat: string) => {
        if (kaufMonat && monat < kaufMonat) return { warm: 0, kalt: 0 };
        let warm = 0;
        let kalt = 0;
        for (const l of leases) {
          const w = sollMiete(l, daten.leaseEvents, `${monat}-01`);
          if (w > 0) {
            warm += w;
            kalt += w - l.serviceCharge;
          }
        }
        return { warm, kalt };
      };
      const fix = (daten.fixkosten ?? []).filter((f) => f.objektId === p.id);
      const eigene = periodisieren(
        mieteTeilen(roh, soll),
        fix,
        vorlauf.filter((x) => x.objektId === p.id),
      );
      return aufbauen(
        {
          objektId: p.id,
          companyId: p.companyId,
          name: p.name,
          flaeche: runden(units.reduce((a, u) => a + u.area, 0)),
          einheiten: units.length,
          eigenkapital: p.equity ?? null,
          gesamtinvest:
            p.purchasePrice != null
              ? p.purchasePrice + (p.purchaseCosts ?? 0)
              : null,
        },
        eigene,
        monate,
        laufend,
        datenAb,
        soll,
        (m) => kapitaldienstPlan(staende, p.id, m),
        roh,
      );
    });

  const allgemein = daten.companies
    .filter((c) => !separat.has(c.id))
    .map((c) => {
      const eigene = posten.filter(
        (x) => x.objektId == null && x.companyId === c.id,
      );
      const datenAb = fruehester(
        accounts
          .filter((a) => a.companyId === c.id)
          .map((a) => kontoAb.get(a.iban)),
      );
      return aufbauen(
        {
          objektId: null,
          companyId: c.id,
          name: c.shortName,
          flaeche: 0,
          einheiten: 0,
          eigenkapital: null,
          gesamtinvest: null,
        },
        eigene,
        monate,
        laufend,
        datenAb,
        () => ({ warm: 0, kalt: 0 }),
        () => 0,
      );
    })
    .filter((g) => g.posten.length > 0);

  // Gesellschaften ohne Objekt (Holding): Finanzierung und Zinsen dort sind kein Prüffall
  const mitObjekt = new Set(daten.properties.map((p) => p.companyId));
  const pruefliste = posten
    .filter(
      (x) =>
        x.kategorie === "sonstiges" ||
        (x.objektId == null &&
          mitObjekt.has(x.companyId) &&
          gruppeVon(x.kategorie) !== "gesellschaft" &&
          gruppeVon(x.kategorie) !== "finanzierung"),
    )
    .sort((a, b) => Math.abs(b.betrag) - Math.abs(a.betrag));

  const ausgaben = posten.filter(
    (x) => x.betrag < 0 && x.kategorie !== "intercompany",
  );
  const eingeordnet = ausgaben.filter((x) => x.kategorie !== "sonstiges");
  return {
    monate,
    objekte,
    allgemein,
    pruefliste,
    portfolio: zusammenfassen(objekte, monate),
    einordnungsQuote: ausgaben.length
      ? eingeordnet.length / ausgaben.length
      : 1,
  };
}
