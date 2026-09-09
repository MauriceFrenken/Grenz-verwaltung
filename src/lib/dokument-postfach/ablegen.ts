/**
 * Dokument aus Postfach in OneDrive ablegen und ggf. Mail in
 * Gesellschafts-Unterordner verschieben. Server-only.
 */
import type { DokumentAnalyseFelder } from "@/lib/dokument-ai";
import { microsoftAnhangNachOneDriveAblegen } from "@/lib/microsoft/ablage";
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { baueAblageDateiname } from "./dateiname";
import { schliesseNachrichtAbWennFertig } from "./mail-abschluss";
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
  if (row.status === "abgelegt" || row.status === "gebucht") {
    throw new Error("Dieses Dokument wurde bereits abgelegt.");
  }
  if (!row.anhang_id?.trim()) {
    throw new Error("Zu diesem Eintrag ist kein Anhang gespeichert.");
  }

  const felder = input.felder ?? row.felder;
  if (!felder) {
    throw new Error("Keine Felddaten zum Speichern vorhanden.");
  }

  const gesellschaftId = input.gesellschaftId ?? row.gesellschaft_id;
  const objektId = input.objektId ?? row.objekt_id;

  const gsName =
    felder.gesellschaftName?.value?.trim() ||
    null;
  if (!gesellschaftId && !gsName) {
    throw new Error("Bitte zuerst eine Gesellschaft zuordnen.");
  }

  const dokumentTyp =
    input.istRechnung || row.ist_rechnung || row.dokument_typ === "rechnung"
      ? "rechnung"
      : row.dokument_typ === "expose"
        ? "expose"
        : "dokument";

  const dateiname = baueAblageDateiname({
    felder,
    dokumentTyp,
    originalName: row.anhang_name,
    betreff: row.betreff,
  });

  await speicherePruefung(id, {
    felder,
    gesellschaftId,
    objektId,
    ablageOrdnerId: ordnerId,
    ablageOrdnerPfad: input.ordnerPfad.trim(),
    istRechnung: input.istRechnung ?? row.ist_rechnung ?? false,
  });

  const ergebnis = await microsoftAnhangNachOneDriveAblegen({
    supabaseAccessToken: input.supabaseAccessToken,
    nachrichtId: row.graph_nachricht_id,
    anhangId: row.anhang_id,
    postfach: row.postfach,
    parentItemId: ordnerId,
    dateiname,
  });

  const hochgeladen = ergebnis.hochgeladen;

  await markiereAbgelegt(id, {
    onedriveId: hochgeladen.id,
    ordnerPfad: input.ordnerPfad.trim(),
    ordnerId,
    felder,
    gesellschaftId,
    objektId,
    ablageDateiname: dateiname,
  });

  const aktualisiert = await leseEintrag(id);
  const abschluss = await schliesseNachrichtAbWennFertig({
    postfach: row.postfach,
    graphNachrichtId: row.graph_nachricht_id,
    bevorzugterEintrag: aktualisiert,
  });

  return {
    abgelegt: true,
    onedriveId: hochgeladen.id,
    ordnerPfad: input.ordnerPfad.trim(),
    ...abschluss,
  };
}
