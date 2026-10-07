/**
 * Kennzahlen, Fälligkeiten, Matrix und Prüffälle für Darlehen (reine Funktionen).
 */
import {
  plusMonate,
  plusTage,
  tageZwischen,
  teile,
  type IsoDatum,
} from "@/lib/kalender";
import type { Ampel } from "@/components/board/ampel";
import type { InterestScheduleRow, Loan, ReviewItem } from "@/lib/db/typen";
import { euro, datum as datumDe } from "@/lib/format/de";
import type { AbgleichErgebnis } from "./abgleich";
import { restschuld, runden, zinsenImZeitraum, zinsplan } from "./zinsplan";

export interface DarlehenStand {
  loan: Loan;
  plan: InterestScheduleRow[];
  restschuld: number;
  getilgtAnteil: number;
  zinsenLfdJahr: number;
  naechsteZahlung: InterestScheduleRow | null;
  /** frühestes relevantes Datum: Ende oder Zinsbindungsende */
  kritischesDatum: IsoDatum | null;
  kritischesEreignis: "Ende" | "Zinsbindung" | null;
  ampel: Ampel;
}

/** Plan-Horizont für unbefristete Darlehen: 24 Monate über den Stichtag hinaus. */
export function planBis(stichtag: IsoDatum): IsoDatum {
  return plusMonate(stichtag, 24);
}

export function fristAmpel(datum: IsoDatum | null, stichtag: IsoDatum): Ampel {
  if (!datum) return "gruen";
  const tage = tageZwischen(stichtag, datum);
  if (tage <= 183) return "rot";
  if (tage <= 365) return "gelb";
  return "gruen";
}

export function darlehenStand(loan: Loan, stichtag: IsoDatum): DarlehenStand {
  const plan = zinsplan(loan, { bis: planBis(stichtag) });
  const rest = restschuld(loan, plan, stichtag);
  const jahr = teile(stichtag).jahr;
  const kandidaten: Array<{ d: IsoDatum; e: "Ende" | "Zinsbindung" }> = [];
  if (loan.maturityDate && loan.maturityDate >= stichtag)
    kandidaten.push({ d: loan.maturityDate, e: "Ende" });
  if (
    loan.fixedUntil &&
    loan.fixedUntil >= stichtag &&
    loan.fixedUntil !== loan.maturityDate
  ) {
    kandidaten.push({ d: loan.fixedUntil, e: "Zinsbindung" });
  }
  kandidaten.sort((a, b) => a.d.localeCompare(b.d));
  const krit = kandidaten[0] ?? null;
  return {
    loan,
    plan,
    restschuld: rest,
    getilgtAnteil:
      loan.principal > 0 ? Math.max(0, 1 - rest / loan.principal) : 0,
    zinsenLfdJahr: zinsenImZeitraum(plan, `${jahr}-01-01`, stichtag),
    naechsteZahlung: plan.find((z) => z.dueDate >= stichtag) ?? null,
    kritischesDatum: krit?.d ?? null,
    kritischesEreignis: krit?.e ?? null,
    ampel:
      loan.status === "aktiv" ? fristAmpel(krit?.d ?? null, stichtag) : "grau",
  };
}

export interface Faelligkeit {
  loan: Loan;
  datum: IsoDatum;
  ereignis: "Ende" | "Zinsbindung";
  restschuld: number;
  /** Mehrbelastung p.a. bei Anschlusszins + 1 bzw. + 2 Prozentpunkte */
  mehrbelastung1: number;
  mehrbelastung2: number;
  ampel: Ampel;
}

/** Enden und Zinsbindungsenden im Horizont (Standard 24 Monate). */
export function faelligkeiten(
  staende: DarlehenStand[],
  stichtag: IsoDatum,
  monate = 24,
): Faelligkeit[] {
  const bis = plusMonate(stichtag, monate);
  const ergebnis: Faelligkeit[] = [];
  for (const s of staende) {
    if (s.loan.status !== "aktiv") continue;
    const ereignisse: Array<{ d: IsoDatum; e: "Ende" | "Zinsbindung" }> = [];
    if (s.loan.maturityDate)
      ereignisse.push({ d: s.loan.maturityDate, e: "Ende" });
    if (s.loan.fixedUntil && s.loan.fixedUntil !== s.loan.maturityDate) {
      ereignisse.push({ d: s.loan.fixedUntil, e: "Zinsbindung" });
    }
    for (const ev of ereignisse) {
      if (ev.d < stichtag || ev.d > bis) continue;
      const rest =
        ev.e === "Ende"
          ? (s.plan.filter((z) => z.dueDate < ev.d).at(-1)?.balanceAfter ??
            s.loan.principal)
          : restschuld(s.loan, s.plan, ev.d);
      ergebnis.push({
        loan: s.loan,
        datum: ev.d,
        ereignis: ev.e,
        restschuld: rest,
        mehrbelastung1: runden(rest * 0.01),
        mehrbelastung2: runden(rest * 0.02),
        ampel: fristAmpel(ev.d, stichtag),
      });
    }
  }
  return ergebnis.sort((a, b) => a.datum.localeCompare(b.datum));
}

