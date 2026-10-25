/** Markt-Radar: aktive Käufer und mögliche Verkäufer aus Immobiliennews. */

export type RadarSeite = "kaeufer" | "verkaeufer";

export type RadarStatus = "neu" | "gesehen" | "verworfen" | "in_salesforce";

/** Eine Meldung, wie die KI sie liefert (vor Prüfung und Abgleich). */
export type RadarFund = {
  akteur: string;
  akteurTyp: string | null;
  ereignis: string;
  transaktion: string | null;
  objektart: string | null;
  ort: string | null;
  volumenEur: number | null;
  ereignisAm: string | null;
  quelleUrl: string;
  quelleTitel: string | null;
  quelleMedium: string | null;
  relevanz: number;
  begruendung: string;
};

export type RadarMeldung = RadarFund & {
  id: string;
  seite: RadarSeite;
  status: RadarStatus;
  sfKontaktSfId: string | null;
  sfBekanntAls: string | null;
  createdAt: string;
};

export type RadarLauf = {
  id: string;
  gestartetAm: string;
  beendetAm: string | null;
  ausloeser: "cron" | "manuell";
  status: "laeuft" | "fertig" | "fehler";
  anzahlNeu: number;
  anzahlGesamt: number;
  fehler: string | null;
};

export const SEITEN_TEXT: Record<RadarSeite, string> = {
  kaeufer: "Käufer",
  verkaeufer: "Verkäufer",
};
