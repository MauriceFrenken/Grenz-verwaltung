import type { ExposeFelder } from "@/lib/expose-ai";
import type { GraphNachricht } from "@/lib/microsoft/graph";

/** Unterordner im Posteingang, in den exportierte Exposé-Mails wandern. */
export const ABGELEGT_ORDNER = "abgelegt";

export type PostfachEintragStatus =
  "neu" | "analysiert" | "fehler" | "exportiert";

/** Analysierte Exposé-Mail — Client-Sicht auf `postfach_exposes`. */
export type PostfachEintrag = {
  id: string;
  graphNachrichtId: string;
  betreff: string | null;
  absenderName: string | null;
  absenderMail: string | null;
  eingegangenAm: string | null;
  anhangName: string | null;
  anhangGroesse: number | null;
  status: PostfachEintragStatus;
  felder: ExposeFelder | null;
  analyseFehler: string | null;
  analysiertAm: string | null;
  salesforceRealEstateId: string | null;
  exportiertAm: string | null;
  abgelegtAm: string | null;
};

export type PostfachSyncErgebnis = {
  postfach: string;
  nachrichten: GraphNachricht[];
  eintraege: PostfachEintrag[];
  /** Mails mit PDF, die noch auf die KI-Analyse warten. */
  offen: number;
};

export type PostfachEintragMitPdf = {
  eintrag: PostfachEintrag;
  pdf: {
    dateiname: string;
    mimeType: string;
    base64: string;
  };
};

export type PostfachExportErgebnis = {
  /** Mail wurde in den Unterordner verschoben. */
  abgelegt: boolean;
  ordner: string;
  fehler?: string;
};
