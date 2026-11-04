/**
 * Zugriff auf `postfach_exposes` — ausschließlich mit Service Role (RLS lässt
 * keine Client-Zugriffe zu). Nur aus Server-Code importieren.
 */
import type { ExposeFelder } from "@/lib/expose-ai";
import type { GraphNachricht } from "@/lib/microsoft/graph";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

import type { PostfachEintrag, PostfachEintragStatus } from "./typen";

const TABELLE = "postfach_exposes";

export type PostfachEintragRow = {
  id: string;
  postfach: string;
  graph_nachricht_id: string;
  internet_message_id: string | null;
  betreff: string | null;
  absender_name: string | null;
  absender_mail: string | null;
  eingegangen_am: string | null;
  web_link: string | null;
  anhang_id: string | null;
  anhang_name: string | null;
  anhang_content_type: string | null;
  anhang_groesse: number | null;
  status: PostfachEintragStatus;
  felder: ExposeFelder | null;
  analyse_fehler: string | null;
  analysiert_am: string | null;
  salesforce_real_estate_id: string | null;
  salesforce_transaktion_id: string | null;
  exportiert_am: string | null;
  abgelegt_am: string | null;
  abgelegt_ordner: string | null;
};

const SPALTEN =
  "id,postfach,graph_nachricht_id,internet_message_id,betreff,absender_name," +
  "absender_mail,eingegangen_am,web_link,anhang_id,anhang_name,anhang_content_type," +
  "anhang_groesse,status,felder,analyse_fehler,analysiert_am," +
  "salesforce_real_estate_id,salesforce_transaktion_id,exportiert_am," +
  "abgelegt_am,abgelegt_ordner";

export function zuEintrag(row: PostfachEintragRow): PostfachEintrag {
  return {
    id: row.id,
    graphNachrichtId: row.graph_nachricht_id,
    betreff: row.betreff,
    absenderName: row.absender_name,
    absenderMail: row.absender_mail,
    eingegangenAm: row.eingegangen_am,
    anhangName: row.anhang_name,
    anhangGroesse: row.anhang_groesse,
    quelle: row.anhang_id ? "anhang" : "link",
    webLink: row.web_link,
    status: row.status,
    felder: row.felder,
    analyseFehler: row.analyse_fehler,
    analysiertAm: row.analysiert_am,
    salesforceRealEstateId: row.salesforce_real_estate_id,
    exportiertAm: row.exportiert_am,
    abgelegtAm: row.abgelegt_am,
  };
}

function fehler(kontext: string, message: string): Error {
  return new Error(`${kontext}: ${message}`);
}

/** Legt fehlende Einträge für Mails mit PDF-Anhang an. Bestehende bleiben unberührt. */
export async function eintraegeAnlegen(
  postfach: string,
  nachrichten: GraphNachricht[],
): Promise<void> {
  const neu = nachrichten
    .filter((n) => n.pdfAnhang?.id)
    .map((n) => ({
      postfach,
      graph_nachricht_id: n.id,
      internet_message_id: n.internetMessageId,
      betreff: n.betreff,
      absender_name: n.absenderName,
      absender_mail: n.absenderMail,
      eingegangen_am: n.eingegangenAm,
      web_link: n.webLink,
      anhang_id: n.pdfAnhang?.id ?? null,
      anhang_name: n.pdfAnhang?.name ?? null,
      anhang_content_type: n.pdfAnhang?.contentType ?? null,
      anhang_groesse: n.pdfAnhang?.groesse ?? null,
    }));

  if (neu.length === 0) return;

  const admin = createServiceRoleClient();
  const { error } = await admin.from(TABELLE).upsert(neu, {
    onConflict: "postfach,graph_nachricht_id",
    ignoreDuplicates: true,
  });

  if (error)
    throw fehler(
      "Postfach-Einträge konnten nicht gespeichert werden",
      error.message,
    );
}

/** Einträge für Mails ohne PDF-Anhang, aber mit Exposé-Link. */
export async function linkEintraegeAnlegen(
  postfach: string,
  nachrichten: GraphNachricht[],
): Promise<void> {
  const neu = nachrichten.map((n) => ({
    postfach,
    graph_nachricht_id: n.id,
    internet_message_id: n.internetMessageId,
    betreff: n.betreff,
    absender_name: n.absenderName,
    absender_mail: n.absenderMail,
    eingegangen_am: n.eingegangenAm,
    web_link: n.webLink,
  }));
  if (neu.length === 0) return;

  const admin = createServiceRoleClient();
  const { error } = await admin.from(TABELLE).upsert(neu, {
    onConflict: "postfach,graph_nachricht_id",
    ignoreDuplicates: true,
  });
  if (error)
    throw fehler(
      "Link-Exposés konnten nicht gespeichert werden",
      error.message,
    );
}

/** Speicherort des über einen Link geladenen PDFs (Bucket `dokumente`). */
export const LINK_PDF_BUCKET = "dokumente";
export function linkPdfPfad(eintragId: string): string {
  return `postfach-links/${eintragId}.pdf`;
}