export interface MatrixZelle {
  geber: string;
  nehmer: string;
  summe: number;
  anzahl: number;
}

/**
 * Matrix Geber × Nehmer für interne Darlehen (Intercompany und Gesellschafter),
 * Wert = Restschuld zum Stichtag. Schlüssel: Gesellschafts- oder Partei-ID.
 */
export function matrix(staende: DarlehenStand[]): {
  geber: string[];
  nehmer: string[];
  zellen: Map<string, MatrixZelle>;
} {
  const zellen = new Map<string, MatrixZelle>();
  const geber = new Set<string>();
  const nehmer = new Set<string>();
  for (const s of staende) {
    if (
      s.loan.kind === "bank" ||
      s.loan.status !== "aktiv" ||
      s.restschuld <= 0
    )
      continue;
    const g = s.loan.lenderCompanyId ?? s.loan.lenderPartyId!;
    const n = s.loan.borrowerCompanyId ?? s.loan.borrowerPartyId!;
    geber.add(g);
    nehmer.add(n);
    const key = `${g}|${n}`;
    const z = zellen.get(key) ?? { geber: g, nehmer: n, summe: 0, anzahl: 0 };
    z.summe = runden(z.summe + s.restschuld);
    z.anzahl += 1;
    zellen.set(key, z);
  }
  return { geber: [...geber], nehmer: [...nehmer], zellen };
}

/** Prüffälle aus Abgleich und Fristen. IDs sind stabil, damit "erledigt" erhalten bleibt. */
export function darlehenPruefFaelle(
  abgleich: AbgleichErgebnis[],
  staende: DarlehenStand[],
  stichtag: IsoDatum,
): ReviewItem[] {
  const faelle: ReviewItem[] = [];
  const loans = new Map(staende.map((s) => [s.loan.id, s.loan]));
  for (const e of abgleich) {
    if (e.ampel !== "rot" && e.ampel !== "gelb") continue;
    const loan = loans.get(e.soll.loanId);
    const art = loan?.kind === "bank" ? "Rate" : "Zinsen";
    faelle.push({
      id: `darlehen:abgleich:${e.soll.id}`,
      source: "darlehen",
      severity: e.ampel,
      title:
        e.ampel === "rot"
          ? `${art} ${e.soll.loanId} vom ${datumDe(e.soll.dueDate)} nicht gezahlt`
          : `${art} ${e.soll.loanId} vom ${datumDe(e.soll.dueDate)} prüfen`,
      detail:
        e.ampel === "rot"
          ? `Soll ${euro(e.soll.amount)} an ${e.soll.payeeName}; kein Umsatz innerhalb von 5 Tagen.`
          : `${e.gruende.join(", ")}. Soll ${euro(e.soll.amount)}, Ist ${euro(e.transaction ? -e.transaction.amount : null)}.`,
      companyId: e.soll.payerCompanyId,
      refType: "loan",
      refId: e.soll.loanId,
      dueDate: e.soll.dueDate,
      createdAt:
        plusTage(e.soll.dueDate, 5) < stichtag
          ? plusTage(e.soll.dueDate, 5)
          : stichtag,
      status: "offen",
      confidence: null,
    });
  }
  for (const s of staende) {
    if (s.ampel !== "rot" && s.ampel !== "gelb") continue;
    if (!s.kritischesDatum) continue;
    faelle.push({
      id: `darlehen:frist:${s.loan.id}:${s.kritischesDatum}`,
      source: "darlehen",
      severity: s.ampel,
      title: `${s.kritischesEreignis === "Ende" ? "Darlehen endet" : "Zinsbindung endet"}: ${s.loan.id} am ${datumDe(s.kritischesDatum)}`,
      detail: `Restschuld ${euro(s.restschuld)}. Anschlussfinanzierung bzw. Rückzahlung klären.`,
      companyId: s.loan.borrowerCompanyId,
      refType: "loan",
      refId: s.loan.id,
      dueDate: s.kritischesDatum,
      createdAt: stichtag,
      status: "offen",
      confidence: null,
    });
  }
  return faelle;
}
