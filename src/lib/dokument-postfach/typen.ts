import type { DokumentAnalyseFelder, DokumentTyp } from "@/lib/dokument-ai";
import type { DokumentPosteingangNachricht } from "@/lib/microsoft/ablage";

export type DokumentPosteingangStatus =
  | "neu"
  | "analysiert"
  | "fehler"
  | "abgelegt"
  | "gebucht";

export type DokumentPosteingangEintrag = {
  id: string;
  postfach: string;
  graphNachrichtId: string;
  betreff: string | null;
  absenderName: string | null;
  absenderMail: string | null;
  eingegangenAm: string | null;
  anhangName: string | null;
  anhangGroesse: number | null;
  status: DokumentPosteingangStatus;
  dokumentTyp: DokumentTyp | null;
  istRechnung: boolean | null;
  felder: DokumentAnalyseFelder | null;
  analyseFehler: string | null;
  analysiertAm: string | null;
  gesellschaftId: string | null;
  objektId: string | null;
  ablageOrdnerId: string | null;
  ablageOrdnerPfad: string | null;
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

export type DokumentAblegenErgebnis = {
  abgelegt: boolean;
  onedriveId: string;
  ordnerPfad: string;
};
