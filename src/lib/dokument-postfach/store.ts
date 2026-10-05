/**
 * Zugriff auf `dokument_posteingang` — ausschließlich mit Service Role.
 */
import type { DokumentAnalyseFelder } from "@/lib/dokument-ai";
import type { DokumentPosteingangNachricht } from "@/lib/microsoft/ablage";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

import type {
  DokumentFreigabeStatus,
  DokumentPosteingangEintrag,
  DokumentPosteingangStatus,
  RechnungDuplikatHinweis,
} from "./typen";
import type { DokumentTyp } from "@/lib/dokument-ai";

const FREIGABE_WERTE: DokumentFreigabeStatus[] = [
  "neu",
  "in_pruefung",
  "freigegeben",
  "an_datev",
  "erledigt",
];

function zuFreigabeStatus(raw: string | null | undefined): DokumentFreigabeStatus | null {
  if (!raw) return null;
  return FREIGABE_WERTE.includes(raw as DokumentFreigabeStatus)
    ? (raw as DokumentFreigabeStatus)
    : null;
}

function zuDokumentTyp(row: DokumentPosteingangRow): DokumentTyp | null {
  if (
    row.dokument_typ === "rechnung" ||
    row.dokument_typ === "dokument" ||
    row.dokument_typ === "expose"
  ) {
    return row.dokument_typ;
  }
  if (row.ist_rechnung === true) return "rechnung";
  if (row.status === "analysiert" || row.status === "abgelegt" || row.status === "gebucht") {
    return "dokument";
  }
  return null;
}

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
  freigabe_status: string | null;
  ist_rechnung: boolean | null;
  dokument_typ: string | null;
  felder: DokumentAnalyseFelder | null;
  analyse_fehler: string | null;
  analysiert_am: string | null;
  gesellschaft_id: string | null;
  objekt_id: string | null;
  ablage_ordner_id: string | null;
  ablage_ordner_pfad: string | null;
  ablage_dateiname: string | null;
  abgelegt_am: string | null;
  abgelegt_onedrive_id: string | null;
  email_text: string | null;
  duplikat_hinweis: RechnungDuplikatHinweis | null;
};

const SPALTEN =
  "id,postfach,graph_nachricht_id,internet_message_id,betreff,absender_name," +
  "absender_mail,eingegangen_am,web_link,anhang_id,anhang_name,anhang_content_type," +
  "anhang_groesse,status,freigabe_status,ist_rechnung,dokument_typ,felder,analyse_fehler,analysiert_am," +
  "gesellschaft_id,objekt_id,ablage_ordner_id,ablage_ordner_pfad,ablage_dateiname," +
  "abgelegt_am,abgelegt_onedrive_id,email_text,duplikat_hinweis";

function fehler(kontext: string, message: string): Error {
  return new Error(`${kontext}: ${message}`);
}

/** PostgREST `.in()` über GET wird bei zu vielen IDs zu Bad Request. */
const IN_QUERY_CHUNK = 80;
const UPSERT_CHUNK = 150;

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
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
    anhangContentType: row.anhang_content_type,
    anhangGroesse: row.anhang_groesse,
    status: row.status,
    freigabeStatus: zuFreigabeStatus(row.freigabe_status),
    dokumentTyp: zuDokumentTyp(row),
    istRechnung: row.ist_rechnung,
    felder: row.felder,
    analyseFehler: row.analyse_fehler,
    analysiertAm: row.analysiert_am,
    gesellschaftId: row.gesellschaft_id,
    objektId: row.objekt_id,
    ablageOrdnerId: row.ablage_ordner_id,
    ablageOrdnerPfad: row.ablage_ordner_pfad,
    ablageDateiname: row.ablage_dateiname,
    abgelegtAm: row.abgelegt_am,
    duplikatHinweis: row.duplikat_hinweis,
    hatAblegenKategorie: false,
  };
}

