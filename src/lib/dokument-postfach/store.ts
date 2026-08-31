/**
 * Zugriff auf `dokument_posteingang` — ausschließlich mit Service Role.
 */
import type { DokumentAnalyseFelder } from "@/lib/dokument-ai";
import type { DokumentPosteingangNachricht } from "@/lib/microsoft/ablage";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

import type {
  DokumentPosteingangEintrag,
  DokumentPosteingangStatus,
} from "./typen";

const TABELLE = "dokument_posteingang";

export type DokumentPosteingangRow = {
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
  status: DokumentPosteingangStatus;
  ist_rechnung: boolean | null;
  felder: DokumentAnalyseFelder | null;
  analyse_fehler: string | null;
  analysiert_am: string | null;
  gesellschaft_id: string | null;
  objekt_id: string | null;
  ablage_ordner_id: string | null;
  ablage_ordner_pfad: string | null;
  abgelegt_am: string | null;
  abgelegt_onedrive_id: string | null;
  email_text: string | null;
};

const SPALTEN =
  "id,postfach,graph_nachricht_id,internet_message_id,betreff,absender_name," +
  "absender_mail,eingegangen_am,web_link,anhang_id,anhang_name,anhang_content_type," +
  "anhang_groesse,status,ist_rechnung,felder,analyse_fehler,analysiert_am," +
  "gesellschaft_id,objekt_id,ablage_ordner_id,ablage_ordner_pfad,abgelegt_am,abgelegt_onedrive_id,email_text";

function fehler(kontext: string, message: string): Error {
  return new Error(`${kontext}: ${message}`);
}

export function zuEintrag(row: DokumentPosteingangRow): DokumentPosteingangEintrag {
  return {
    id: row.id,
    postfach: row.postfach,
    graphNachrichtId: row.graph_nachricht_id,
    betreff: row.betreff,
    absenderName: row.absender_name,
    absenderMail: row.absender_mail,
    eingegangenAm: row.eingegangen_am,
    anhangName: row.anhang_name,
    anhangGroesse: row.anhang_groesse,
    status: row.status,
    istRechnung: row.ist_rechnung,
    felder: row.felder,
    analyseFehler: row.analyse_fehler,
    analysiertAm: row.analysiert_am,
    gesellschaftId: row.gesellschaft_id,
    objektId: row.objekt_id,
    ablageOrdnerId: row.ablage_ordner_id,
    ablageOrdnerPfad: row.ablage_ordner_pfad,
    abgelegtAm: row.abgelegt_am,
  };
}

export async function eintraegeAnlegen(
  nachrichten: DokumentPosteingangNachricht[],
): Promise<void> {
  const neu = nachrichten
    .filter((n) => n.primaerAnhang?.id)
    .map((n) => ({
      postfach: n.postfach,
      graph_nachricht_id: n.id,
      internet_message_id: n.internetMessageId,
      betreff: n.betreff,
      absender_name: n.absenderName,
      absender_mail: n.absenderMail,
      eingegangen_am: n.eingegangenAm,
      web_link: n.webLink,
      email_text: n.vorschau,
      anhang_id: n.primaerAnhang?.id ?? null,
      anhang_name: n.primaerAnhang?.name ?? null,
      anhang_content_type: n.primaerAnhang?.contentType ?? null,
      anhang_groesse: n.primaerAnhang?.groesse ?? null,
    }));

  if (neu.length === 0) return;

  const admin = createServiceRoleClient();
  const { error } = await admin.from(TABELLE).upsert(neu, {
    onConflict: "postfach,graph_nachricht_id",
    ignoreDuplicates: true,
  });

  if (error) {
    throw fehler("Dokument-Posteingang konnte nicht gespeichert werden", error.message);
  }
}

export async function leseEintraege(
  graphNachrichtIds: Array<{ postfach: string; id: string }>,
): Promise<DokumentPosteingangRow[]> {
  if (graphNachrichtIds.length === 0) return [];

  const admin = createServiceRoleClient();
  const postfaecher = [...new Set(graphNachrichtIds.map((n) => n.postfach))];
  const ids = graphNachrichtIds.map((n) => n.id);

  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .in("postfach", postfaecher)
    .in("graph_nachricht_id", ids);

  if (error) {
    throw fehler("Dokument-Posteingang konnte nicht gelesen werden", error.message);
  }

  return (data as DokumentPosteingangRow[]) ?? [];
}

