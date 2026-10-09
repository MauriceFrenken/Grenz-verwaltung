/**
 * Cashflow je Liegenschaft aus echten Bankumsätzen (reine Funktionen).
 *
 * Aufbau wie die DCF-Kalkulation (Mieteinnahmen → Bewirtschaftung → NOI →
 * Kapitaldienst → Cashflow), aber monatlich, aus der Bank (Ist) und mit
 * Soll aus den Mietverträgen und einem Plan daneben.
 * Kosten ohne Objektbezug stehen getrennt unter „Gesellschaft allgemein“.
 */
import {
  monatsanfang,
  monatsende,
  plusMonate,
  type IsoDatum,
} from "@/lib/kalender";
import type { BoardDaten } from "@/lib/db/typen";
import type { DarlehenStand } from "@/modules/darlehen/logik/auswertung";
import { runden } from "@/modules/darlehen/logik/zinsplan";
import { sollMiete } from "@/modules/immobilien/logik/mieten";
import {
  CF_KATEGORIEN,
  einordnen,
  gruppeVon,
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
  /** Mietausfall in % der Soll-Miete */
  mietausfallQuote: 0.02,
} as const;

export type Summenzeile =
  | "einnahmen"
  | "bewirtschaftung"
  | "noi"
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
  const noi = einnahmen + bewirtschaftung;
  const kapitaldienst = g("kapitaldienst");
  const cfNachKd = noi + kapitaldienst;
  const investition = g("investition");
  const finanzierung = g("finanzierung");
  const durchlaufend = g("durchlaufend");
  return {
    einnahmen: runden(einnahmen),
    bewirtschaftung: runden(bewirtschaftung),
    noi: runden(noi),
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
  sollMiete: number;
  werte: Werte;
  summen: Record<Summenzeile, number>;
}

export interface CfPlan {
  sollMiete: number;
  mietausfall: number;
  /** umlagefähige Kosten ≈ Nebenkostenvorauszahlungen */
  umlagefaehig: number;
  instandhaltung: number;
  verwaltung: number;
  noi: number;
  kapitaldienst: number;
  cfNachKd: number;
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
  /** Ist-Miete / Soll-Miete im Vergleichszeitraum */
  mieteQuote: number | null;
  /** NOI / Kapitaldienst im Vergleichszeitraum */
  dscr: number | null;
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

function aufbauen(
  kopf: Pick<
    ObjektCf,
    "objektId" | "companyId" | "name" | "flaeche" | "einheiten"
  >,
  posten: CfPosten[],
  monate: string[],
  laufend: string,
  datenAb: string | null,
  soll: (monat: string) => { warm: number; kalt: number },
  kdPlan: (monat: string) => number,
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
      sollMiete: runden(soll(monat).warm),
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
  const sollWarm = vergleich.reduce((a, m) => a + m.sollMiete, 0);
  const sollKalt = vergleich.reduce((a, m) => a + soll(m.monat).kalt, 0);
  const kd = vergleich.reduce((a, m) => a + kdPlan(m.monat), 0);
  const mietausfall = sollWarm * PLAN_ANNAHMEN.mietausfallQuote;
  const umlagefaehig = sollWarm - sollKalt;
  const instandhaltung =
    (kopf.flaeche * PLAN_ANNAHMEN.instandhaltungJeQmJahr * vergleich.length) /
    12;
  const verwaltung = sollKalt * PLAN_ANNAHMEN.verwaltungQuote;
  const noiPlan =
    sollWarm - mietausfall - umlagefaehig - instandhaltung - verwaltung;
  const plan: CfPlan = {
    sollMiete: runden(sollWarm),
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
    summe: { werte, summen: s, sollMiete: runden(sollWarm) },
    plan,
    vergleichsMonate: vergleich.length,
    datenAb,
    mieteQuote: sollWarm > 0 ? werte.miete / sollWarm : null,
    dscr: s.kapitaldienst < 0 ? s.noi / -s.kapitaldienst : null,
    posten: posten.slice().sort((a, b) => b.datum.localeCompare(a.datum)),
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
  return {
    monate: pm,
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
  const tx = daten.transactions.filter(
    (t) => ibans.has(t.accountId) && t.bookingDate >= erster,
  );
  const posten = einordnen(tx, { accounts, properties: daten.properties });

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
      const eigene = posten.filter((x) => x.objektId === p.id);
      // Datenbasis: Konten der Gesellschaft (Mietkonto oder Hauptkonto)
      const konten = accounts.filter(
        (a) =>
          a.propertyId === p.id ||
          (a.companyId === p.companyId && a.propertyId == null),
      );
      const kaufMonat = p.purchaseDate?.slice(0, 7) ?? null;
      let datenAb = fruehester([
        ...konten.map((a) => kontoAb.get(a.iban)),
        ...eigene.map((x) => x.monat),
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
      return aufbauen(
        {
          objektId: p.id,
          companyId: p.companyId,
          name: p.name,
          flaeche: runden(units.reduce((a, u) => a + u.area, 0)),
          einheiten: units.length,
        },
        eigene,
        monate,
        laufend,
        datenAb,
        soll,
        (m) => kapitaldienstPlan(staende, p.id, m),
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

  const pruefliste = posten
    .filter(
      (x) =>
        x.kategorie === "sonstiges" ||
        (x.objektId == null &&
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