export async function eintraegeAnlegen(
  nachrichten: DokumentPosteingangNachricht[],
): Promise<void> {
  const neu: Array<{
    postfach: string;
    graph_nachricht_id: string;
    internet_message_id: string | null;
    betreff: string | null;
    absender_name: string | null;
    absender_mail: string | null;
    eingegangen_am: string | null;
    web_link: string | null;
    email_text: string | null;
    anhang_id: string;
    anhang_name: string | null;
    anhang_content_type: string | null;
    anhang_groesse: number | null;
  }> = [];

  for (const n of nachrichten) {
    const anhaenge =
      n.anhaenge.length > 0
        ? n.anhaenge
        : n.primaerAnhang?.id
          ? [n.primaerAnhang]
          : [];

    for (const anhang of anhaenge) {
      if (!anhang.id) continue;
      neu.push({
        postfach: n.postfach,
        graph_nachricht_id: n.id,
        internet_message_id: n.internetMessageId,
        betreff: n.betreff,
        absender_name: n.absenderName,
        absender_mail: n.absenderMail,
        eingegangen_am: n.eingegangenAm,
        web_link: n.webLink,
        email_text: n.vorschau,
        anhang_id: anhang.id,
        anhang_name: anhang.name ?? null,
        anhang_content_type: anhang.contentType ?? null,
        anhang_groesse: anhang.groesse ?? null,
      });
    }
  }

  if (neu.length === 0) return;

  const admin = createServiceRoleClient();
  for (const batch of chunkArray(neu, UPSERT_CHUNK)) {
    const { error } = await admin.from(TABELLE).upsert(batch, {
      onConflict: "postfach,graph_nachricht_id,anhang_id",
      ignoreDuplicates: true,
    });
    if (error) {
      throw fehler(
        "Dokument-Posteingang konnte nicht gespeichert werden",
        error.message,
      );
    }
  }
}

export async function leseEintraege(
  graphNachrichtIds: Array<{ postfach: string; id: string }>,
): Promise<DokumentPosteingangRow[]> {
  if (graphNachrichtIds.length === 0) return [];

  const admin = createServiceRoleClient();
  const postfaecher = [...new Set(graphNachrichtIds.map((n) => n.postfach))];
  const ids = [...new Set(graphNachrichtIds.map((n) => n.id))];
  const alle: DokumentPosteingangRow[] = [];

  for (const idChunk of chunkArray(ids, IN_QUERY_CHUNK)) {
    const { data, error } = await admin
      .from(TABELLE)
      .select(SPALTEN)
      .in("postfach", postfaecher)
      .in("graph_nachricht_id", idChunk)
      .order("eingegangen_am", { ascending: false })
      .order("anhang_name", { ascending: true });

    if (error) {
      throw fehler(
        "Dokument-Posteingang konnte nicht gelesen werden",
        error.message,
      );
    }
    alle.push(...((data as unknown as DokumentPosteingangRow[]) ?? []));
  }

  return alle.sort((a, b) => {
    const da = a.eingegangen_am ? new Date(a.eingegangen_am).getTime() : 0;
    const db = b.eingegangen_am ? new Date(b.eingegangen_am).getTime() : 0;
    if (db !== da) return db - da;
    return (a.anhang_name ?? "").localeCompare(b.anhang_name ?? "", "de");
  });
}

/** Alle aktiven Postfach-Zeilen (neu/in_analyse/analysiert/fehler), paginiert ohne Cap. */
export async function leseAktiveEintraege(): Promise<DokumentPosteingangRow[]> {
  const admin = createServiceRoleClient();
  const seitenGroesse = 500;
  const alle: DokumentPosteingangRow[] = [];
  let von = 0;

  for (;;) {
    const { data, error } = await admin
      .from(TABELLE)
      .select(SPALTEN)
      .in("status", ["neu", "in_analyse", "analysiert", "fehler"])
      .order("eingegangen_am", { ascending: false })
      .range(von, von + seitenGroesse - 1);

    if (error) {
      throw fehler(
        "Dokument-Posteingang konnte nicht gelesen werden",
        error.message,
      );
    }

    const batch = (data as unknown as DokumentPosteingangRow[]) ?? [];
    alle.push(...batch);
    if (batch.length < seitenGroesse) break;
    von += seitenGroesse;
  }

  return alle;
}

