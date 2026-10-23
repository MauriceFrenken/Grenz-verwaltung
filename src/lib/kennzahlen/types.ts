import type { Kategorie } from "./kategorien";

export type KennzahlenDto = {
  jahr: number;
  /** Datum, bis zu dem gerechnet wurde (ISO). */
  stand: string;
  konten: Array<{
    iban: string;
    bezeichnung: string | null;
    saldo: number | null;
    saldoStichtag: string | null;
  }>;
  /** Summe der letzten Salden aller Konten. */
  liquiditaet: number;
  /** Zuflüsse ohne interne Umbuchungen (brutto). */
  einnahmen: number;
  /** Abflüsse ohne interne Umbuchungen (brutto, inkl. Steuern). */
  ausgaben: number;
  ergebnis: number;
  steuern: number;
  ausgabenOhneSteuern: number;
  provisionBrutto: number;
  /** Provision ohne 19 % USt. */
  provisionNetto: number;
  anzahlProvisionen: number;
  /** Abgelaufene Monate im gewählten Jahr (für Durchschnitte). */
  monateBisher: number;
  /** Ø Ausgaben je Monat inkl. Steuern. */
  kostenProMonat: number;
  /** Liquidität ÷ Ø Ausgaben je Monat. */
  reichweiteMonate: number | null;
  monate: Array<{
    monat: string;
    einnahmen: number;
    ausgaben: number;
    provisionen: number;
    /** Gesamtsaldo am Monatsende, rückgerechnet (null = Zukunft). */
    saldo: number | null;
  }>;
  kategorien: Array<{ kategorie: Kategorie; label: string; betrag: number }>;
  topEmpfaenger: Array<{ name: string; kategorie: string; betrag: number }>;
  provisionen: Array<{
    datum: string;
    zahler: string;
    objekt: string | null;
    brutto: number;
    netto: number;
  }>;
};
