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
  /** Runway ab heute (unabhängig vom gewählten Jahr), alles netto. */
  runway: {
    /** Summe der letzten Salden aller Konten. */
    kontostand: number;
    /** Geschätzte, noch nicht abgeführte USt (negativ = Erstattung). */
    offeneUst: number;
    /** Erster Monat, dessen USt noch nicht abgerechnet ist (JJJJ-MM). */
    ustOffenAb: string;
    /** Kontostand minus offene USt. */
    liquiditaetNetto: number;
    /** Wiederkehrende Kosten netto, Ø der letzten drei vollen Monate. */
    fixProMonat: number;
    /** Übrige Kosten netto, Ø der letzten zwölf Monate. */
    variabelProMonat: number;
    /** Ertragsteuern der letzten zwölf Monate (nicht in der Runway). */
    ertragsteuern12Monate: number;
    /** Liquidität netto ÷ Fixkosten je Monat. */
    monate: number | null;
    /** Reichweite, wenn auch die variablen Kosten weiterlaufen. */
    monateMitVariabel: number | null;
    /** Letzter Monat, der noch gedeckt ist (JJJJ-MM). */
    reichtBis: string | null;
    posten: Array<{ name: string; kategorie: string; proMonat: number }>;
    verlauf: Array<{ monat: string; nurFix: number; mitVariabel: number }>;
  };
  /** USt-Zahlungen ans Finanzamt minus Erstattungen im Jahr (durchlaufend). */
  ustSaldo: number;
  /** Summe der letzten Salden aller Konten. */
  liquiditaet: number;
  /** Zuflüsse netto, ohne interne Umbuchungen und USt-Erstattungen. */
  einnahmen: number;
  /** Abflüsse netto (Vorsteuer herausgerechnet), ohne USt-Zahlungen, inkl. Ertragsteuern. */
  ausgaben: number;
  ergebnis: number;
  /** Ertragsteuern (Kapitalertrag-, Gewerbe-, Körperschaftsteuer …). */
  steuern: number;
  ausgabenOhneSteuern: number;
  provisionBrutto: number;
  /** Provision ohne 19 % USt. */
  provisionNetto: number;
  anzahlProvisionen: number;
  /** Abgelaufene Monate im gewählten Jahr (für Durchschnitte). */
  monateBisher: number;
  /** Ø Ausgaben netto je Monat ohne Ertragsteuern. */
  kostenProMonat: number;
  /** Runway in Monaten (= runway.monate). */
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
  /** Ausgaben je Monat nach den größten Kategorien (Rest = „Sonstiges“). */
  kategorienMonat: {
    kategorien: Array<{ schluessel: string; label: string }>;
    monate: Array<{ monat: string } & Record<string, number | string>>;
  };
  /** Wiederkehrende Zahlungen (Empfänger in mind. 3 Monaten) vs. einmalige. */
  fixkosten: {
    fixSumme: number;
    variabelSumme: number;
    fixProMonat: number;
    posten: Array<{
      name: string;
      kategorie: string;
      monate: number;
      summe: number;
      proMonat: number;
    }>;
  };
  /** Laufende Summen über das Jahr (für Break-even-Sicht). */
  kumuliert: Array<{ monat: string; provisionen: number; ausgaben: number }>;
  /** Provisionen gruppiert nach Zahler. */
  provisionsZahler: Array<{ name: string; anzahl: number; brutto: number }>;
  provisionen: Array<{
    datum: string;
    zahler: string;
    objekt: string | null;
    brutto: number;
    netto: number;
  }>;
};
