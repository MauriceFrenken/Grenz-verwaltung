import type { DokumentAnalyseFelder, DokumentTyp } from "@/lib/dokument-ai";
import type { DokumentPosteingangNachricht } from "@/lib/microsoft/ablage";

/** Unterordner (Posteingang oder Postfach-Root), in den archivierte Mails wandern. */
export const ARCHIV_ORDNER = "Archiv";

export type DokumentPosteingangStatus =
  | "neu"
  | "analysiert"
  | "fehler"
  | "abgelegt"
  | "gebucht";

/** Kanban-Spalten für Rechnungsfreigabe (nur Rechnungen). */
export type DokumentFreigabeStatus =
  | "neu"
  | "in_pruefung"
  | "freigegeben"
  | "an_datev"
  | "erledigt";

export const FREIGABE_STATUS_SPALTEN: DokumentFreigabeStatus[] = [
  "neu",
  "in_pruefung",
  "freigegeben",
  "an_datev",
  "erledigt",
];

export const FREIGABE_STATUS_LABELS: Record<DokumentFreigabeStatus, string> = {
  neu: "Neu",
  in_pruefung: "In Prüfung",
  freigegeben: "Freigegeben",
  an_datev: "An DATEV",
  erledigt: "Erledigt",
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
  objektId: string | null;
  ablageOrdnerId: string | null;
  ablageOrdnerPfad: string | null;
  ablageDateiname: string | null;
  abgelegtAm: string | null;
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
} & DokumentMailAbschluss;

export type DokumentTamErgebnis = {
  abgelegt: boolean;
  onedriveId: string;
  ordnerPfad: string;
  weitergeleitetAn: string;
} & DokumentMailAbschluss;
