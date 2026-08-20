/**
 * Nach dem Salesforce-Export: Eintrag als exportiert vermerken und die Mail in
 * den Unterordner „abgelegt“ verschieben. Server-only.
 */
import {
  graphNachrichtVerschieben,
  graphPosteingangUnterordner,
} from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { leseEintrag, markiereAbgelegt, markiereExportiert } from "./store";
import { ABGELEGT_ORDNER, type PostfachExportErgebnis } from "./typen";

export async function postfachExportAbschliessen(input: {
  supabaseAccessToken: string;
  eintragId: string;
  realEstateId?: string | null;
  transaktionId?: string | null;
}): Promise<PostfachExportErgebnis> {
  const caller = await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");

  const row = await leseEintrag(id);
  await markiereExportiert(id, {
    realEstateId: input.realEstateId?.trim() || null,
    transaktionId: input.transaktionId?.trim() || null,
    nutzerId: caller.userId,
  });

  if (row.abgelegt_am) {
    return { abgelegt: true, ordner: row.abgelegt_ordner ?? ABGELEGT_ORDNER };
  }

  // Salesforce hat die Daten bereits — ein Fehler beim Verschieben darf den
  // Export nicht als gescheitert darstellen.
  try {
    const { accessToken } = await microsoftAccessToken();
    const ordnerId = await graphPosteingangUnterordner(
      accessToken,
      row.postfach,
      ABGELEGT_ORDNER,
    );
    const neueId = await graphNachrichtVerschieben(
      accessToken,
      row.postfach,
      row.graph_nachricht_id,
      ordnerId,
    );
    await markiereAbgelegt(id, ABGELEGT_ORDNER, neueId);
    return { abgelegt: true, ordner: ABGELEGT_ORDNER };
  } catch (err) {
    return {
      abgelegt: false,
      ordner: ABGELEGT_ORDNER,
      fehler: err instanceof Error ? err.message : String(err),
    };
  }
}
