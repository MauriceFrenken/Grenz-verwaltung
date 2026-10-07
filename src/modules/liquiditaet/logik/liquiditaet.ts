import type { Ampel } from "@/components/board/ampel";
import type { BoardDaten, Company, Loan } from "@/lib/db/typen";
import {
  monatsanfang,
  monatsende,
  nterWerktag,
  plusMonate,
  plusTage,
  tageVonBis,
  teile,
  type IsoDatum,
} from "@/lib/kalender";
import type { DarlehenStand } from "@/modules/darlehen/logik/auswertung";
import { runden } from "@/modules/darlehen/logik/zinsplan";
import { sollMiete } from "@/modules/immobilien/logik/mieten";
import type { ProjektKennzahlen } from "@/modules/immobilien/logik/objekte";

/** Kurzfrist-Horizont: 13 Wochen, täglich */
export const HORIZONT_TAGE = 91;
/** Langfrist-Horizont: 24 Monate, monatlich */
export const HORIZONT_MONATE = 24;
/** Annahme: reservierte Einheiten werden nach Beurkundung und Fälligkeit bezahlt */
export const RESERVIERUNG_ZU_ZAHLUNG_TAGE = 45;
/** Annahme: Vertrieb startet frühestens in 3 Monaten (Notartermin, Fälligkeit) */
export const VERTRIEB_VORLAUF_MONATE = 3;
/** Annahme: Einheiten in Sanierung werden im letzten Halbjahr vor Planende verkauft */
export const SANIERUNG_VERTRIEB_MONATE = 6;

export const LIQ_KATEGORIEN = [
  "miete",
  "bewirtschaftung",
  "kapitaldienst",
  "darlehen_ic",
  "rechnung",
  "projekt",
  "verkauf",
  "personal",
  "steuern",
  "intercompany",
  "sonstiges",
  "szenario",
] as const;
export type LiqKategorie = (typeof LIQ_KATEGORIEN)[number];

export const LIQ_KATEGORIE_LABEL: Record<LiqKategorie, string> = {
  miete: "Mieten",
  bewirtschaftung: "Bewirtschaftung",
  kapitaldienst: "Kapitaldienst",
  darlehen_ic: "Darlehen intern",
  rechnung: "Offene Rechnungen",
  projekt: "Projektbudgets",
  verkauf: "Verkäufe und Erlöse",
  personal: "Personal",
  steuern: "Steuern",
  intercompany: "Umlagen intern",
  sonstiges: "Sonstiges",
  szenario: "Szenario",
};

/** Eine geplante Zahlung aus Sicht genau einer Gesellschaft. */
export interface Bewegung {
  datum: IsoDatum;
  companyId: string;
  /** positiv = Eingang, negativ = Ausgang */
  betrag: number;
  kategorie: LiqKategorie;
  label: string;
  /** Gegenseite ist ebenfalls eine Gruppengesellschaft (wird konsolidiert eliminiert) */
  ic: boolean;
  quelle: string;
}

export interface Refinanzierung {
  loan: Loan;
  datum: IsoDatum;
  betrag: number;
}

export interface PlanOptionen {
  /**
   * Schlusstilgungen von Bankdarlehen im Bestand gelten als prolongiert
   * (Standard: ja). Aufteiler-Darlehen werden immer zurückgezahlt.
   */
  prolongation?: boolean;
  bis?: IsoDatum;
}

// ---------------------------------------------------------------------------
// Ist: Tagessalden
// ---------------------------------------------------------------------------

/** Saldo eines Kontos am Ende des Tages `tag`. */
export function kontoSaldo(
  daten: Pick<BoardDaten, "bankAccounts" | "transactions">,
  accountId: string,
  tag: IsoDatum,
): number {
  const konto = daten.bankAccounts.find((k) => k.id === accountId);
  if (!konto) return 0;
  const summe = daten.transactions
    .filter((t) => t.accountId === accountId && t.bookingDate <= tag)
    .reduce((s, t) => s + t.amount, konto.openingBalance);
  return runden(summe);
}