/** Welche Graph-Nachrichten bereits als Zeile existieren (`postfach|id`). */
export async function existierendeNachrichtSchluessel(
  schluessel: Array<{ postfach: string; graphNachrichtId: string }>,
): Promise<Set<string>> {
  if (schluessel.length === 0) return new Set();

  const admin = createServiceRoleClient();
  const postfaecher = [...new Set(schluessel.map((s) => s.postfach))];
  const ids = [...new Set(schluessel.map((s) => s.graphNachrichtId))];
  const gefunden = new Set<string>();

  for (const idChunk of chunkArray(ids, IN_QUERY_CHUNK)) {
    const { data, error } = await admin
      .from(TABELLE)
      .select("postfach,graph_nachricht_id")
      .in("postfach", postfaecher)
      .in("graph_nachricht_id", idChunk);

    if (error) {
      throw fehler(
        "Dokument-Posteingang-Schlüssel konnten nicht gelesen werden",
        error.message,
      );
    }

    for (const row of data ?? []) {
      const postfach = (row.postfach as string | null)?.toLowerCase() ?? "";
      const id = (row.graph_nachricht_id as string | null) ?? "";
      if (postfach && id) gefunden.add(`${postfach}|${id}`);
    }
  }

  return gefunden;
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
  return data as unknown as DokumentPosteingangRow;
}

/** Vollen Mailtext für alle Anhänge derselben Graph-Nachricht speichern. */
export async function speichereEmailTextFuerNachricht(
  postfach: string,
  graphNachrichtId: string,
  emailText: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({ email_text: emailText })
    .eq("postfach", postfach)
    .eq("graph_nachricht_id", graphNachrichtId);
  if (error) {
    throw fehler(
      "E-Mail-Text der Nachricht konnte nicht gespeichert werden",
      error.message,
    );
  }
}

export async function speichereAnalyse(
  id: string,
  input: {
    dokumentTyp: DokumentTyp;
    felder: DokumentAnalyseFelder;
    gesellschaftId: string | null;
    objektId: string | null;
    ablageOrdnerId: string | null;
    ablageOrdnerPfad: string | null;
    duplikatHinweis?: RechnungDuplikatHinweis | null;
  },
): Promise<void> {
  const istRechnung = input.dokumentTyp === "rechnung";
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({
      status: "analysiert",
      dokument_typ: input.dokumentTyp,
      ist_rechnung: istRechnung,
      freigabe_status: istRechnung ? "neu" : null,
      duplikat_hinweis: input.duplikatHinweis ?? null,
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
    ablageDateiname?: string | null;
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
      ablage_dateiname: input.ablageDateiname ?? null,
      felder: input.felder,
      gesellschaft_id: input.gesellschaftId,
      objekt_id: input.objektId,
    })
    .eq("id", id);

  if (error) {
    throw fehler("Abgelegt-Status konnte nicht gespeichert werden", error.message);
  }
}

export async function markiereGebucht(
  id: string,
  input: {
    onedriveId: string;
    ordnerPfad: string;
    ordnerId: string;
    felder: DokumentAnalyseFelder;
    gesellschaftId: string | null;
    objektId: string | null;
    ablageDateiname?: string | null;
  },
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({
      status: "gebucht",
      ist_rechnung: true,
      freigabe_status: "erledigt",
      abgelegt_am: new Date().toISOString(),
      abgelegt_onedrive_id: input.onedriveId,
      ablage_ordner_id: input.ordnerId,
      ablage_ordner_pfad: input.ordnerPfad,
      ablage_dateiname: input.ablageDateiname ?? null,
      felder: input.felder,
      gesellschaft_id: input.gesellschaftId,
      objekt_id: input.objektId,
    })
    .eq("id", id);

  if (error) {
    throw fehler("Gebucht-Status konnte nicht gespeichert werden", error.message);
  }
}

