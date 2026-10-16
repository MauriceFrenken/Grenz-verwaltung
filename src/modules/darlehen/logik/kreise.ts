/**
 * Gliederung der Darlehen in intern (Gruppe und Gesellschafter) und extern
 * (Banken, private Darlehensgeber, Dritte) plus Auswertungen für die Diagramme.
 */
import { tageZwischen, teile, type IsoDatum } from "@/lib/kalender";
import type { Loan } from "@/lib/db/typen";
import type { DarlehenStand } from "./auswertung";
import { runden } from "./zinsplan";

export type Kreis = "intern" | "extern";
/** Teil des Darlehensbestands für die Diagramme */
export type Gruppe = "bank" | "privat" | "intern";

export const GRUPPE_LABEL: Record<Gruppe, string> = {
  bank: "Banken",
  privat: "Private & Dritte",
  intern: "Intern",
};

/** Feste Farbreihenfolge (geprüft auf Farbsehschwäche, hell und dunkel). */
export const GRUPPE_FARBE: Record<Gruppe, string> = {
  bank: "#6b7cf0",
  privat: "#c27e22",
  intern: "#1fa38e",
};

export function kreis(loan: Loan): Kreis {
  return loan.kind === "intercompany" || loan.kind === "gesellschafter"
    ? "intern"
    : "extern";
}

export function gruppe(loan: Loan): Gruppe {
  if (kreis(loan) === "intern") return "intern";
  return loan.kind === "bank" ? "bank" : "privat";
}

/** Externes Darlehen, bei dem eine Grenz-&-Co.-Gesellschaft Geld nimmt. */
export function istExterneVerbindlichkeit(loan: Loan): boolean {
  return kreis(loan) === "extern" && loan.borrowerCompanyId != null;
}

/** Externes Darlehen, bei dem eine Grenz-&-Co.-Gesellschaft Geld an Dritte gibt. */
export function istExterneForderung(loan: Loan): boolean {
  return (
    kreis(loan) === "extern" &&
    loan.borrowerCompanyId == null &&
    loan.lenderCompanyId != null
  );
}

function offen(s: DarlehenStand) {
  return s.loan.status === "aktiv" && s.restschuld > 0;
}

export interface KreisSummen {
  bank: number;
  privat: number;
  intern: number;
  /** externe Forderungen der Gruppe an Dritte */
  forderungenExtern: number;
  zinsenExternPa: number;
  zinsenBankPa: number;
  zinsenPrivatPa: number;
  zinsenInternPa: number;
  anzahl: Record<Gruppe, number>;
}

/** Summen je Gruppe; externe Forderungen zählen nicht als Verbindlichkeit. */
export function kreisSummen(staende: DarlehenStand[]): KreisSummen {
  const r: KreisSummen = {
    bank: 0,
    privat: 0,
    intern: 0,
    forderungenExtern: 0,
    zinsenExternPa: 0,
    zinsenBankPa: 0,
    zinsenPrivatPa: 0,
    zinsenInternPa: 0,
    anzahl: { bank: 0, privat: 0, intern: 0 },
  };
  for (const s of staende) {
    if (!offen(s)) continue;
    const zins = s.restschuld * s.loan.rate;
    if (istExterneForderung(s.loan)) {
      r.forderungenExtern += s.restschuld;
      continue;
    }
    const g = gruppe(s.loan);
    r[g] += s.restschuld;
    r.anzahl[g] += 1;
    if (g === "bank") r.zinsenBankPa += zins;
    else if (g === "privat") r.zinsenPrivatPa += zins;
    else r.zinsenInternPa += zins;
  }
  r.zinsenExternPa = r.zinsenBankPa + r.zinsenPrivatPa;
  for (const k of [
    "bank",
    "privat",
    "intern",
    "forderungenExtern",
    "zinsenExternPa",
    "zinsenBankPa",
    "zinsenPrivatPa",
    "zinsenInternPa",
  ] as const)
    r[k] = runden(r[k]);
  return r;
}

