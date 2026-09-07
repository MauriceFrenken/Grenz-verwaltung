/**
 * TradeAnyMachine: OneDrive-Ablage + Weiterleitung an mail@sellanymachine.com
 * + Mail in Unterordner „TradeAnyMachine GmbH“ wenn alle Anhänge erledigt.
 */
import type { DokumentAnalyseFelder } from "@/lib/dokument-ai";
import {
  findeEingangsrechnungenOrdner,
  findeGesellschaftRootDeterministisch,
} from "./ablage-kontext";
import {
  istAblageRootOrdner,
  microsoftAnhangNachOneDriveAblegen,
  microsoftOneDriveUser,
} from "@/lib/microsoft/ablage";
import {
  graphAnhangAlsMailSenden,
  graphAnhangBinary,
  graphDriveRootKinder,
} from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";
import {
  istTamAusFeldern,
  TRADE_ANY_MACHINE_MAIL,
  TRADE_ANY_MACHINE_NAME,
} from "@/lib/trade-any-machine";

import { schliesseNachrichtAbWennFertig } from "./mail-abschluss";
import { leseEintrag, markiereAbgelegt, speicherePruefung } from "./store";
import type { DokumentTamErgebnis } from "./typen";

async function loeseTamZielordner(input: {
  accessToken: string;
  ordnerItemId?: string | null;
  ordnerPfad?: string | null;
  istRechnung: boolean;
}): Promise<{ id: string; pfad: string }> {
  const gegebenId = input.ordnerItemId?.trim();
  const gegebenPfad = input.ordnerPfad?.trim();
  if (gegebenId && gegebenPfad) {
    return { id: gegebenId, pfad: gegebenPfad };
  }

  if (input.istRechnung) {
    const ziel = await findeEingangsrechnungenOrdner(
      input.accessToken,
      TRADE_ANY_MACHINE_NAME,
    );
    if (ziel) return ziel;
  }

  const benutzer = microsoftOneDriveUser();
  const root = await graphDriveRootKinder(input.accessToken, benutzer);
  const kandidaten = root.filter(
    (item) => item.istOrdner && istAblageRootOrdner(item.name),
  );
  const treffer = findeGesellschaftRootDeterministisch(
    kandidaten,
    TRADE_ANY_MACHINE_NAME,
  );
  if (!treffer) {
    throw new Error(
      `OneDrive-Ordner für ${TRADE_ANY_MACHINE_NAME} wurde nicht gefunden.`,
    );
  }
  return { id: treffer.id, pfad: treffer.name };
}

export async function dokumentPosteingangZuTam(input: {
  supabaseAccessToken: string;
  eintragId: string;
  ordnerItemId?: string | null;
  ordnerPfad?: string | null;
  felder?: DokumentAnalyseFelder | null;
}): Promise<DokumentTamErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");

  const row = await leseEintrag(id);
  if (row.status === "abgelegt" || row.status === "gebucht") {
    throw new Error("Dieser Eintrag wurde bereits verarbeitet.");
  }
  if (row.status !== "analysiert") {
    throw new Error("Nur analysierte Einträge können zu TAM weitergeleitet werden.");
  }
  if (!row.anhang_id?.trim()) {
    throw new Error("Zu diesem Eintrag ist kein Anhang gespeichert.");
  }

  const felder = input.felder ?? row.felder;
  if (!felder) {
    throw new Error("Keine Felddaten zum Speichern vorhanden.");
  }
  if (!istTamAusFeldern(felder)) {
    throw new Error("Dieser Eintrag ist nicht der TradeAnyMachine GmbH zugeordnet.");
  }

  felder.gesellschaftName = {
    ...felder.gesellschaftName,
    value: TRADE_ANY_MACHINE_NAME,
  };

  const istRechnung =
    row.ist_rechnung === true || row.dokument_typ === "rechnung";

  const { accessToken } = await microsoftAccessToken();
  const ziel = await loeseTamZielordner({
    accessToken,
    ordnerItemId: input.ordnerItemId ?? row.ablage_ordner_id,
    ordnerPfad: input.ordnerPfad ?? row.ablage_ordner_pfad,
    istRechnung,
  });

  await speicherePruefung(id, {
    felder,
    gesellschaftId: null,
    objektId: null,
    ablageOrdnerId: ziel.id,
    ablageOrdnerPfad: ziel.pfad,
    istRechnung,
  });

  const ergebnis = await microsoftAnhangNachOneDriveAblegen({
    supabaseAccessToken: input.supabaseAccessToken,
    nachrichtId: row.graph_nachricht_id,
    anhangId: row.anhang_id,
    postfach: row.postfach,
    parentItemId: ziel.id,
  });

  const binary = await graphAnhangBinary(
    accessToken,
    row.postfach,
    row.graph_nachricht_id,
    row.anhang_id,
  );

  await graphAnhangAlsMailSenden(accessToken, row.postfach, {
    an: TRADE_ANY_MACHINE_MAIL,
    betreff: row.betreff?.trim() || binary.name || TRADE_ANY_MACHINE_NAME,
    text: "",
    dateiname: binary.name || row.anhang_name || "Dokument.pdf",
    contentType: binary.contentType ?? row.anhang_content_type,
    bytes: binary.bytes,
  });

  await markiereAbgelegt(id, {
    onedriveId: ergebnis.hochgeladen.id,
    ordnerPfad: ziel.pfad,
    ordnerId: ziel.id,
    felder,
    gesellschaftId: null,
    objektId: null,
  });

  const aktualisiert = await leseEintrag(id);
  const abschluss = await schliesseNachrichtAbWennFertig({
    postfach: row.postfach,
    graphNachrichtId: row.graph_nachricht_id,
    bevorzugterEintrag: aktualisiert,
  });

  return {
    abgelegt: true,
    onedriveId: ergebnis.hochgeladen.id,
    ordnerPfad: ziel.pfad,
    weitergeleitetAn: TRADE_ANY_MACHINE_MAIL,
    ...abschluss,
  };
}