export async function setzeFreigabeStatus(
  id: string,
  freigabeStatus: DokumentFreigabeStatus,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .update({ freigabe_status: freigabeStatus })
    .eq("id", id);

  if (error) {
    throw fehler("Freigabe-Status konnte nicht gespeichert werden", error.message);
  }
}

export async function leseRechnungsfreigabe(): Promise<DokumentPosteingangRow[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .or("dokument_typ.eq.rechnung,ist_rechnung.eq.true")
    .order("eingegangen_am", { ascending: false, nullsFirst: false });

  if (error) {
    throw fehler("Rechnungsfreigabe konnte nicht geladen werden", error.message);
  }
  return (data as unknown as DokumentPosteingangRow[]) ?? [];
}

export async function zaehleOffeneRechnungsfreigabe(): Promise<number> {
  const admin = createServiceRoleClient();
  const { count, error } = await admin
    .from(TABELLE)
    .select("id", { count: "exact", head: true })
    .or("dokument_typ.eq.rechnung,ist_rechnung.eq.true")
    .neq("status", "gebucht")
    .not("freigabe_status", "eq", "erledigt");

  if (error) {
    throw fehler(
      "Offene Rechnungsfreigaben konnten nicht gezählt werden",
      error.message,
    );
  }
  return count ?? 0;
}

const ERLEDIGTE_STATUS: DokumentPosteingangStatus[] = ["abgelegt", "gebucht"];

export function istEintragErledigt(status: DokumentPosteingangStatus): boolean {
  return ERLEDIGTE_STATUS.includes(status);
}

export async function leseEintraegeFuerNachricht(
  postfach: string,
  graphNachrichtId: string,
): Promise<DokumentPosteingangRow[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .eq("postfach", postfach)
    .eq("graph_nachricht_id", graphNachrichtId)
    .order("anhang_name", { ascending: true });

  if (error) {
    throw fehler(
      "Dokument-Posteingang-Geschwister konnten nicht gelesen werden",
      error.message,
    );
  }
  return (data as unknown as DokumentPosteingangRow[]) ?? [];
}

export async function loescheEintrag(id: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from(TABELLE).delete().eq("id", id);
  if (error) {
    throw fehler("Dokument-Posteingang-Eintrag konnte nicht gelöscht werden", error.message);
  }
}

