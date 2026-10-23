import type { DokumentAnalyseFelder, DokumentTyp } from "@/lib/dokument-ai";
import type { DokumentPosteingangNachricht } from "@/lib/microsoft/ablage";

/** Unterordner (Posteingang oder Postfach-Root), in den archivierte Mails wandern. */
export const ARCHIV_ORDNER = "Archiv";

export type DokumentPosteingangStatus =
  | "neu"
  | "in_analyse"
  | "analysiert"
  | "fehler"
  | "abgelegt"
  | "gebucht";

/** Noch nicht fertig analysiert (Warteschlange oder laufender Claim). */
export function istAnalyseOffen(status: DokumentPosteingangStatus): boolean {
  return status === "neu" || status === "in_analyse";
}

/** Kanban-Spalten für Rechnungsfreigabe (nur Rechnungen). */
export type DokumentFreigabeStatus =
  | "neu"
  | "in_pruefung"
  | "freigegeben" // legacy DB — wird als in_pruefung behandelt
  | "an_datev"
  | "erledigt";

/** Sichtbare Board-Spalten (ohne Freigegeben/Erledigt). */
export const FREIGABE_STATUS_SPALTEN: DokumentFreigabeStatus[] = [
  "neu",
  "in_pruefung",
  "an_datev",
];

export const FREIGABE_STATUS_LABELS: Record<DokumentFreigabeStatus, string> = {
  neu: "Offen",
  in_pruefung: "In Prüfung",
  freigegeben: "In Prüfung",
  an_datev: "An DATEV",
  erledigt: "Erledigt",
};

/** Aufbewahrung der an DATEV gesendeten Rechnungen (Board + Dublettenprüfung). */
export const RECHNUNG_HISTORIE_TAGE = 30;

export type RechnungDuplikatTreffer = {
  /**
   * `datev`: Historie (bereits gebucht) · `offen`: noch auf dem Board ·
   * `gesendet`: Anhang gleichen Namens schon an DATEV im Ordner „Gesendet“.
   */
  quelle: "datev" | "offen" | "gesendet";
  rechnungsnummer: string;
  rechnungssteller: string | null;
  rechnungsbetrag: string | null;
  waehrung: string | null;
  /** An DATEV gesendet am bzw. eingegangen am. */
  datum: string | null;
  /** Bei `gesendet`: Name des bereits versendeten Anhangs. */
  anhangName?: string | null;
};

export type RechnungDuplikatHinweis = {
  rechnungsnummer: string;
  geprueftAm: string;
  treffer: RechnungDuplikatTreffer[];
};

/** An DATEV gesendete Rechnung — bleibt RECHNUNG_HISTORIE_TAGE sichtbar. */
export type RechnungHistorieEintrag = {
  id: string;
  rechnungsnummer: string | null;
  rechnungssteller: string | null;
  rechnungsbetrag: string | null;
  waehrung: string | null;
  rechnungsdatum: string | null;
  gesellschaftName: string | null;
  betreff: string | null;
  anhangName: string | null;
  ablageDateiname: string | null;
  anDatevAm: string;
};

export type DokumentPosteingangEintrag = {
  id: string;
  postfach: string;
  graphNachrichtId: string;
  betreff: string | null;
  absenderName: string | null;
  absenderMail: string | null;
  eingegangenAm: string | null;
  anhangName: string | null;
  anhangContentType: string | null;
  anhangGroesse: number | null;
  status: DokumentPosteingangStatus;
  freigabeStatus: DokumentFreigabeStatus | null;
  dokumentTyp: DokumentTyp | null;
  istRechnung: boolean | null;
  felder: DokumentAnalyseFelder | null;
  analyseFehler: string | null;
  analysiertAm: string | null;
  gesellschaftId: string | null;
  ablageOrdnerId: string | null;
  ablageOrdnerPfad: string | null;
  ablageDateiname: string | null;
  abgelegtAm: string | null;
  duplikatHinweis: RechnungDuplikatHinweis | null;
  /** Outlook-Kategorie „ablegen“ (gelb) — aus Graph-Sync. */
  hatAblegenKategorie: boolean;
};

export type DokumentRechnungsfreigabe = {
  eintraege: DokumentPosteingangEintrag[];
  /** In den letzten 30 Tagen an DATEV gesendet. */
  historie: RechnungHistorieEintrag[];
};

export type DokumentPosteingangSyncErgebnis = {
  postfaecher: string[];
  nachrichten: DokumentPosteingangNachricht[];
  eintraege: DokumentPosteingangEintrag[];
  offen: number;
};

export type DokumentPosteingangMitAnhang = {
  eintrag: DokumentPosteingangEintrag;
  anhang: {
    dateiname: string;
    mimeType: string;
    base64: string;
  };
};

/** @deprecated Alias */
export type DokumentPosteingangMitPdf = DokumentPosteingangMitAnhang;

export type DokumentMailAbschluss = {
  /** Mail wurde in den Gesellschafts-Unterordner verschoben (alle Anhänge erledigt). */
  mailVerschoben: boolean;
  mailOrdner: string | null;
  postfach: string;
  graphNachrichtId: string;
};

export type DokumentAblegenErgebnis = {
  abgelegt: boolean;
  onedriveId: string;
  ordnerPfad: string;
} & DokumentMailAbschluss;

export type DokumentBuchenErgebnis = {
  gebucht: boolean;
  onedriveId: string;
  ordnerPfad: string;
  datevPostfach: string;
  /** Karte für die Board-Spalte „An DATEV“ (null, wenn nicht gespeichert). */
  historie: RechnungHistorieEintrag | null;
} & DokumentMailAbschluss;
