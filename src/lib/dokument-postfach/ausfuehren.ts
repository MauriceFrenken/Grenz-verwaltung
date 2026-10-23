/**
 * KI-Vorschlag direkt ausführen (Ablegen / DATEV). Server-only.
 */
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { dokumentPosteingangAblegen } from "./ablegen";
import { dokumentPosteingangBuchen } from "./buchen";
import { leseEintrag } from "./store";
import type { DokumentAblegenErgebnis, DokumentBuchenErgebnis } from "./typen";

export type DokumentSchnellAusfuehrenErgebnis =
  | ({ aktion: "abgelegt" } & DokumentAblegenErgebnis)
  | ({ aktion: "gebucht" } & DokumentBuchenErgebnis);

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

  if (row.dokument_typ === "expose") {
    throw new Error("Exposés bitte über „Zu Exposés“ verschieben.");
  }

  if (row.ist_rechnung || row.dokument_typ === "rechnung") {
    const ergebnis = await dokumentPosteingangBuchen({
      supabaseAccessToken: input.supabaseAccessToken,
      eintragId: id,
      gesellschaftId: row.gesellschaft_id,
      felder: row.felder,
    });
    return { aktion: "gebucht", ...ergebnis };
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
    felder: row.felder,
    istRechnung: false,
  });

  return { aktion: "abgelegt", ...ergebnis };
}
