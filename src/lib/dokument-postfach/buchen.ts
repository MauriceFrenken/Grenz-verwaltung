/**
 * Rechnung: OneDrive (Eingangsrechnungen) + Weiterleitung an DATEV-Postfach
 * + Mail in Gesellschafts-Unterordner wenn alle Anhänge erledigt. Server-only.
 */
import type { DokumentAnalyseFelder } from "@/lib/dokument-ai";
import { findeEingangsrechnungenOrdner } from "./ablage-kontext";
import { baueAblageDateiname } from "./dateiname";
import { microsoftAnhangNachOneDriveAblegen } from "@/lib/microsoft/ablage";
import { graphAnhangAlsMailSenden, graphAnhangBinary } from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";

import { schliesseNachrichtAbWennFertig } from "./mail-abschluss";
import { merkeRechnungInHistorie } from "./rechnung-historie";
import {
  leseEintrag,
  markiereGebucht,
  speicherePruefung,
} from "./store";
import type { DokumentBuchenErgebnis } from "./typen";

async function ladeDatevUndName(gesellschaftId: string): Promise<{
  datevPostfach: string;
  name: string;
}> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("v_gesellschaften")
    .select("name,datev_postfach")
    .eq("id", gesellschaftId)
    .maybeSingle();

  if (error) {
    throw new Error(`Gesellschaft konnte nicht geladen werden: ${error.message}`);
  }
  if (!data) throw new Error("Gesellschaft nicht gefunden.");

  const datev = (data.datev_postfach as string | null)?.trim() ?? "";
  if (!datev) {
    throw new Error(
      "Für diese Gesellschaft ist kein DATEV-Postfach hinterlegt (Verwaltung › Gesellschaften).",
    );
  }
  return {
    datevPostfach: datev,
    name: String(data.name ?? "").trim() || "Gesellschaft",
  };
}

export async function dokumentPosteingangBuchen(input: {
  supabaseAccessToken: string;
  eintragId: string;
  /** Ignoriert — Rechnungen landen immer in Eingangsrechnungen. */
  ordnerItemId?: string | null;
  ordnerPfad?: string | null;
  gesellschaftId?: string | null;
  objektId?: string | null;
  felder?: DokumentAnalyseFelder | null;
}): Promise<DokumentBuchenErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");

  const row = await leseEintrag(id);
  if (row.status === "abgelegt" || row.status === "gebucht") {
    throw new Error("Diese Rechnung wurde bereits verarbeitet.");
  }
  if (!row.anhang_id?.trim()) {
    throw new Error("Zu diesem Eintrag ist kein Anhang gespeichert.");
  }

  const gesellschaftId = (input.gesellschaftId ?? row.gesellschaft_id)?.trim() || null;
  if (!gesellschaftId) {
    throw new Error("Bitte zuerst eine Gesellschaft zuordnen.");
  }

  const { datevPostfach, name: gesellschaftName } =
    await ladeDatevUndName(gesellschaftId);

  const felder = input.felder ?? row.felder;
  if (!felder) {
    throw new Error("Keine Felddaten zum Speichern vorhanden.");
  }

  const objektId = input.objektId ?? row.objekt_id;

  const { accessToken } = await microsoftAccessToken();

  // Immer frisch auflösen — nie gespeicherte/manuelle Ordner (Ausgangsrechnungen etc.)
  const ziel = await findeEingangsrechnungenOrdner(accessToken, gesellschaftName);
  if (!ziel) {
    throw new Error(
      `Eingangsrechnungen-Ordner für „${gesellschaftName}“ wurde nicht gefunden.`,
    );
  }
  const ordnerId = ziel.id;
  const ordnerPfad = ziel.pfad;

  const dateiname = baueAblageDateiname({
    felder,
    dokumentTyp: "rechnung",
    originalName: row.anhang_name,
    betreff: row.betreff,
  });

  await speicherePruefung(id, {
    felder,
    gesellschaftId,
    objektId,
    ablageOrdnerId: ordnerId,
    ablageOrdnerPfad: ordnerPfad,
    istRechnung: true,
  });

  const ergebnis = await microsoftAnhangNachOneDriveAblegen({
    supabaseAccessToken: input.supabaseAccessToken,
    nachrichtId: row.graph_nachricht_id,
    anhangId: row.anhang_id,
    postfach: row.postfach,
    parentItemId: ordnerId,
    dateiname,
  });

  const binary = await graphAnhangBinary(
    accessToken,
    row.postfach,
    row.graph_nachricht_id,
    row.anhang_id,
  );

  await graphAnhangAlsMailSenden(accessToken, row.postfach, {
    an: datevPostfach,
    betreff: row.betreff?.trim() || dateiname || "Rechnung",
    text: "",
    dateiname,
    contentType: binary.contentType ?? row.anhang_content_type,
    bytes: binary.bytes,
  });

  await markiereGebucht(id, {
    onedriveId: ergebnis.hochgeladen.id,
    ordnerPfad,
    ordnerId,
    felder,
    gesellschaftId,
    objektId,
    ablageDateiname: dateiname,
  });

  // Vor dem Mail-Abschluss merken — dabei wird der Eintrag ggf. gelöscht.
  const historie = await merkeRechnungInHistorie({
    eintragId: id,
    felder,
    gesellschaftId,
    gesellschaftName,
    betreff: row.betreff,
    anhangName: row.anhang_name,
    ablageDateiname: dateiname,
    ordnerPfad,
  });

  const aktualisiert = await leseEintrag(id);
  const abschluss = await schliesseNachrichtAbWennFertig({
    postfach: row.postfach,
    graphNachrichtId: row.graph_nachricht_id,
    bevorzugterEintrag: aktualisiert,
  });

  return {
    gebucht: true,
    onedriveId: ergebnis.hochgeladen.id,
    ordnerPfad,
    datevPostfach,
    historie,
    ...abschluss,
  };
}
