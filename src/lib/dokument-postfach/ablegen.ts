/**
 * Dokument aus Postfach in OneDrive ablegen. Server-only.
 */
import type { DokumentAnalyseFelder } from "@/lib/dokument-ai";
import { microsoftAnhaengeNachOneDriveAblegen } from "@/lib/microsoft/ablage";
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { leseEintrag, markiereAbgelegt, speicherePruefung } from "./store";
import type { DokumentAblegenErgebnis } from "./typen";

export async function dokumentPosteingangAblegen(input: {
  supabaseAccessToken: string;
  eintragId: string;
  ordnerItemId: string;
  ordnerPfad: string;
  gesellschaftId?: string | null;
  objektId?: string | null;
  felder?: DokumentAnalyseFelder | null;
  istRechnung?: boolean;
}): Promise<DokumentAblegenErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  const ordnerId = input.ordnerItemId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");
  if (!ordnerId) throw new Error("Zielordner ist erforderlich.");

  const row = await leseEintrag(id);
  if (row.status === "abgelegt") {
    throw new Error("Dieses Dokument wurde bereits abgelegt.");
  }

  const felder = input.felder ?? row.felder;
  if (!felder) {
    throw new Error("Keine Felddaten zum Speichern vorhanden.");
  }

  await speicherePruefung(id, {
      felder,
      gesellschaftId: input.gesellschaftId ?? row.gesellschaft_id,
      objektId: input.objektId ?? row.objekt_id,
      ablageOrdnerId: ordnerId,
      ablageOrdnerPfad: input.ordnerPfad.trim(),
      istRechnung: input.istRechnung ?? row.ist_rechnung ?? false,
  });

  const ergebnis = await microsoftAnhaengeNachOneDriveAblegen({
    supabaseAccessToken: input.supabaseAccessToken,
    nachrichtId: row.graph_nachricht_id,
    postfach: row.postfach,
    parentItemId: ordnerId,
  });

  const hochgeladen = ergebnis.hochgeladen[0];
  if (!hochgeladen) {
    throw new Error("Datei konnte nicht hochgeladen werden.");
  }

  await markiereAbgelegt(id, {
    onedriveId: hochgeladen.id,
    ordnerPfad: input.ordnerPfad.trim(),
    ordnerId,
    felder,
    gesellschaftId: input.gesellschaftId ?? row.gesellschaft_id,
    objektId: input.objektId ?? row.objekt_id,
  });

  return {
    abgelegt: true,
    onedriveId: hochgeladen.id,
    ordnerPfad: input.ordnerPfad.trim(),
  };
}
