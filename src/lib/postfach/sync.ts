/**
 * Posteingang abgleichen und neue Exposé-PDFs mit derselben KI analysieren wie
 * beim manuellen Exposé-Import. Server-only.
 *
 * Analysen laufen strikt nacheinander (eine Mail nach der anderen), damit Graph
 * und Anthropic nicht parallel überlastet werden.
 */
import { handleAnalyzeExposeRequest } from "@/lib/expose-ai";
import {
  graphAnhangBinary,
  graphPosteingangNachrichten,
} from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import {
  createServiceRoleClient,
  microsoftCallerAusJwt,
} from "@/lib/microsoft/supabase-admin";
import { microsoftPostfach } from "@/lib/microsoft/token-exchange";

import { extrahierePdfText } from "./pdf-text";
import {
  eintraegeAnlegen,
  leseEintrag,
  leseEintraege,
  speichereAnalyse,
  speichereAnalyseFehler,
  zuEintrag,
  type PostfachEintragRow,
} from "./store";
import type { PostfachSyncErgebnis } from "./typen";

const MAX_NACHRICHTEN = 50;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

const SPALTEN =
  "id,postfach,graph_nachricht_id,internet_message_id,betreff,absender_name," +
  "absender_mail,eingegangen_am,web_link,anhang_id,anhang_name,anhang_content_type," +
  "anhang_groesse,status,felder,analyse_fehler,analysiert_am," +
  "salesforce_real_estate_id,salesforce_transaktion_id,exportiert_am," +
  "abgelegt_am,abgelegt_ordner";

function fehlerText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function analysiereEintrag(
  accessToken: string,
  postfach: string,
  row: PostfachEintragRow,
): Promise<void> {
  try {
    if (!row.anhang_id) {
      throw new Error("Kein PDF-Anhang an der Mail gefunden.");
    }

    const anhang = await graphAnhangBinary(
      accessToken,
      postfach,
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

    const ergebnis = await handleAnalyzeExposeRequest({
      documentTitle: row.anhang_name ?? "Exposé",
      modelContext: pdf.modelContext,
    });

    await speichereAnalyse(row.id, ergebnis.fields);
  } catch (err) {
    await speichereAnalyseFehler(row.id, fehlerText(err));
  }
}

/** Nächste noch nicht analysierte Mail (älteste zuerst). */
async function naechsteOffeneMail(
  postfach: string,
): Promise<PostfachEintragRow | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("postfach_exposes")
    .select(SPALTEN)
    .eq("postfach", postfach)
    .eq("status", "neu")
    .order("eingegangen_am", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Offene Postfach-Mails konnten nicht gelesen werden: ${error.message}`,
    );
  }
  return (data as PostfachEintragRow | null) ?? null;
}

async function zaehleOffene(postfach: string): Promise<number> {
  const admin = createServiceRoleClient();
  const { count, error } = await admin
    .from("postfach_exposes")
    .select("id", { count: "exact", head: true })
    .eq("postfach", postfach)
    .eq("status", "neu");

  if (error) {
    throw new Error(
      `Offene Postfach-Mails konnten nicht gezählt werden: ${error.message}`,
    );
  }
  return count ?? 0;
}

/**
 * @param maxAnalysen 0 = nur Posteingang listen (kein KI).
 *                    1 = genau eine offene Mail analysieren (ohne erneut den
 *                        gesamten Posteingang von Graph zu laden).
 */
/** KI-Analyse für einen fehlgeschlagenen Postfach-Eintrag erneut ausführen. */
export async function postfachAnalyseWiederholen(input: {
  supabaseAccessToken: string;
  eintragId: string;
}): Promise<ReturnType<typeof zuEintrag>> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const { accessToken } = await microsoftAccessToken();
  const postfach = microsoftPostfach();

  const row = await leseEintrag(input.eintragId);
  if (row.postfach !== postfach) {
    throw new Error("Postfach-Eintrag nicht gefunden.");
  }
  if (row.status !== "fehler") {
    throw new Error("Nur fehlgeschlagene Analysen können wiederholt werden.");
  }

  await analysiereEintrag(accessToken, postfach, row);
  return zuEintrag(await leseEintrag(input.eintragId));
}

export async function postfachSynchronisieren(input: {
  supabaseAccessToken: string;
  maxAnalysen?: number;
}): Promise<PostfachSyncErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const { accessToken } = await microsoftAccessToken();
  const postfach = microsoftPostfach();

  const maxAnalysen = Math.max(0, Math.min(input.maxAnalysen ?? 1, 1));

  // Analyse-Runde: kein Graph-Inbox-Fetch — nur die nächste offene Mail.
  if (maxAnalysen > 0) {
    const offen = await naechsteOffeneMail(postfach);
    let aktualisiert: ReturnType<typeof zuEintrag>[] = [];
    if (offen) {
      await analysiereEintrag(accessToken, postfach, offen);
      const row = await leseEintrag(offen.id);
      aktualisiert = [zuEintrag(row)];
    }

    return {
      postfach,
      nachrichten: [],
      eintraege: aktualisiert,
      offen: await zaehleOffene(postfach),
    };
  }

  // Listen-Runde: Posteingang einmal laden und Einträge anlegen.
  const nachrichten = await graphPosteingangNachrichten(accessToken, postfach, {
    anzahl: MAX_NACHRICHTEN,
  });
  await eintraegeAnlegen(postfach, nachrichten);

  const rows = await leseEintraege(
    postfach,
    nachrichten.map((n) => n.id),
  );

  return {
    postfach,
    nachrichten,
    eintraege: rows.map(zuEintrag),
    offen: await zaehleOffene(postfach),
  };
}