/** Tagessalden je Konto von `von` bis `bis` (inklusive), Ende des Tages. */
export function tagesSalden(
  daten: Pick<BoardDaten, "bankAccounts" | "transactions">,
  von: IsoDatum,
  bis: IsoDatum,
): Map<string, Array<{ datum: IsoDatum; saldo: number }>> {
  const tage = tageVonBis(von, bis);
  const ergebnis = new Map<string, Array<{ datum: IsoDatum; saldo: number }>>();
  for (const k of daten.bankAccounts) {
    const tx = daten.transactions
      .filter((t) => t.accountId === k.id)
      .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
    let saldo = k.openingBalance;
    let i = 0;
    while (i < tx.length && tx[i].bookingDate < von) saldo += tx[i++].amount;
    const reihe: Array<{ datum: IsoDatum; saldo: number }> = [];
    for (const tag of tage) {
      while (i < tx.length && tx[i].bookingDate === tag)
        saldo += tx[i++].amount;
      reihe.push({ datum: tag, saldo: runden(saldo) });
    }
    ergebnis.set(k.id, reihe);
  }
  return ergebnis;
}

/** Bankbestand je Gesellschaft am Stichtag (alle Konten summiert). */
export function bestandJeGesellschaft(
  daten: Pick<BoardDaten, "bankAccounts" | "transactions" | "companies">,
  tag: IsoDatum,
): Map<string, number> {
  const m = new Map<string, number>(daten.companies.map((c) => [c.id, 0]));
  for (const k of daten.bankAccounts) {
    m.set(
      k.companyId,
      runden((m.get(k.companyId) ?? 0) + kontoSaldo(daten, k.id, tag)),
    );
  }
  return m;
}

// ---------------------------------------------------------------------------
// Plan: Bewegungen
// ---------------------------------------------------------------------------

/** Planmäßiger Tilgungsanteil einer Rate ohne Schlusszahlung. */
function regulaereTilgung(loan: Loan, zins: number): number {
  switch (loan.repayment.kind) {
    case "annuitaet":
      return Math.max(0, loan.repayment.installment - zins);
    case "ratentilgung":
      return loan.repayment.principalPerPeriod;
    case "endfaellig":
      return 0;
  }
}

function monatsTermine(
  start: IsoDatum,
  bis: IsoDatum,
  tagImMonat: (monat: IsoDatum) => IsoDatum,
): IsoDatum[] {
  const out: IsoDatum[] = [];
  for (let m = monatsanfang(start); m <= bis; m = plusMonate(m, 1)) {
    const d = tagImMonat(m);
    if (d >= start && d <= bis) out.push(d);
  }
  return out;
}

/**
 * Alle geplanten Zahlungen ab dem Tag nach dem Stichtag bis `bis`.
 * Quellen: Mietverträge, Bewirtschaftung, Zinspläne (Darlehensnehmer zahlt,
 * Darlehensgeber erhält), offene Rechnungen, wiederkehrende Planposten,
 * Rest-Sanierungsbudgets und erwartete Verkaufserlöse der Aufteiler-Projekte.
 */