export interface GeberZeile {
  id: string;
  gruppe: Exclude<Gruppe, "intern">;
  restschuld: number;
  anzahl: number;
  /** gewichteter Zins (Anteil, 0.03 = 3 %) */
  zinsSchnitt: number;
  zinsenPa: number;
}

/** Externe Darlehensgeber, absteigend nach Restschuld. */
export function externeGeber(staende: DarlehenStand[]): GeberZeile[] {
  const m = new Map<string, GeberZeile>();
  for (const s of staende) {
    if (!offen(s) || !istExterneVerbindlichkeit(s.loan)) continue;
    const id = s.loan.lenderPartyId ?? s.loan.lenderCompanyId ?? "?";
    const z = m.get(id) ?? {
      id,
      gruppe: gruppe(s.loan) as GeberZeile["gruppe"],
      restschuld: 0,
      anzahl: 0,
      zinsSchnitt: 0,
      zinsenPa: 0,
    };
    z.restschuld += s.restschuld;
    z.zinsenPa += s.restschuld * s.loan.rate;
    z.anzahl += 1;
    m.set(id, z);
  }
  return [...m.values()]
    .map((z) => ({
      ...z,
      restschuld: runden(z.restschuld),
      zinsenPa: runden(z.zinsenPa),
      zinsSchnitt: z.restschuld > 0 ? z.zinsenPa / z.restschuld : 0,
    }))
    .sort((a, b) => b.restschuld - a.restschuld);
}

export interface NehmerZeile {
  companyId: string;
  bank: number;
  privat: number;
  intern: number;
}

/** Verbindlichkeiten je Grenz-&-Co.-Gesellschaft, gestapelt nach Gruppe. */
export function verbindlichkeitenJeGesellschaft(
  staende: DarlehenStand[],
): NehmerZeile[] {
  const m = new Map<string, NehmerZeile>();
  for (const s of staende) {
    if (!offen(s) || !s.loan.borrowerCompanyId) continue;
    const id = s.loan.borrowerCompanyId;
    const z = m.get(id) ?? { companyId: id, bank: 0, privat: 0, intern: 0 };
    z[gruppe(s.loan)] += s.restschuld;
    m.set(id, z);
  }
  return [...m.values()]
    .map((z) => ({
      ...z,
      bank: runden(z.bank),
      privat: runden(z.privat),
      intern: runden(z.intern),
    }))
    .sort(
      (a, b) => b.bank + b.privat + b.intern - (a.bank + a.privat + a.intern),
    );
}

export interface ProfilJahr {
  /** Jahreszahl oder "offen" für unbefristete Darlehen */
  jahr: string;
  bank: number;
  privat: number;
  intern: number;
}

/**
 * Wann wird wie viel fällig bzw. neu verhandelt (Ende oder Zinsbindungsende,
 * was zuerst kommt)? Unbefristete Darlehen landen unter "offen".
 */
export function faelligkeitsProfil(
  staende: DarlehenStand[],
  stichtag: IsoDatum,
): ProfilJahr[] {
  const m = new Map<string, ProfilJahr>();
  for (const s of staende) {
    if (!offen(s) || istExterneForderung(s.loan)) continue;
    const jahr = s.kritischesDatum
      ? String(teile(s.kritischesDatum).jahr)
      : s.loan.maturityDate && s.loan.maturityDate < stichtag
        ? String(teile(stichtag).jahr)
        : "offen";
    const z = m.get(jahr) ?? { jahr, bank: 0, privat: 0, intern: 0 };
    z[gruppe(s.loan)] += s.restschuld;
    m.set(jahr, z);
  }
  return [...m.values()]
    .map((z) => ({
      ...z,
      bank: runden(z.bank),
      privat: runden(z.privat),
      intern: runden(z.intern),
    }))
    .sort((a, b) =>
      a.jahr === "offen"
        ? 1
        : b.jahr === "offen"
          ? -1
          : a.jahr.localeCompare(b.jahr),
    );
}

export interface NettoZeile {
  /** Gesellschafts- oder Partei-ID */
  id: string;
  forderungen: number;
  verbindlichkeiten: number;
  netto: number;
}

