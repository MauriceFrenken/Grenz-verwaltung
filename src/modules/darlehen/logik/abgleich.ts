/**
 * Abgleich Soll-Zahlungen (aus dem Zinsplan) gegen Kontoumsätze.
 *
 * Kriterien je Kandidat: Betrag, Gegenpartei (Name oder IBAN), Datum ± 5 Tage,
 * Darlehens- oder Bank-ID im Verwendungszweck.
 * Ampel:
 *  - grün: Betrag stimmt, Datum ± 5 Tage, und ID oder Gegenpartei erkannt
 *  - gelb: Zahlung gefunden, aber Betrag weicht ab oder Datum außerhalb ± 5 Tage (bis 30 Tage)
 *          oder weder ID noch Gegenpartei eindeutig
 *  - rot:  keine Zahlung, Fälligkeit + 5 Tage überschritten
 *  - grau: noch nicht fällig bzw. Toleranz läuft noch
 */
import { plusTage, tageZwischen, type IsoDatum } from "@/lib/kalender";
import type {
  BankAccount,
  Company,
  InterestScheduleRow,
  Loan,
  Party,
  Transaction,
} from "@/lib/db/typen";
import type { Ampel } from "@/components/board/ampel";
import { runden } from "./zinsplan";

export const TOLERANZ_TAGE = 5;
export const SUCHFENSTER_TAGE = 30;
export const BETRAG_TOLERANZ = 0.01;
/** relative Abweichung, bis zu der eine Zahlung noch als "gleicher Vorgang" gilt */
export const BETRAG_NAEHE = 0.1;

export interface SollZahlung {
  id: string;
  loanId: string;
  nr: number;
  dueDate: IsoDatum;
  amount: number;
  interest: number;
  principal: number;
  payerCompanyId: string;
  payeeName: string;
  payeeIban: string | null;
  /** IDs, die im Verwendungszweck erwartet werden (DL-…, BK-…) */
  referenzen: string[];
}

export interface AbgleichErgebnis {
  soll: SollZahlung;
  ampel: Ampel;
  transaction: Transaction | null;
  gruende: string[];
  /** Ist − Soll (bei gefundener Zahlung) */
  abweichungBetrag: number | null;
  /** Buchungstag − Fälligkeit in Tagen */
  abweichungTage: number | null;
}

/** Soll-Zahlungen aller Darlehen mit Zahlungspflicht einer Gruppengesellschaft. */
export function sollZahlungen(
  loans: Loan[],
  plaene: Map<string, InterestScheduleRow[]>,
  kontext: { companies: Company[]; parties: Party[]; accounts: BankAccount[] },
  von: IsoDatum,
  bis: IsoDatum,
): SollZahlung[] {
  const companies = new Map(kontext.companies.map((c) => [c.id, c]));
  const parties = new Map(kontext.parties.map((p) => [p.id, p]));
  const ergebnis: SollZahlung[] = [];
  for (const loan of loans) {
    if (!loan.borrowerCompanyId || loan.status !== "aktiv") continue;
    const plan = plaene.get(loan.id) ?? [];
    const payeeName = loan.lenderCompanyId
      ? (companies.get(loan.lenderCompanyId)?.name ?? "")
      : (parties.get(loan.lenderPartyId ?? "")?.name ?? "");
    const payeeIban = loan.lenderCompanyId
      ? (kontext.accounts.find((a) => a.companyId === loan.lenderCompanyId)
          ?.iban ?? null)
      : (parties.get(loan.lenderPartyId ?? "")?.iban ?? null);
    for (const z of plan) {
      if (z.dueDate < von || z.dueDate > bis || z.payment <= 0) continue;
      ergebnis.push({
        id: `${loan.id}#${z.nr}`,
        loanId: loan.id,
        nr: z.nr,
        dueDate: z.dueDate,
        amount: z.payment,
        interest: z.interest,
        principal: z.principal,
        payerCompanyId: loan.borrowerCompanyId,
        payeeName,
        payeeIban,
        referenzen: [loan.id, ...(loan.bankRef ? [loan.bankRef] : [])],
      });
    }
  }
  return ergebnis.sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
  );
}

function normalisiere(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/** Gegenpartei passt, wenn IBAN gleich ist oder der Name (normalisiert) übereinstimmt. */
export function gegenparteiPasst(soll: SollZahlung, tx: Transaction): boolean {
  if (
    soll.payeeIban &&
    tx.counterpartyIban &&
    soll.payeeIban === tx.counterpartyIban
  )
    return true;
  const a = normalisiere(soll.payeeName);
  const b = normalisiere(tx.counterpartyName);
  return a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a));
}

export function referenzPasst(soll: SollZahlung, tx: Transaction): boolean {
  const zweck = tx.purpose.toUpperCase();
  return soll.referenzen.some((r) => zweck.includes(r.toUpperCase()));
}