export function planBewegungen(
  daten: BoardDaten,
  staende: DarlehenStand[],
  projekte: ProjektKennzahlen[],
  optionen: PlanOptionen = {},
): { bewegungen: Bewegung[]; refinanzierungen: Refinanzierung[] } {
  const stichtag = daten.stichtag;
  const start = plusTage(stichtag, 1);
  const bis = optionen.bis ?? monatsende(plusMonate(stichtag, HORIZONT_MONATE));
  const prolongation = optionen.prolongation ?? true;
  const firmen = new Set(daten.companies.map((c) => c.id));
  const bewegungen: Bewegung[] = [];
  const refinanzierungen: Refinanzierung[] = [];
  const add = (b: Bewegung) => {
    if (b.datum < start || b.datum > bis || Math.abs(b.betrag) < 0.005) return;
    bewegungen.push({ ...b, betrag: runden(b.betrag) });
  };
  const propById = new Map(daten.properties.map((p) => [p.id, p]));
  const unitById = new Map(daten.units.map((u) => [u.id, u]));
  const projektProps = new Set(daten.projects.map((p) => p.propertyId));

  // Mieten: fällig am 3. Werktag
  for (const l of daten.leases) {
    const unit = unitById.get(l.unitId);
    const prop = unit && propById.get(unit.propertyId);
    if (!prop) continue;
    for (const tag of monatsTermine(start, bis, (m) => {
      const { jahr, monat } = teile(m);
      return nterWerktag(jahr, monat, 3);
    })) {
      add({
        datum: tag,
        companyId: prop.companyId,
        betrag: sollMiete(l, daten.leaseEvents, tag),
        kategorie: "miete",
        label: `Miete ${prop.name} ${unit.label}`,
        ic: false,
        quelle: `lease:${l.id}`,
      });
    }
  }

  // Bewirtschaftung Bestandsobjekte (Plankosten je m²), zum 15.
  for (const p of daten.properties) {
    if (projektProps.has(p.id)) continue;
    const flaeche = daten.units
      .filter((u) => u.propertyId === p.id)
      .reduce((s, u) => s + u.area, 0);
    for (const tag of monatsTermine(start, bis, (m) => plusTage(m, 14))) {
      add({
        datum: tag,
        companyId: p.companyId,
        betrag: -flaeche * p.costPerSqmMonth,
        kategorie: "bewirtschaftung",
        label: `Bewirtschaftung ${p.name}`,
        ic: false,
        quelle: `property:${p.id}`,
      });
    }
  }

  // Darlehen: Zinsen und Tilgungen
  for (const s of staende) {
    const l = s.loan;
    if (l.status !== "aktiv") continue;
    const nehmer = l.borrowerCompanyId && firmen.has(l.borrowerCompanyId);
    const geber = l.lenderCompanyId && firmen.has(l.lenderCompanyId);
    const ic = Boolean(nehmer && geber);
    const kategorie: LiqKategorie = ic ? "darlehen_ic" : "kapitaldienst";
    if (l.disbursementDate >= start) {
      if (nehmer)
        add({
          datum: l.disbursementDate,
          companyId: l.borrowerCompanyId!,
          betrag: l.principal,
          kategorie,
          label: `Auszahlung ${l.id}`,
          ic,
          quelle: `loan:${l.id}`,
        });
      if (geber)
        add({
          datum: l.disbursementDate,
          companyId: l.lenderCompanyId!,
          betrag: -l.principal,
          kategorie,
          label: `Auszahlung ${l.id}`,
          ic,
          quelle: `loan:${l.id}`,
        });
    }
    for (const z of s.plan) {
      if (z.dueDate < start || z.dueDate > bis) continue;
      let tilgung = z.principal;
      const regulaer = Math.min(z.principal, regulaereTilgung(l, z.interest));
      const schluss = z.balanceAfter < 0.005 && z.principal - regulaer > 0.005;
      // Aufteiler-Darlehen werden aus Verkaufserlösen zurückgeführt, nicht prolongiert
      const prolongierbar =
        l.kind === "bank" && !(l.propertyId && projektProps.has(l.propertyId));
      if (schluss && prolongation && prolongierbar) {
        refinanzierungen.push({
          loan: l,
          datum: z.dueDate,
          betrag: runden(z.principal - regulaer),
        });
        tilgung = regulaer;
      }
      const betrag = z.interest + tilgung;
      if (nehmer)
        add({
          datum: z.dueDate,
          companyId: l.borrowerCompanyId!,
          betrag: -betrag,
          kategorie,
          label: `${schluss && tilgung === z.principal ? "Rückzahlung" : "Rate"} ${l.id}`,
          ic,
          quelle: `loan:${l.id}`,
        });
      if (geber)
        add({
          datum: z.dueDate,
          companyId: l.lenderCompanyId!,
          betrag,
          kategorie,
          label: `${schluss && tilgung === z.principal ? "Rückzahlung" : "Rate"} ${l.id}`,
          ic,
          quelle: `loan:${l.id}`,
        });
    }
  }

  // Offene Rechnungen; überfällige Eingangsrechnungen werden sofort bezahlt,
  // überfällige Forderungen erst in 7 Tagen erwartet (vorsichtig).
  for (const r of daten.invoices) {
    if (r.status !== "offen") continue;
    const eingang = r.direction === "eingang";
    const tag =
      r.dueDate >= start ? r.dueDate : eingang ? start : plusTage(stichtag, 7);
    add({
      datum: tag,
      companyId: r.companyId,
      betrag: eingang ? -r.amount : r.amount,
      kategorie: "rechnung",
      label: `${eingang ? "Rechnung" : "Forderung"} ${r.counterparty}`,
      ic: false,
      quelle: `invoice:${r.id}`,
    });
  }

  // Wiederkehrende Planposten
  for (const pp of daten.plannedPayments) {
    const ende = pp.monthlyUntil ?? pp.date;
    for (let d = pp.date; d <= ende && d <= bis; d = plusMonate(d, 1)) {
      add({
        datum: d,
        companyId: pp.companyId,
        betrag: pp.amount,
        kategorie: (LIQ_KATEGORIEN as readonly string[]).includes(pp.category)
          ? (pp.category as LiqKategorie)
          : "sonstiges",
        label: pp.label,
        ic: pp.category === "intercompany",
        quelle: `plan:${pp.id}`,
      });
    }
  }

  // Aufteiler: Restbudget gleichmäßig bis Planende, Verkaufserlöse nach Status
  for (const pk of projekte) {
    const pj = pk.project;
    const companyId = pk.property.companyId;
    const rest = pj.renovationBudget - pk.istKosten - pk.offeneRechnungen;
    const ende = pj.plannedEnd < bis ? pj.plannedEnd : bis;
    const termine = monatsTermine(start, ende, (m) => plusTage(m, 19));
    if (rest > 0 && termine.length > 0) {
      for (const tag of termine) {
        add({
          datum: tag,
          companyId,
          betrag: -rest / termine.length,
          kategorie: "projekt",
          label: `Sanierung ${pj.name}`,
          ic: false,
          quelle: `project:${pj.id}`,
        });
      }
    }
    const vertriebStart = monatsanfang(
      plusMonate(stichtag, VERTRIEB_VORLAUF_MONATE),
    );
    const vertriebEnde =
      pj.plannedEnd > vertriebStart ? pj.plannedEnd : vertriebStart;
    const vertriebMonate = monatsTermine(vertriebStart, vertriebEnde, (m) =>
      monatsende(m),
    );
    const imVertrieb = pk.units.filter((u) => u.status === "im_vertrieb");
    imVertrieb.forEach((u, i) => {
      const tag =
        vertriebMonate[
          Math.min(
            vertriebMonate.length - 1,
            Math.floor(((i + 0.5) * vertriebMonate.length) / imVertrieb.length),
          )
        ] ?? vertriebStart;
      add({
        datum: tag,
        companyId,
        betrag: u.listPrice ?? 0,
        kategorie: "verkauf",
        label: `Verkauf ${u.label} (Plan)`,
        ic: false,
        quelle: `unit:${u.id}`,
      });
    });
    const sanierung: typeof pk.units = [];
    for (const u of pk.units) {
      if (u.status === "reserviert") {
        add({
          datum: plusTage(stichtag, RESERVIERUNG_ZU_ZAHLUNG_TAGE),
          companyId,
          betrag: u.listPrice ?? 0,
          kategorie: "verkauf",
          label: `Verkauf ${u.label} (reserviert)`,
          ic: false,
          quelle: `unit:${u.id}`,
        });
      }
      if (u.status === "sanierung") {
        sanierung.push(u);
      }
    }
    // Einheiten in Sanierung: Vertrieb vom Plan im letzten Halbjahr vor Planende
    const sanStart = [
      vertriebStart,
      monatsanfang(plusMonate(pj.plannedEnd, -SANIERUNG_VERTRIEB_MONATE)),
    ].sort()[1];
    const sanMonate = monatsTermine(sanStart, vertriebEnde, (m) =>
      monatsende(m),
    );
    sanierung.forEach((u, i) => {
      add({
        datum:
          sanMonate[
            Math.min(
              sanMonate.length - 1,
              Math.floor(((i + 0.5) * sanMonate.length) / sanierung.length),
            )
          ] ?? vertriebEnde,
        companyId,
        betrag: u.listPrice ?? 0,
        kategorie: "verkauf",
        label: `Verkauf ${u.label} (nach Sanierung, Plan)`,
        ic: false,
        quelle: `unit:${u.id}`,
      });
    });
  }

  bewegungen.sort(
    (a, b) =>
      a.datum.localeCompare(b.datum) || a.companyId.localeCompare(b.companyId),
  );
  return { bewegungen, refinanzierungen };
}

