/**
 * Zinsplan für Bank-, Intercompany- und Gesellschafterdarlehen.
 *
 * Konventionen (siehe docs/modul-darlehen.md):
 * - Perioden enden kalendarisch ausgerichtet (Monats-, Quartals-, Jahresende).
 * - Beginnt das Darlehen nicht an einer Periodengrenze, entsteht eine Rumpfperiode
 *   am Anfang; endet es nicht an einer Grenze, eine Rumpfperiode am Ende.
 * - In einer Anfangs-Rumpfperiode werden nur Zinsen gezahlt, Tilgung beginnt mit
 *   der ersten vollen Periode.
 * - Zum Vertragsende wird die Restschuld vollständig getilgt.
 * - Zinsen werden je Periode kaufmännisch auf Cent gerundet.
 */
import {
  istMonatsende,
  monatsanfang,
  monatsende,
  plusMonate,
  tageZwischen,
  teile,
  type IsoDatum,
} from "@/lib/kalender";
import type {
  DayCount,
  Frequenz,
  InterestScheduleRow,
  Loan,
} from "@/lib/db/typen";

export const MONATE_JE_PERIODE: Record<Frequenz, number> = {
  monatlich: 1,
  quartalsweise: 3,
  jaehrlich: 12,
};

export function runden(betrag: number): number {
  return Math.round((betrag + Number.EPSILON) * 100) / 100;
}

/**
 * Zinstage zwischen zwei Daten.
 * 30/360 (deutsche Methode): jeder Monat hat 30 Tage, Monatsletzte zählen als 30.
 * act/360 und act/365: tatsächliche Tage.
 */
export function zinstage(
  von: IsoDatum,
  bis: IsoDatum,
  konvention: DayCount,
): number {
  if (konvention !== "30/360") return tageZwischen(von, bis);
  const a = teile(von);
  const b = teile(bis);
  const d1 = istMonatsende(von) ? 30 : Math.min(a.tag, 30);
  const d2 = istMonatsende(bis) ? 30 : Math.min(b.tag, 30);
  return (b.jahr - a.jahr) * 360 + (b.monat - a.monat) * 30 + (d2 - d1);
}

export function jahresbasis(konvention: DayCount): number {
  return konvention === "act/365" ? 365 : 360;
}

export function istPeriodengrenze(d: IsoDatum, frequenz: Frequenz): boolean {
  return istMonatsende(d) && teile(d).monat % MONATE_JE_PERIODE[frequenz] === 0;
}

/** Nächste Periodengrenze strikt nach d. */
export function naechstePeriodengrenze(
  d: IsoDatum,
  frequenz: Frequenz,
): IsoDatum {
  const schritt = MONATE_JE_PERIODE[frequenz];
  let kandidat = monatsende(d);
  if (kandidat <= d) kandidat = monatsende(plusMonate(monatsanfang(d), 1));
  while (teile(kandidat).monat % schritt !== 0) {
    kandidat = monatsende(plusMonate(monatsanfang(kandidat), 1));
  }
  return kandidat;
}

export interface ZinsplanOptionen {
  /** Für unbefristete Darlehen: Plan bis zu diesem Datum erzeugen. */
  bis?: IsoDatum;
}

/** Erzeugt den vollständigen Zins- und Tilgungsplan eines Darlehens. */
export function zinsplan(
  loan: Loan,
  optionen: ZinsplanOptionen = {},
): InterestScheduleRow[] {
  const ende = loan.maturityDate;
  const grenze = ende ?? optionen.bis ?? plusMonate(loan.disbursementDate, 120);
  const basis = jahresbasis(loan.dayCount);
  const zeilen: InterestScheduleRow[] = [];

  let saldo = loan.principal;
  let start = loan.disbursementDate;
  let nr = 0;

  while (saldo > 0.004 && start < grenze) {
    let periodenEnde = naechstePeriodengrenze(start, loan.frequency);
    const istLetzte = ende !== null && periodenEnde >= ende;
    if (istLetzte) periodenEnde = ende;
    if (ende === null && periodenEnde > grenze) break;

    nr += 1;
    const tage = zinstage(start, periodenEnde, loan.dayCount);
    const zins = runden((saldo * loan.rate * tage) / basis);
    const stub =
      !istPeriodengrenze(start, loan.frequency) ||
      !istPeriodengrenze(periodenEnde, loan.frequency);
    const anfangsRumpf = nr === 1 && !istPeriodengrenze(start, loan.frequency);

    let tilgung = 0;
    if (istLetzte) {
      tilgung = saldo;
    } else if (!anfangsRumpf) {
      if (loan.repayment.kind === "annuitaet") {
        tilgung = Math.max(0, loan.repayment.installment - zins);
      } else if (loan.repayment.kind === "ratentilgung") {
        tilgung = loan.repayment.principalPerPeriod;
      }
    }
    tilgung = runden(Math.min(saldo, tilgung));
    saldo = runden(saldo - tilgung);

    zeilen.push({
      loanId: loan.id,
      nr,
      periodStart: start,
      periodEnd: periodenEnde,
      dueDate: periodenEnde,
      days: tage,
      interest: zins,
      principal: tilgung,
      payment: runden(zins + tilgung),
      balanceAfter: saldo,
      stub,
    });

    if (istLetzte) break;
    start = periodenEnde;
  }

  return zeilen;
}

/** Restschuld zu einem Stichtag (nach allen bis dahin fälligen Zahlungen). */
export function restschuld(
  loan: Loan,
  plan: InterestScheduleRow[],
  stichtag: IsoDatum,
): number {
  if (stichtag < loan.disbursementDate) return 0;
  let saldo = loan.principal;
  for (const z of plan) {
    if (z.dueDate <= stichtag) saldo = z.balanceAfter;
  }
  return saldo;
}

/** Summe der Zinsen mit Fälligkeit im Zeitraum [von, bis]. */
export function zinsenImZeitraum(
  plan: InterestScheduleRow[],
  von: IsoDatum,
  bis: IsoDatum,
): number {
  return runden(
    plan
      .filter((z) => z.dueDate >= von && z.dueDate <= bis)
      .reduce((s, z) => s + z.interest, 0),
  );
}

/** Annuitätenrate für eine gewünschte anfängliche Tilgung (z. B. 2 % p.a.). */
export function annuitaetFuerTilgung(
  principal: number,
  rate: number,
  anfaenglicheTilgung: number,
  frequenz: Frequenz,
): number {
  const jeJahr = 12 / MONATE_JE_PERIODE[frequenz];
  return runden((principal * (rate + anfaenglicheTilgung)) / jeJahr);
}

/** Nächste fällige Zahlung ab Stichtag (inklusive). */
export function naechsteZahlung(
  plan: InterestScheduleRow[],
  stichtag: IsoDatum,
): InterestScheduleRow | null {
  return plan.find((z) => z.dueDate >= stichtag) ?? null;
}
