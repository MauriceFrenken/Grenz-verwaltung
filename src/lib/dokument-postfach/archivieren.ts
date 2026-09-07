/**
 * Mail aus dem Posteingang in den Ordner „Archiv“ des jeweiligen Postfachs
 * verschieben und aus dem Dokument-Postfach entfernen. Server-only.
 */
import {
  graphNachrichtVerschieben,
  graphPosteingangUnterordner,
} from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { leseEintrag, loescheEintraegeFuerNachricht } from "./store";
import { ARCHIV_ORDNER } from "./typen";

export async function dokumentPosteingangArchivieren(input: {
  supabaseAccessToken: string;
  eintragId: string;
}): Promise<{ postfach: string; graphNachrichtId: string; ordner: string }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");

  const row = await leseEintrag(id);
  const { accessToken } = await microsoftAccessToken();

  const ordnerId = await graphPosteingangUnterordner(
    accessToken,
    row.postfach,
    ARCHIV_ORDNER,
  );

  await graphNachrichtVerschieben(
    accessToken,
    row.postfach,
    row.graph_nachricht_id,
    ordnerId,
  );

  await loescheEintraegeFuerNachricht(row.postfach, row.graph_nachricht_id);

  return {
    postfach: row.postfach,
    graphNachrichtId: row.graph_nachricht_id,
    ordner: ARCHIV_ORDNER,
  };
}