// ---------------------------------------------------------------------------
// Szenario
// ---------------------------------------------------------------------------

export interface Szenario {
  /** eingesetztes Eigenkapital in € (positiv) */
  ek: number;
  datum: IsoDatum;
  companyId: string;
}

export function szenarioBewegungen(s: Szenario): Bewegung[] {
  return [
    {
      datum: s.datum,
      companyId: s.companyId,
      betrag: -Math.abs(s.ek),
      kategorie: "szenario",
      label: "Ankauf (Eigenkapital)",
      ic: false,
      quelle: "szenario",
    },
  ];
}

// ---------------------------------------------------------------------------
// Verdichtung
// ---------------------------------------------------------------------------

export interface Tagespunkt {
  datum: IsoDatum;
  /** Saldo je Gesellschaft am Tagesende */
  saldo: Record<string, number>;
}

/** Tägliche Salden je Gesellschaft vom Stichtag bis `bis`. */
export function tagesVerlauf(
  start: Map<string, number>,
  bewegungen: Bewegung[],
  stichtag: IsoDatum,
  bis: IsoDatum,
): Tagespunkt[] {
  const laufend: Record<string, number> = Object.fromEntries(start);
  const jeTag = new Map<IsoDatum, Bewegung[]>();
  for (const b of bewegungen) {
    if (b.datum > bis) continue;
    const liste = jeTag.get(b.datum) ?? [];
    liste.push(b);
    jeTag.set(b.datum, liste);
  }
  const out: Tagespunkt[] = [];
  for (const tag of tageVonBis(stichtag, bis)) {
    for (const b of jeTag.get(tag) ?? [])
      laufend[b.companyId] = (laufend[b.companyId] ?? 0) + b.betrag;
    out.push({
      datum: tag,
      saldo: Object.fromEntries(
        Object.entries(laufend).map(([k, v]) => [k, runden(v)]),
      ),
    });
  }
  return out;
}

