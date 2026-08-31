/**
 * KI-Vorschlag direkt ausführen (Ablegen / Buchen). Server-only.
 */
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { dokumentPosteingangAblegen } from "./ablegen";
import { leseEintrag } from "./store";

export type DokumentSchnellAusfuehrenErgebnis =
  | { aktion: "abgelegt"; ordnerPfad: string }
  | { aktion: "buchen"; platzhalter: true };

export async function dokumentPosteingangSchnellAusfuehren(input: {
  supabaseAccessToken: string;
  eintragId: string;
}): Promise<DokumentSchnellAusfuehrenErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");

  const row = await leseEintrag(id);
  if (row.status !== "analysiert") {
    throw new Error("Nur analysierte Einträge können direkt ausgeführt werden.");
  }

  if (row.ist_rechnung) {
    return { aktion: "buchen", platzhalter: true };
  }

  if (!row.ablage_ordner_id?.trim() || !row.ablage_ordner_pfad?.trim()) {
    throw new Error(
      "Kein Zielordner von der KI ermittelt — bitte zuerst per Check prüfen.",
    );
  }

  const ergebnis = await dokumentPosteingangAblegen({
    supabaseAccessToken: input.supabaseAccessToken,
    eintragId: id,
    ordnerItemId: row.ablage_ordner_id,
    ordnerPfad: row.ablage_ordner_pfad,
    gesellschaftId: row.gesellschaft_id,
    objektId: row.objekt_id,
    felder: row.felder,
    istRechnung: false,
  });

  return { aktion: "abgelegt", ordnerPfad: ergebnis.ordnerPfad };
}
