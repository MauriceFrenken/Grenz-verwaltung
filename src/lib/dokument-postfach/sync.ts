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

import {
  istTamAusFeldern,
  istTamGesellschaft,
  TRADE_ANY_MACHINE_NAME,
} from "@/lib/trade-any-machine";

import { baueAnhangAnalyseKontext } from "./anhang-kontext";
import {
  ermittleZielordnerIterativ,
  findeGesellschaftId,
  findeObjektIdAusKontext,
  ladeStammdatenKontext,
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

const MAX_ANHANG_BYTES = 25 * 1024 * 1024;

function fehlerText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function analysiereEintrag(
  accessToken: string,
  row: DokumentPosteingangRow,
): Promise<void> {
  try {
    if (!row.anhang_id) {
      throw new Error("Kein Anhang an der Mail gefunden.");
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
    if (bytes.byteLength > MAX_ANHANG_BYTES) {
      throw new Error("Anhang ist größer als 25 MB und wurde nicht analysiert.");
    }

    const kontext = await baueAnhangAnalyseKontext({
      name: anhang.name || row.anhang_name || "Dokument",
      contentType: anhang.contentType ?? row.anhang_content_type,
      bytes,
      mail: {
        betreff: row.betreff,
        absenderName: row.absender_name,
        absenderMail: row.absender_mail,
        emailText: row.email_text,
      },
    });

    const stammdatenKontext = await ladeStammdatenKontext();

    const ergebnis = await handleAnalyzeDokumentRequest({
      documentTitle: kontext.titel,
      mailKontext: kontext.mailKontext,
      modelContext: kontext.modelContext,
      vision: kontext.vision,
      stammdatenKontext,
    });

    ergebnis.felder.ordnerPfad = {
      ...ergebnis.felder.ordnerPfad,
      value: null,
    };

    const admin = createServiceRoleClient();
    const [{ data: gesellschaften }, { data: objekte }] = await Promise.all([
      admin.from("v_gesellschaften").select("id,name,kuerzel"),
      admin
        .from("v_objekte")
        .select("id,bezeichnung,gesellschaft_id,strasse,ort"),
    ]);

    ergebnis.felder.objektBezeichnung = {
      ...ergebnis.felder.objektBezeichnung,
      value: null,
    };

    const istTam = istTamAusFeldern(ergebnis.felder);

    if (istTam) {
      ergebnis.felder.gesellschaftName = {
        ...ergebnis.felder.gesellschaftName,
        value: TRADE_ANY_MACHINE_NAME,
      };
      ergebnis.felder.objektBezeichnung = {
        ...ergebnis.felder.objektBezeichnung,
        value: null,
      };
    }

    const gesellschaftId = istTam
      ? null
      : findeGesellschaftId(
          ergebnis.felder.gesellschaftName.value,
          gesellschaften ?? [],
        );

    let objektId: string | null = null;
    if (gesellschaftId && ergebnis.dokumentTyp !== "expose" && !istTam) {
      objektId = findeObjektIdAusKontext(
        [kontext.modelContext, kontext.mailKontext],
        gesellschaftId,
        objekte ?? [],
      );
    }

    const gematchtesObjekt =
      objekte?.find((o) => o.id === objektId) ?? null;

    const gesellschaftName =
      gesellschaften?.find((g) => g.id === gesellschaftId)?.name ??
      ergebnis.felder.gesellschaftName.value ??
      "";

    if (gematchtesObjekt) {
      ergebnis.felder.gesellschaftName = {
        ...ergebnis.felder.gesellschaftName,
        value:
          gesellschaften?.find((g) => g.id === gematchtesObjekt.gesellschaft_id)
            ?.name ?? ergebnis.felder.gesellschaftName.value,
      };
      ergebnis.felder.objektBezeichnung = {
        ...ergebnis.felder.objektBezeichnung,
        value: gematchtesObjekt.bezeichnung,
      };
    }

    let ablageOrdnerId: string | null = null;
    let ablageOrdnerPfad: string | null = null;

    if (
      !istTam &&
      ergebnis.dokumentTyp !== "expose" &&
      gesellschaftId &&
      gesellschaftName &&
      !istTamGesellschaft(gesellschaftName)
    ) {
      const ziel = await ermittleZielordnerIterativ(
        accessToken,
        {
          gesellschaftId,
          gesellschaftName,
          objektBezeichnung: gematchtesObjekt?.bezeichnung ?? null,
          dokumentTyp: ergebnis.dokumentTyp,
          documentTitle: kontext.titel,
          mailKontext: kontext.mailKontext,
          modelContext: kontext.modelContext,
        },
        gesellschaften ?? [],
      );
      if (ziel) {
        ablageOrdnerId = ziel.id;
        ablageOrdnerPfad = ziel.pfad;
        ergebnis.felder.ordnerPfad = {
          ...ergebnis.felder.ordnerPfad,
          value: ziel.pfad,
        };
      }
    }

    await speichereAnalyse(row.id, {
      dokumentTyp: ergebnis.dokumentTyp,
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
  if (row.status !== "fehler" && row.status !== "analysiert") {
    throw new Error(
      "Nur analysierte oder fehlgeschlagene Einträge können erneut analysiert werden.",
    );
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
