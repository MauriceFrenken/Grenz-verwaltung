import type { ExposeFelder } from "@/lib/expose-ai";
import type { GraphNachricht } from "@/lib/microsoft/graph";

/** Unterordner im Posteingang, in den exportierte Exposé-Mails wandern. */
export const ABGELEGT_ORDNER = "abgelegt";

/** Präfix in `analyse_fehler`: Exposé steckt hinter einem Link, den ein Mensch öffnen muss. */
export const LINK_MANUELL_PRAEFIX = "Link braucht manuellen Abruf";

export function istLinkManuell(
  analyseFehler: string | null | undefined,
): boolean {
  return Boolean(analyseFehler?.startsWith(LINK_MANUELL_PRAEFIX));
}

export type PostfachEintragStatus =
  | "neu"
  | "analysiert"
  | "fehler"
  | "exportiert";

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
  /** „link“ = Mail ohne PDF-Anhang; das Exposé kommt über einen Link. */
  quelle: "anhang" | "link";
  /** Outlook-Link zur Mail (für den manuellen Abruf). */
  webLink: string | null;
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
    /** Große Link-PDFs: signierte Download-URL statt Base64 (Vercel-Antwortlimit). */
    url?: string;
  };
};

export type PostfachExportErgebnis = {
  /** Mail wurde in den Unterordner verschoben. */
  abgelegt: boolean;
  ordner: string;
  fehler?: string;
};