/** Interne Netto-Position je Beteiligtem: Forderungen minus Verbindlichkeiten. */
export function internNetto(staende: DarlehenStand[]): NettoZeile[] {
  const m = new Map<string, NettoZeile>();
  const hol = (id: string) =>
    m.get(id) ??
    m.set(id, { id, forderungen: 0, verbindlichkeiten: 0, netto: 0 }).get(id)!;
  for (const s of staende) {
    if (!offen(s) || kreis(s.loan) !== "intern") continue;
    const g = s.loan.lenderCompanyId ?? s.loan.lenderPartyId;
    const n = s.loan.borrowerCompanyId ?? s.loan.borrowerPartyId;
    if (g) hol(g).forderungen += s.restschuld;
    if (n) hol(n).verbindlichkeiten += s.restschuld;
  }
  return [...m.values()]
    .map((z) => ({
      id: z.id,
      forderungen: runden(z.forderungen),
      verbindlichkeiten: runden(z.verbindlichkeiten),
      netto: runden(z.forderungen - z.verbindlichkeiten),
    }))
    .sort((a, b) => b.netto - a.netto);
}

export type Laufzeitart = "variabel" | "zinsbindung" | "ende" | "unbefristet";

export interface LaufzeitZeile {
  loan: Loan;
  gruppe: Exclude<Gruppe, "intern">;
  restschuld: number;
  art: Laufzeitart;
  /** Ende der Zinsbindung bzw. des Vertrags; null = offen */
  bis: IsoDatum | null;
}

/**
 * Externe Verbindlichkeiten mit ihrer Zins- bzw. Vertragslaufzeit:
 * variabel verzinste zuerst, danach nach Datum, unbefristete am Schluss.
 * Festzins: Zinsbindungsende, sonst Vertragsende; variabel: Vertragsende.
 */
export function externeLaufzeiten(staende: DarlehenStand[]): LaufzeitZeile[] {
  const zeilen: LaufzeitZeile[] = [];
  for (const s of staende) {
    if (!offen(s) || !istExterneVerbindlichkeit(s.loan)) continue;
    const l = s.loan;
    const variabel = l.rateType === "variabel";
    const bis = variabel ? l.maturityDate : (l.fixedUntil ?? l.maturityDate);
    zeilen.push({
      loan: l,
      gruppe: gruppe(l) as LaufzeitZeile["gruppe"],
      restschuld: s.restschuld,
      art: variabel
        ? "variabel"
        : l.fixedUntil
          ? "zinsbindung"
          : l.maturityDate
            ? "ende"
            : "unbefristet",
      bis,
    });
  }
  const rang = (z: LaufzeitZeile) => (z.art === "variabel" ? 0 : z.bis ? 1 : 2);
  return zeilen.sort(
    (a, b) =>
      rang(a) - rang(b) ||
      (a.bis ?? "").localeCompare(b.bis ?? "") ||
      b.restschuld - a.restschuld,
  );
}

export interface AufgelaufenZeile {
  loan: Loan;
  restschuld: number;
  /** rechnerisch aufgelaufene Zinsen seit Auszahlung (30/360, ohne Zinseszins) */
  aufgelaufen: number;
}

/**
 * Darlehen, deren Zinsen erst mit der Rückzahlung fließen, mit den bis zum
 * Stichtag rechnerisch aufgelaufenen Zinsen (größte zuerst).
 */
export function zinsenBeiRueckzahlung(
  staende: DarlehenStand[],
  stichtag: IsoDatum,
): AufgelaufenZeile[] {
  return staende
    .filter((s) => offen(s) && s.loan.interestAtMaturity)
    .map((s) => ({
      loan: s.loan,
      restschuld: s.restschuld,
      aufgelaufen: runden(
        (s.restschuld *
          s.loan.rate *
          Math.max(0, tageZwischen(s.loan.disbursementDate, stichtag))) /
          360,
      ),
    }))
    .sort((a, b) => b.aufgelaufen - a.aufgelaufen);
}