export async function leseEintrag(id: string): Promise<DokumentPosteingangRow> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw fehler("Dokument-Posteingang-Eintrag konnte nicht gelesen werden", error.message);
  }
  if (!data) throw new Error("Dokument-Posteingang-Eintrag nicht gefunden.");
  return data as DokumentPosteingangRow;
}

export async function speichereAnalyse(
  id: string,
  input: {
    istRechnung: boolean;
    felder: DokumentAnalyseFelder;
    gesellschaftId: string | null;
    objektId: string | null;
    ablageOrdnerId: string | null;
    ablageOrdnerPfad: string | null;
  },
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({
      status: "analysiert",
      ist_rechnung: input.istRechnung,
      felder: input.felder,
      gesellschaft_id: input.gesellschaftId,
      objekt_id: input.objektId,
      ablage_ordner_id: input.ablageOrdnerId,
      ablage_ordner_pfad: input.ablageOrdnerPfad,
      analyse_fehler: null,
      analysiert_am: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw fehler("KI-Analyse konnte nicht gespeichert werden", error.message);
  }
}

export async function speichereAnalyseFehler(
  id: string,
  nachricht: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({
      status: "fehler",
      analyse_fehler: nachricht,
    })
    .eq("id", id);

  if (error) {
    throw fehler("Analysefehler konnte nicht gespeichert werden", error.message);
  }
}

export async function setzeStatusNeu(id: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({
      status: "neu",
      analyse_fehler: null,
    })
    .eq("id", id);

  if (error) {
    throw fehler("Status konnte nicht zurückgesetzt werden", error.message);
  }
}

export async function speicherePruefung(
  id: string,
  input: {
    felder: DokumentAnalyseFelder;
    gesellschaftId: string | null;
    objektId: string | null;
    ablageOrdnerId: string | null;
    ablageOrdnerPfad: string | null;
    istRechnung: boolean;
  },
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({
      felder: input.felder,
      gesellschaft_id: input.gesellschaftId,
      objekt_id: input.objektId,
      ablage_ordner_id: input.ablageOrdnerId,
      ablage_ordner_pfad: input.ablageOrdnerPfad,
      ist_rechnung: input.istRechnung,
    })
    .eq("id", id);

  if (error) {
    throw fehler("Prüfung konnte nicht gespeichert werden", error.message);
  }
}

export async function markiereAbgelegt(
  id: string,
  input: {
    onedriveId: string;
    ordnerPfad: string;
    ordnerId: string;
    felder: DokumentAnalyseFelder;
    gesellschaftId: string | null;
    objektId: string | null;
  },
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({
      status: "abgelegt",
      abgelegt_am: new Date().toISOString(),
      abgelegt_onedrive_id: input.onedriveId,
      ablage_ordner_id: input.ordnerId,
      ablage_ordner_pfad: input.ordnerPfad,
      felder: input.felder,
      gesellschaft_id: input.gesellschaftId,
      objekt_id: input.objektId,
    })
    .eq("id", id);

  if (error) {
    throw fehler("Abgelegt-Status konnte nicht gespeichert werden", error.message);
  }
}

export async function loescheEintrag(id: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from(TABELLE).delete().eq("id", id);
  if (error) {
    throw fehler("Dokument-Posteingang-Eintrag konnte nicht gelöscht werden", error.message);
  }
}

export async function naechsteOffeneMail(): Promise<DokumentPosteingangRow | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .eq("status", "neu")
    .order("eingegangen_am", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw fehler("Offene Dokument-Mails konnten nicht gelesen werden", error.message);
  }
  return (data as DokumentPosteingangRow | null) ?? null;
}

export async function zaehleOffene(): Promise<number> {
  const admin = createServiceRoleClient();
  const { count, error } = await admin
    .from(TABELLE)
    .select("id", { count: "exact", head: true })
    .eq("status", "neu");

  if (error) {
    throw fehler("Offene Dokument-Mails konnten nicht gezählt werden", error.message);
  }
  return count ?? 0;
}
