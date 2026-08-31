/**
 * Dokument-Postfach synchronisieren und KI-Analyse. Server-only.
 */
import { handleAnalyzeDokumentRequest } from "@/lib/dokument-ai";
import { graphAnhangBinary } from "@/lib/microsoft/graph";
import {
  microsoftDokumentPosteingangLesen,
} from "@/lib/microsoft/ablage";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { microsoftCallerAusJwt, createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

import { extrahierePdfText } from "../postfach/pdf-text";
import {
  findeGesellschaftId,
  findeObjektId,
  ladeOnedriveKontext,
  ladeStammdatenKontext,
  loeseOrdnerPfad,
} from "./ablage-kontext";
import {
  eintraegeAnlegen,
  leseEintrag,
  leseEintraege,
  naechsteOffeneMail,
  speichereAnalyse,
  speichereAnalyseFehler,
  setzeStatusNeu,
  zaehleOffene,
  zuEintrag,
  type DokumentPosteingangRow,
} from "./store";
import type { DokumentPosteingangSyncErgebnis } from "./typen";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

function fehlerText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function analysiereEintrag(
  accessToken: string,
  row: DokumentPosteingangRow,
): Promise<void> {
  try {
    if (!row.anhang_id) {
      throw new Error("Kein PDF-Anhang an der Mail gefunden.");
    }

    const anhang = await graphAnhangBinary(
      accessToken,
      row.postfach,
      row.graph_nachricht_id,
      row.anhang_id,
    );
    const bytes = anhang.bytes;
    if (bytes.byteLength === 0) {
      throw new Error("Der Anhang enthält keine Daten.");
    }
    if (bytes.byteLength > MAX_PDF_BYTES) {
      throw new Error("PDF ist größer als 25 MB und wurde nicht analysiert.");
    }

    const pdf = await extrahierePdfText(bytes);
    if (!pdf.modelContext.trim()) {
      throw new Error(
        "Aus dem PDF ließ sich kein Text lesen (vermutlich ein Scan ohne Texterkennung).",
      );
    }

    const [stammdatenKontext, onedriveKontext] = await Promise.all([
      ladeStammdatenKontext(),
      ladeOnedriveKontext(accessToken),
    ]);

    const ergebnis = await handleAnalyzeDokumentRequest({
      documentTitle: row.anhang_name ?? "Dokument",
      modelContext: pdf.modelContext,
      stammdatenKontext,
      onedriveKontext,
    });

    const admin = createServiceRoleClient();
    const [{ data: gesellschaften }, { data: objekte }] = await Promise.all([
      admin.from("v_gesellschaften").select("id,name,kuerzel"),
      admin
        .from("v_objekte")
        .select("id,bezeichnung,gesellschaft_id,strasse,ort"),
    ]);

    const gesellschaftId = findeGesellschaftId(
      ergebnis.felder.gesellschaftName.value,
      gesellschaften ?? [],
    );
    const objektId = findeObjektId(
      ergebnis.felder.objektBezeichnung.value,
      gesellschaftId,
      objekte ?? [],
    );

    let ablageOrdnerId: string | null = null;
    let ablageOrdnerPfad: string | null =
      ergebnis.felder.ordnerPfad.value?.trim() || null;

    if (ablageOrdnerPfad) {
      const aufgeloest = await loeseOrdnerPfad(accessToken, ablageOrdnerPfad);
      if (aufgeloest) {
        ablageOrdnerId = aufgeloest.id;
        ablageOrdnerPfad = aufgeloest.pfad;
      }
    }

    await speichereAnalyse(row.id, {
      istRechnung: ergebnis.istRechnung,
      felder: ergebnis.felder,
      gesellschaftId,
      objektId,
      ablageOrdnerId,
      ablageOrdnerPfad,
    });
  } catch (err) {
    await speichereAnalyseFehler(row.id, fehlerText(err));
  }
}

export async function dokumentPosteingangAnalyseWiederholen(input: {
  supabaseAccessToken: string;
  eintragId: string;
}): Promise<ReturnType<typeof zuEintrag>> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const { accessToken } = await microsoftAccessToken();

  const row = await leseEintrag(input.eintragId);
  if (row.status !== "fehler") {
    throw new Error("Nur fehlgeschlagene Analysen können wiederholt werden.");
  }

  await setzeStatusNeu(row.id);
  const neu = await leseEintrag(row.id);
  await analysiereEintrag(accessToken, neu);
  return zuEintrag(await leseEintrag(row.id));
}

export async function dokumentPosteingangSynchronisieren(input: {
  supabaseAccessToken: string;
  maxAnalysen?: number;
}): Promise<DokumentPosteingangSyncErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const maxAnalysen = Math.max(0, Math.min(input.maxAnalysen ?? 1, 1));

  if (maxAnalysen > 0) {
    const { accessToken } = await microsoftAccessToken();
    const offen = await naechsteOffeneMail();
    let aktualisiert: ReturnType<typeof zuEintrag>[] = [];
    if (offen) {
      await analysiereEintrag(accessToken, offen);
      aktualisiert = [zuEintrag(await leseEintrag(offen.id))];
    }

    return {
      postfaecher: [],
      nachrichten: [],
      eintraege: aktualisiert,
      offen: await zaehleOffene(),
    };
  }

  const { postfaecher, nachrichten } = await microsoftDokumentPosteingangLesen({
    supabaseAccessToken: input.supabaseAccessToken,
    anzahl: 50,
  });

  await eintraegeAnlegen(nachrichten);

  const rows = await leseEintraege(
    nachrichten.map((n) => ({ postfach: n.postfach, id: n.id })),
  );

  return {
    postfaecher,
    nachrichten,
    eintraege: rows.map(zuEintrag),
    offen: await zaehleOffene(),
  };
}
