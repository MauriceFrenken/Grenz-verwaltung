/**
 * Outlook-Kategorie „ablegen“ (gelb): beim Postfach-Laden Mails mit
 * dieser Kategorie über den KI-Zielordner ablegen. Server-only.
 */
import {
  microsoftPostMailboxZweit,
  type DokumentPosteingangNachricht,
} from "@/lib/microsoft/ablage";
import {
  MICROSOFT_ABLEGEN_KATEGORIE,
  MICROSOFT_ABLEGEN_KATEGORIE_FARBE,
} from "@/lib/microsoft/config";
import {
  graphMasterKategorieSicherstellen,
  graphNachrichtHatKategorie,
} from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";

import { dokumentPosteingangSchnellAusfuehren } from "./ausfuehren";
import { leseEintraegeFuerNachricht } from "./store";

export type OutlookAblegenErgebnis = {
  verarbeitet: number;
  fehlgeschlagen: number;
};

/**
 * Stellt die gelbe Master-Kategorie „ablegen“ im m.frenken-Postfach sicher.
 * Fehler (z. B. fehlendes MailboxSettings.ReadWrite) werden geloggt, nicht geworfen.
 */
export async function dokumentPosteingangAblegenKategorieSicherstellen(): Promise<void> {
  const postfach = microsoftPostMailboxZweit();
  if (!postfach) return;

  try {
    const { accessToken } = await microsoftAccessToken();
    await graphMasterKategorieSicherstellen(
      accessToken,
      postfach,
      MICROSOFT_ABLEGEN_KATEGORIE,
      MICROSOFT_ABLEGEN_KATEGORIE_FARBE,
    );
  } catch (err) {
    console.error(
      "[dokument-postfach] Outlook-Kategorie „ablegen“ konnte nicht angelegt werden",
      "(MailboxSettings.ReadWrite in Entra prüfen)",
      err,
    );
  }
}

/**
 * Analysierte Anhänge von Mails mit Kategorie „ablegen“ (nur m.frenken)
 * über Schnellausführen ablegen / buchen / TAM.
 */
export async function dokumentPosteingangOutlookKategorieAblegen(input: {
  supabaseAccessToken: string;
  nachrichten: DokumentPosteingangNachricht[];
}): Promise<OutlookAblegenErgebnis> {
  const zielPostfach = microsoftPostMailboxZweit().toLowerCase();
  const tagged = input.nachrichten.filter(
    (n) =>
      n.postfach.toLowerCase() === zielPostfach &&
      graphNachrichtHatKategorie(n, MICROSOFT_ABLEGEN_KATEGORIE),
  );

  let verarbeitet = 0;
  let fehlgeschlagen = 0;

  for (const n of tagged) {
    const rows = await leseEintraegeFuerNachricht(n.postfach, n.id);
    const kandidaten = rows.filter(
      (r) => r.status === "analysiert" && r.dokument_typ !== "expose",
    );

    for (const row of kandidaten) {
      try {
        await dokumentPosteingangSchnellAusfuehren({
          supabaseAccessToken: input.supabaseAccessToken,
          eintragId: row.id,
        });
        verarbeitet += 1;
      } catch (err) {
        fehlgeschlagen += 1;
        console.error(
          "[dokument-postfach] Auto-Ablegen (Kategorie ablegen)",
          row.id,
          err,
        );
      }
    }
  }

  return { verarbeitet, fehlgeschlagen };
}
