/**
 * Mail aus Dokument-Postfach zu anderem Postfach verschieben. Server-only.
 */
import { MICROSOFT_DEFAULT_MAILBOX } from "@/lib/microsoft/config";
import {
  graphNachrichtKopieren,
  graphNachrichtLoeschen,
  graphPosteingangOrdnerId,
} from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { leseEintrag, loescheEintrag } from "./store";

export async function dokumentPosteingangZuExposesVerschieben(input: {
  supabaseAccessToken: string;
  eintragId: string;
}): Promise<{ zielPostfach: string }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");

  const row = await leseEintrag(id);
  const zielPostfach = MICROSOFT_DEFAULT_MAILBOX;

  const { accessToken } = await microsoftAccessToken();
  const zielOrdnerId = await graphPosteingangOrdnerId(accessToken, zielPostfach);

  await graphNachrichtKopieren(
    accessToken,
    row.postfach,
    row.graph_nachricht_id,
    zielOrdnerId,
  );

  await graphNachrichtLoeschen(
    accessToken,
    row.postfach,
    row.graph_nachricht_id,
  );

  await loescheEintrag(id);

  return { zielPostfach };
}