/** Summe über Gesellschaften (konsolidiert: IC hebt sich in Salden auf). */
export function summe(punkt: Tagespunkt, ids: Iterable<string>): number {
  let s = 0;
  for (const id of ids) s += punkt.saldo[id] ?? 0;
  return runden(s);
}

export interface MonatsZeile {
  monat: string;
  ein: number;
  aus: number;
  netto: number;
  jeKategorie: Partial<Record<LiqKategorie, number>>;
  saldoEnde: number;
}

/**
 * Monatsverdichtung für einen Kreis von Gesellschaften. Interne Zahlungen
 * (Umlagen, IC-Darlehen) zwischen Gesellschaften des Kreises werden
 * eliminiert, sofern `konsolidiert` gesetzt ist.
 */
export function monatsVerlauf(
  startSaldo: number,
  bewegungen: Bewegung[],
  ids: Set<string>,
  stichtag: IsoDatum,
  monate: number,
  konsolidiert: boolean,
): MonatsZeile[] {
  const out: MonatsZeile[] = [];
  let saldo = startSaldo;
  for (let i = 0; i < monate; i++) {
    const anfang = monatsanfang(plusMonate(stichtag, i));
    const ende = monatsende(anfang);
    const zeile: MonatsZeile = {
      monat: anfang.slice(0, 7),
      ein: 0,
      aus: 0,
      netto: 0,
      jeKategorie: {},
      saldoEnde: 0,
    };
    for (const b of bewegungen) {
      if (b.datum < anfang || b.datum > ende || !ids.has(b.companyId)) continue;
      saldo += b.betrag;
      if (konsolidiert && b.ic) continue;
      if (b.betrag >= 0) zeile.ein += b.betrag;
      else zeile.aus += b.betrag;
      zeile.jeKategorie[b.kategorie] =
        (zeile.jeKategorie[b.kategorie] ?? 0) + b.betrag;
    }
    zeile.ein = runden(zeile.ein);
    zeile.aus = runden(zeile.aus);
    zeile.netto = runden(zeile.ein + zeile.aus);
    for (const k of Object.keys(zeile.jeKategorie) as LiqKategorie[])
      zeile.jeKategorie[k] = runden(zeile.jeKategorie[k]!);
    zeile.saldoEnde = runden(saldo);
    out.push(zeile);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Warnungen
// ---------------------------------------------------------------------------

export interface Tiefpunkt {
  datum: IsoDatum;
  saldo: number;
}

export function tiefpunkt(
  reihe: Array<{ datum: IsoDatum; wert: number }>,
): Tiefpunkt {
  let min = reihe[0];
  for (const p of reihe) if (p.wert < min.wert) min = p;
  return { datum: min.datum, saldo: min.wert };
}

export interface GesellschaftsLiquiditaet {
  company: Company;
  heute: number;
  in13Wochen: number;
  tief13: Tiefpunkt;
  tief24: Tiefpunkt;
  /** erster Tag unter Mindestliquidität (24 Monate), sonst null */
  ersteUnterschreitung: IsoDatum | null;
  /** fehlender Betrag zum Tiefpunkt bis zur Mindestliquidität */
  luecke: number;
  ampel: Ampel;
}

/**
 * Ampel: rot bei Unterschreitung in 13 Wochen, gelb bei Unterschreitung in
 * 24 Monaten oder Tiefpunkt (13 W) unter 150 % der Mindestliquidität.
 */
export function liquiditaetsAmpel(
  min: number,
  tief13: number,
  tief24: number,
): Ampel {
  if (tief13 < min) return "rot";
  if (tief24 < min || tief13 < 1.5 * min) return "gelb";
  return "gruen";
}

export function gesellschaftsLiquiditaet(
  company: Company,
  verlauf: Tagespunkt[],
): GesellschaftsLiquiditaet {
  const reihe = verlauf.map((p) => ({
    datum: p.datum,
    wert: p.saldo[company.id] ?? 0,
  }));
  const kurz = reihe.slice(0, HORIZONT_TAGE + 1);
  const tief13 = tiefpunkt(kurz);
  const tief24 = tiefpunkt(reihe);
  const unter = reihe.find((p) => p.wert < company.minLiquidity);
  return {
    company,
    heute: reihe[0]?.wert ?? 0,
    in13Wochen: kurz.at(-1)?.wert ?? 0,
    tief13,
    tief24,
    ersteUnterschreitung: unter?.datum ?? null,
    luecke: runden(Math.max(0, company.minLiquidity - tief24.saldo)),
    ampel: liquiditaetsAmpel(company.minLiquidity, tief13.saldo, tief24.saldo),
  };
}

// ---------------------------------------------------------------------------
// Gesamtauswertung
// ---------------------------------------------------------------------------

export interface LiquiditaetsAuswertung {
  stichtag: IsoDatum;
  bis: IsoDatum;
  bestand: Map<string, number>;
  bewegungen: Bewegung[];
  refinanzierungen: Refinanzierung[];
  verlauf: Tagespunkt[];
  gesellschaften: GesellschaftsLiquiditaet[];
  /** Gesellschaften der freien Gruppenliquidität (ohne getrennte Bereiche) */
  freieIds: string[];
  mindestFrei: number;
}

export function liquiditaetAuswerten(
  daten: BoardDaten,
  staende: DarlehenStand[],
  projekte: ProjektKennzahlen[],
  optionen: PlanOptionen & { szenario?: Szenario | null } = {},
): LiquiditaetsAuswertung {
  const stichtag = daten.stichtag;
  const bis = optionen.bis ?? monatsende(plusMonate(stichtag, HORIZONT_MONATE));
  const bestand = bestandJeGesellschaft(daten, stichtag);
  const plan = planBewegungen(daten, staende, projekte, { ...optionen, bis });
  const bewegungen = optionen.szenario
    ? [...plan.bewegungen, ...szenarioBewegungen(optionen.szenario)].sort(
        (a, b) => a.datum.localeCompare(b.datum),
      )
    : plan.bewegungen;
  const verlauf = tagesVerlauf(bestand, bewegungen, stichtag, bis);
  const frei = daten.companies.filter((c) => !c.separateArea);
  return {
    stichtag,
    bis,
    bestand,
    bewegungen,
    refinanzierungen: plan.refinanzierungen,
    verlauf,
    gesellschaften: daten.companies.map((c) =>
      gesellschaftsLiquiditaet(c, verlauf),
    ),
    freieIds: frei.map((c) => c.id),
    mindestFrei: frei.reduce((s, c) => s + c.minLiquidity, 0),
  };
}

/** Saldenreihe eines Gesellschaftskreises (Summe je Tag). */
export function kreisReihe(
  verlauf: Tagespunkt[],
  ids: Iterable<string>,
): Array<{ datum: IsoDatum; wert: number }> {
  const liste = [...ids];
  return verlauf.map((p) => ({ datum: p.datum, wert: summe(p, liste) }));
}

/**
 * Höchster Eigenkapitaleinsatz am Tag `ab`, bei dem die Reihe ab diesem Tag
 * nicht unter `min` fällt (0, wenn schon ohne Einsatz unterschritten).
 */
export function tragbaresEk(
  reihe: Array<{ datum: IsoDatum; wert: number }>,
  ab: IsoDatum,
  min: number,
): number {
  const rest = reihe.filter((p) => p.datum >= ab);
  if (rest.length === 0) return 0;
  return runden(Math.max(0, Math.min(...rest.map((p) => p.wert)) - min));
}

/** Größter Abfluss im Kreis in den `tage` Tagen bis einschließlich `bis`. */
export function haupttreiber(
  bewegungen: Bewegung[],
  ids: Set<string>,
  bis: IsoDatum,
  tage = 30,
): Bewegung | null {
  const von = plusTage(bis, -tage);
  let max: Bewegung | null = null;
  for (const b of bewegungen) {
    if (!ids.has(b.companyId) || b.ic || b.datum < von || b.datum > bis)
      continue;
    if (b.betrag < 0 && (!max || b.betrag < max.betrag)) max = b;
  }
  return max;
}
