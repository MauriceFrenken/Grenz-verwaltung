/**
 * Die drei Antworten des Cockpits (Geld, Risiko, Kapitalbindung) und das
 * Laufband der Bankbuchungen als reine Funktionen.
 */
import { plusTage, type IsoDatum } from "@/lib/kalender";
import {
  SEGMENT_LABEL,
  type BoardDaten,
  type Company,
  type Segment,
} from "@/lib/db/typen";
import type { DarlehenStand } from "@/modules/darlehen/logik/auswertung";

export interface Bindung {
  segment: Segment;
  label: string;
  betrag: number;
  anteil: number;
  /** Anzahl interner Darlehen */
  anzahl: number;
}

/**
 * Wo steckt das Geld der Holding? Aktive interne Darlehen, deren Geber eine
 * Holding-Gesellschaft ist, nach Segment des Nehmers (Restschuld).
 */
export function kapitalbindung(
  staende: DarlehenStand[],
  companies: Company[],
): { summe: number; posten: Bindung[] } {
  const seg = new Map(companies.map((c) => [c.id, c.segment]));
  const summen = new Map<Segment, { betrag: number; anzahl: number }>();
  for (const s of staende) {
    const l = s.loan;
    if (l.status !== "aktiv" || l.kind !== "intercompany") continue;
    if (!l.lenderCompanyId || seg.get(l.lenderCompanyId) !== "holding")
      continue;
    const nehmer = l.borrowerCompanyId ? seg.get(l.borrowerCompanyId) : null;
    if (!nehmer || nehmer === "holding") continue;
    const alt = summen.get(nehmer) ?? { betrag: 0, anzahl: 0 };
    summen.set(nehmer, {
      betrag: alt.betrag + Math.max(0, s.restschuld),
      anzahl: alt.anzahl + 1,
    });
  }
  const summe = [...summen.values()].reduce((a, x) => a + x.betrag, 0);
  const posten = [...summen.entries()]
    .map(([segment, x]) => ({
      segment,
      label: SEGMENT_LABEL[segment],
      betrag: x.betrag,
      anzahl: x.anzahl,
      anteil: summe ? x.betrag / summe : 0,
    }))
    .filter((p) => p.betrag > 0)
    .sort((a, b) => b.betrag - a.betrag);
  return { summe, posten };
}

export interface Frist {
  stand: DarlehenStand;
  datum: IsoDatum;
  ereignis: "Ende" | "Zinsbindung";
}

/** Darlehen, deren Ende oder Zinsbindung innerhalb von `tage` Tagen liegt (auch überfällig), nach Datum. */
export function fristenBis(
  staende: DarlehenStand[],
  stichtag: IsoDatum,
  tage = 90,
  passt: (companyId: string | null) => boolean = () => true,
): Frist[] {
  const bis = plusTage(stichtag, tage);
  return staende
    .filter(
      (s) =>
        s.loan.status === "aktiv" &&
        s.kritischesDatum &&
        s.kritischesEreignis &&
        s.kritischesDatum <= bis &&
        (passt(s.loan.borrowerCompanyId) || passt(s.loan.lenderCompanyId)),
    )
    .map((s) => ({
      stand: s,
      datum: s.kritischesDatum!,
      ereignis: s.kritischesEreignis!,
    }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

export interface TickerBuchung {
  id: string;
  datum: IsoDatum;
  companyId: string | null;
  kuerzel: string;
  text: string;
  betrag: number;
}

/** Die letzten Bankbuchungen der Gruppe, neueste zuerst. */
export function letzteBuchungen(
  daten: Pick<BoardDaten, "transactions" | "bankAccounts" | "companies">,
  anzahl = 14,
  passt: (companyId: string | null) => boolean = () => true,
): TickerBuchung[] {
  const konto = new Map(daten.bankAccounts.map((k) => [k.id, k.companyId]));
  const kurz = new Map(daten.companies.map((c) => [c.id, c.shortName]));
  return daten.transactions
    .map((t) => {
      const companyId = konto.get(t.accountId) ?? null;
      return {
        id: t.id,
        datum: t.bookingDate,
        companyId,
        kuerzel: (companyId && kurz.get(companyId)) || "–",
        text: (t.counterpartyName || t.purpose || "").trim(),
        betrag: t.amount,
      };
    })
    .filter((t) => passt(t.companyId) && t.betrag !== 0)
    .sort((a, b) => b.datum.localeCompare(a.datum) || b.id.localeCompare(a.id))
    .slice(0, anzahl);
}