export async function loescheEintraegeFuerNachricht(
  postfach: string,
  graphNachrichtId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from(TABELLE)
    .delete()
    .eq("postfach", postfach)
    .eq("graph_nachricht_id", graphNachrichtId);

  if (error) {
    throw fehler(
      "Dokument-Posteingang-Einträge konnten nicht gelöscht werden",
      error.message,
    );
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

/**
 * Hängengebliebene Claims freigeben (z. B. nach Function-Timeout).
 * @returns Anzahl zurückgesetzter Zeilen.
 */
export async function gebeVeralteteAnalysenFrei(
  aelterAlsMs = 15 * 60 * 1000,
): Promise<number> {
  const admin = createServiceRoleClient();
  const cutoff = new Date(Date.now() - aelterAlsMs).toISOString();
  const { data, error } = await admin
    .from(TABELLE)
    .update({ status: "neu" })
    .eq("status", "in_analyse")
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    throw fehler(
      "Veraltete Analyse-Claims konnten nicht freigegeben werden",
      error.message,
    );
  }
  return data?.length ?? 0;
}

/**
 * Nächste offene Mail atomar claimen (`neu` → `in_analyse`).
 * Bei Race mit anderem Worker: erneut versuchen.
 */
export async function claimNaechsteOffeneMail(): Promise<DokumentPosteingangRow | null> {
  const admin = createServiceRoleClient();

  for (let versuch = 0; versuch < 8; versuch++) {
    const kandidat = await naechsteOffeneMail();
    if (!kandidat) return null;

    const { data, error } = await admin
      .from(TABELLE)
      .update({ status: "in_analyse" })
      .eq("id", kandidat.id)
      .eq("status", "neu")
      .select(SPALTEN)
      .maybeSingle();

    if (error) {
      throw fehler(
        "Dokument-Mail konnte nicht für Analyse geclaimt werden",
        error.message,
      );
    }
    if (data) return data as unknown as DokumentPosteingangRow;
  }

  return null;
}

/**
 * Offene Anhänge derselben Graph-Nachricht claimen (Geschwister zuerst),
 * damit Sibling-Kontext in einem Batch greift.
 */
async function claimOffeneGeschwister(
  postfach: string,
  graphNachrichtId: string,
  excludeIds: Set<string>,
  rest: number,
): Promise<DokumentPosteingangRow[]> {
  if (rest <= 0) return [];
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .select(SPALTEN)
    .eq("postfach", postfach)
    .eq("graph_nachricht_id", graphNachrichtId)
    .eq("status", "neu")
    .order("anhang_name", { ascending: true })
    .limit(rest);

  if (error) {
    throw fehler(
      "Geschwister-Anhänge konnten nicht gelesen werden",
      error.message,
    );
  }

  const claimed: DokumentPosteingangRow[] = [];
  for (const kandidat of (data as unknown as DokumentPosteingangRow[]) ?? []) {
    if (excludeIds.has(kandidat.id)) continue;
    const { data: row, error: claimErr } = await admin
      .from(TABELLE)
      .update({ status: "in_analyse" })
      .eq("id", kandidat.id)
      .eq("status", "neu")
      .select(SPALTEN)
      .maybeSingle();
    if (claimErr) {
      throw fehler(
        "Geschwister-Anhang konnte nicht geclaimt werden",
        claimErr.message,
      );
    }
    if (row) {
      const claimedRow = row as unknown as DokumentPosteingangRow;
      claimed.push(claimedRow);
      excludeIds.add(claimedRow.id);
      if (claimed.length >= rest) break;
    }
  }
  return claimed;
}

/**
 * Bis zu `limit` offene Anhänge claimen.
 * Nach dem ersten Claim: restliche Anhänge derselben Mail bevorzugt
 * (für Sibling-Zuordnung in einem Batch).
 */
export async function claimNaechsteOffeneMails(
  limit: number,
): Promise<DokumentPosteingangRow[]> {
  const max = Math.max(0, Math.floor(limit));
  if (max === 0) return [];

  const claimed: DokumentPosteingangRow[] = [];
  const excludeIds = new Set<string>();

  const erste = await claimNaechsteOffeneMail();
  if (!erste) return [];
  claimed.push(erste);
  excludeIds.add(erste.id);

  const geschwister = await claimOffeneGeschwister(
    erste.postfach,
    erste.graph_nachricht_id,
    excludeIds,
    max - claimed.length,
  );
  claimed.push(...geschwister);

  while (claimed.length < max) {
    const row = await claimNaechsteOffeneMail();
    if (!row) break;
    if (excludeIds.has(row.id)) continue;
    claimed.push(row);
    excludeIds.add(row.id);

    if (claimed.length >= max) break;
    const weitere = await claimOffeneGeschwister(
      row.postfach,
      row.graph_nachricht_id,
      excludeIds,
      max - claimed.length,
    );
    claimed.push(...weitere);
  }

  return claimed;
}

/** Gezielten Eintrag für Analyse claimen (Wiederholung / Einzelanalyse). */
export async function claimEintragFuerAnalyse(
  id: string,
): Promise<DokumentPosteingangRow> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from(TABELLE)
    .update({ status: "in_analyse", analyse_fehler: null })
    .eq("id", id)
    .in("status", ["neu", "fehler", "analysiert", "in_analyse"])
    .select(SPALTEN)
    .maybeSingle();

  if (error) {
    throw fehler(
      "Dokument-Mail konnte nicht für Analyse geclaimt werden",
      error.message,
    );
  }
  if (!data) {
    throw new Error(
      "Eintrag ist nicht mehr für die Analyse verfügbar (bereits in Arbeit oder erledigt).",
    );
  }
  return data as unknown as DokumentPosteingangRow;
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