interface Bewertung {
  tx: Transaction;
  punkte: number;
  betragOk: boolean;
  datumOk: boolean;
  refOk: boolean;
  partnerOk: boolean;
  tage: number;
}

function bewerte(soll: SollZahlung, tx: Transaction): Bewertung | null {
  if (tx.amount >= 0) return null;
  const ist = -tx.amount;
  const tage = tageZwischen(soll.dueDate, tx.bookingDate);
  if (Math.abs(tage) > SUCHFENSTER_TAGE) return null;
  const betragOk = Math.abs(ist - soll.amount) <= BETRAG_TOLERANZ;
  const betragNah = Math.abs(ist - soll.amount) <= soll.amount * BETRAG_NAEHE;
  const refOk = referenzPasst(soll, tx);
  const partnerOk = gegenparteiPasst(soll, tx);
  if (!betragNah || !(refOk || partnerOk)) return null;
  const datumOk = Math.abs(tage) <= TOLERANZ_TAGE;
  const punkte =
    (refOk ? 4 : 0) +
    (partnerOk ? 2 : 0) +
    (betragOk ? 3 : 0) +
    (datumOk ? 2 : 0) -
    Math.abs(tage) * 0.01;
  return { tx, punkte, betragOk, datumOk, refOk, partnerOk, tage };
}

/**
 * Ordnet jeder Soll-Zahlung höchstens einen Umsatz zu (jeder Umsatz höchstens einmal).
 * Zwei Durchläufe: zuerst nur Treffer innerhalb ± 5 Tagen, dann das weitere Suchfenster,
 * damit eine fehlende Zahlung nicht die Zahlung des Nachbarmonats "stiehlt".
 */
export function abgleichen(
  soll: SollZahlung[],
  transactions: Transaction[],
  accounts: BankAccount[],
  stichtag: IsoDatum,
): AbgleichErgebnis[] {
  const kontenJeGesellschaft = new Map<string, Set<string>>();
  for (const a of accounts) {
    if (!kontenJeGesellschaft.has(a.companyId))
      kontenJeGesellschaft.set(a.companyId, new Set());
    kontenJeGesellschaft.get(a.companyId)!.add(a.id);
  }
  const benutzt = new Set<string>();
  const treffer = new Map<string, Bewertung>();

  for (const durchlauf of [1, 2] as const) {
    for (const s of soll) {
      if (treffer.has(s.id)) continue;
      const konten = kontenJeGesellschaft.get(s.payerCompanyId) ?? new Set();
      let beste: Bewertung | null = null;
      for (const tx of transactions) {
        if (benutzt.has(tx.id) || !konten.has(tx.accountId)) continue;
        const b = bewerte(s, tx);
        if (!b || (durchlauf === 1 && !b.datumOk)) continue;
        if (!beste || b.punkte > beste.punkte) beste = b;
      }
      if (beste) {
        benutzt.add(beste.tx.id);
        treffer.set(s.id, beste);
      }
    }
  }

  return soll.map((s) => {
    const b = treffer.get(s.id);
    if (!b) {
      const ueberfaellig = plusTage(s.dueDate, TOLERANZ_TAGE) < stichtag;
      return {
        soll: s,
        ampel: ueberfaellig ? "rot" : "grau",
        transaction: null,
        gruende: [
          ueberfaellig
            ? "Keine passende Zahlung gefunden"
            : "Noch nicht fällig",
        ],
        abweichungBetrag: null,
        abweichungTage: null,
      };
    }
    const gruende: string[] = [];
    if (!b.betragOk) gruende.push("Betrag weicht ab");
    if (!b.datumOk)
      gruende.push(`Datum ${b.tage > 0 ? "+" : ""}${b.tage} Tage`);
    if (!b.refOk)
      gruende.push(
        b.partnerOk ? "ID fehlt im Verwendungszweck" : "Gegenpartei abweichend",
      );
    const ampel: Ampel =
      b.betragOk && b.datumOk && (b.refOk || b.partnerOk) ? "gruen" : "gelb";
    return {
      soll: s,
      ampel,
      transaction: b.tx,
      gruende:
        ampel === "gruen"
          ? [
              b.refOk
                ? "ID, Betrag und Datum passen"
                : "Gegenpartei, Betrag und Datum passen",
            ]
          : gruende,
      abweichungBetrag: runden(-b.tx.amount - s.amount),
      abweichungTage: b.tage,
    };
  });
}

/** Quote der fälligen Soll-Zahlungen mit grüner Ampel. */
export function abgleichsQuote(ergebnisse: AbgleichErgebnis[]): number | null {
  const faellig = ergebnisse.filter((e) => e.ampel !== "grau");
  if (faellig.length === 0) return null;
  return faellig.filter((e) => e.ampel === "gruen").length / faellig.length;
}