export async function speichereLinkPdf(
  id: string,
  pdf: { dateiname: string; bytes: Uint8Array },
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error: upErr } = await admin.storage
    .from(LINK_PDF_BUCKET)
    .upload(linkPdfPfad(id), pdf.bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr)
    throw fehler("Link-PDF konnte nicht gespeichert werden", upErr.message);

  const { error } = await admin
    .from(TABELLE)
    .update({
      anhang_name: pdf.dateiname,
      anhang_content_type: "application/pdf",
      anhang_groesse: pdf.bytes.byteLength,
    })
    .eq("id", id);
  if (error)
    throw fehler("Link-PDF konnte nicht vermerkt werden", error.message);
}

/** Signierte Download-URL (10 Min.) für das gespeicherte Link-PDF. */
export async function linkPdfUrl(id: string): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.storage
    .from(LINK_PDF_BUCKET)
    .createSignedUrl(linkPdfPfad(id), 600);
  if (error || !data?.signedUrl)
    throw new Error(
      `Exposé-PDF aus dem Link ist nicht gespeichert: ${error?.message ?? "leer"}`,
    );
  return data.signedUrl;
}

/**
 * Bereits verarbeitete Link-Mails (ohne PDF-Anhang) wieder auf „neu“ setzen,
 * damit der Nachtlauf die Links abruft. Exportierte/abgelegte bleiben.
 */
export async function linkEintraegeZuruecksetzen(
  postfach: string,
): Promise<number> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .update({ status: "neu" })
    .eq("postfach", postfach)
    .is("anhang_id", null)
    .in("status", ["analysiert", "fehler"])
    .is("abgelegt_am", null)
    .select("id");
  if (error)
    throw fehler(
      "Link-Exposés konnten nicht zurückgesetzt werden",
      error.message,
    );
  return data?.length ?? 0;
}

export async function leseEintraege(
  postfach: string,
  graphNachrichtIds: string[],
): Promise<PostfachEintragRow[]> {
  if (graphNachrichtIds.length === 0) return [];

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .eq("postfach", postfach)
    .in("graph_nachricht_id", graphNachrichtIds);

  if (error)
    throw fehler(
      "Postfach-Einträge konnten nicht gelesen werden",
      error.message,
    );
  return (data ?? []) as unknown as PostfachEintragRow[];
}

/** Offene Exposé-Zeilen aus der DB (ohne Graph). */
export async function leseAktiveEintraege(
  postfach: string,
  limit = 50,
): Promise<PostfachEintragRow[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .eq("postfach", postfach)
    .in("status", ["neu", "analysiert", "fehler"])
    .is("abgelegt_am", null)
    .order("eingegangen_am", { ascending: false, nullsFirst: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    throw fehler(
      "Postfach-Einträge konnten nicht gelesen werden",
      error.message,
    );
  }
  return (data ?? []) as unknown as PostfachEintragRow[];
}

/** Bereits bekannte Graph-Nachrichten-IDs im Postfach. */
export async function existierendeNachrichtIds(
  postfach: string,
  graphNachrichtIds: string[],
): Promise<Set<string>> {
  if (graphNachrichtIds.length === 0) return new Set();

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select("graph_nachricht_id")
    .eq("postfach", postfach)
    .in("graph_nachricht_id", graphNachrichtIds);

  if (error) {
    throw fehler(
      "Postfach-Nachrichten-IDs konnten nicht gelesen werden",
      error.message,
    );
  }

  return new Set(
    (data ?? [])
      .map((r) => (r as { graph_nachricht_id?: string }).graph_nachricht_id)
      .filter((id): id is string => Boolean(id)),
  );
}

export async function leseEintrag(id: string): Promise<PostfachEintragRow> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .eq("id", id)
    .maybeSingle();

  if (error)
    throw fehler("Postfach-Eintrag konnte nicht gelesen werden", error.message);
  if (!data) throw new Error("Postfach-Eintrag nicht gefunden.");
  return data as unknown as PostfachEintragRow;
}

export async function speichereAnalyse(
  id: string,
  felder: ExposeFelder,
  /** Hinweis trotz Erfolg, z. B. „Link braucht manuellen Abruf …“. */
  hinweis: string | null = null,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({
      status: "analysiert",
      felder,
      analyse_fehler: hinweis ? hinweis.slice(0, 1000) : null,
      analysiert_am: new Date().toISOString(),
    })
    .eq("id", id);

  if (error)
    throw fehler("KI-Ergebnis konnte nicht gespeichert werden", error.message);
}

export async function speichereAnalyseFehler(
  id: string,
  meldung: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  await admin
    .from(TABELLE)
    .update({
      status: "fehler",
      analyse_fehler: meldung.slice(0, 1000),
      analysiert_am: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function markiereExportiert(
  id: string,
  input: {
    realEstateId: string | null;
    transaktionId: string | null;
    nutzerId: string | null;
  },
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({
      status: "exportiert",
      salesforce_real_estate_id: input.realEstateId,
      salesforce_transaktion_id: input.transaktionId,
      exportiert_am: new Date().toISOString(),
      exportiert_von: input.nutzerId,
    })
    .eq("id", id);

  if (error) throw fehler("Export konnte nicht vermerkt werden", error.message);
}

export async function markiereAbgelegt(
  id: string,
  ordner: string,
  graphNachrichtId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  await admin
    .from(TABELLE)
    .update({
      abgelegt_am: new Date().toISOString(),
      abgelegt_ordner: ordner,
      graph_nachricht_id: graphNachrichtId,
    })
    .eq("id", id);
}
