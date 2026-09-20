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
  graphNachrichtAnhangMetas,
  graphNachrichtAnhaengeAnwenden,
  graphPosteingangNachrichten,
  type GraphNachricht,
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
  existierendeNachrichtIds,
  leseAktiveEintraege,
  leseEintrag,
  leseEintraege,
  speichereAnalyse,
  speichereAnalyseFehler,
  zuEintrag,
  type PostfachEintragRow,
} from "./store";
import type { PostfachEintrag, PostfachSyncErgebnis } from "./typen";

const MAX_NACHRICHTEN = 50;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

async function mapMitLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next;
      next += 1;
      results[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/** DB-Zeile → GraphNachricht-Stub für die Listen-UI. */
export function eintragAlsGraphNachricht(
  eintrag: PostfachEintrag,
): GraphNachricht {
  const pdf =
    eintrag.anhangName != null
      ? {
          id: null as string | null,
          name: eintrag.anhangName,
          contentType: "application/pdf" as string | null,
          groesse: eintrag.anhangGroesse ?? 0,
        }
      : null;
  return {
    id: eintrag.graphNachrichtId,
    internetMessageId: null,
    betreff: eintrag.betreff,
    absenderName: eintrag.absenderName,
    absenderMail: eintrag.absenderMail,
    eingegangenAm: eintrag.eingegangenAm,
    hatAnhaenge: Boolean(pdf),
    anhangArt: pdf ? "pdf" : "keins",
    pdfAnhang: pdf,
    primaerAnhang: pdf,
    anhaenge: pdf ? [pdf] : [],
    vorschau: null,
    webLink: null,
  };
}

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
): Promise<boolean> {
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
    return true;
  } catch (err) {
    try {
      await speichereAnalyseFehler(row.id, fehlerText(err));
    } catch (speicherErr) {
      console.error(
        "[postfach] Analysefehler konnte nicht gespeichert werden",
        row.id,
        speicherErr,
      );
      // Eintrag bleibt ggf. „neu“ → Aufrufer muss abbrechen, sonst Endlosschleife.
      throw speicherErr;
    }
    return false;
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

export async function postfachAusDbLaden(input: {
  supabaseAccessToken: string;
}): Promise<PostfachSyncErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const postfach = microsoftPostfach();
  const rows = await leseAktiveEintraege(postfach, MAX_NACHRICHTEN);
  const eintraege = rows.map(zuEintrag);
  return {
    postfach,
    nachrichten: eintraege.map(eintragAlsGraphNachricht),
    eintraege,
    offen: await zaehleOffene(postfach),
  };
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

  // Leichte Inbox ohne $expand; Anhänge nur für neue Mails.
  const leicht = await graphPosteingangNachrichten(accessToken, postfach, {
    anzahl: MAX_NACHRICHTEN,
    nurMitAnhang: true,
    mitAnhangMetas: false,
  });

  const bekannt = await existierendeNachrichtIds(
    postfach,
    leicht.map((n) => n.id),
  );

  const neu = leicht.filter((n) => !bekannt.has(n.id));
  const angereichert =
    neu.length === 0
      ? []
      : await mapMitLimit(neu, 4, async (n) => {
          const metas = await graphNachrichtAnhangMetas(
            accessToken,
            postfach,
            n.id,
          );
          return graphNachrichtAnhaengeAnwenden(n, metas);
        });

  const byId = new Map(angereichert.map((n) => [n.id, n]));
  const nachrichten = leicht
    .map((n) => byId.get(n.id) ?? n)
    .filter((n) => (bekannt.has(n.id) ? true : Boolean(n.pdfAnhang?.id)));

  await eintraegeAnlegen(
    postfach,
    nachrichten.filter((n) => Boolean(n.pdfAnhang?.id)),
  );

  const rows = await leseEintraege(
    postfach,
    nachrichten.map((n) => n.id),
  );
  const eintraege = rows.map(zuEintrag);
  const eintragByGraphId = new Map(
    eintraege.map((e) => [e.graphNachrichtId, e]),
  );

  // UI braucht pdfAnhang — für bekannte Mails ohne Expand aus der DB füllen.
  const nachrichtenUi = nachrichten.map((n) => {
    if (n.pdfAnhang) return n;
    const eintrag = eintragByGraphId.get(n.id);
    return eintrag ? eintragAlsGraphNachricht(eintrag) : n;
  });

  return {
    postfach,
    nachrichten: nachrichtenUi,
    eintraege,
    offen: await zaehleOffene(postfach),
  };
}

/**
 * Mindestabstand zwischen Anthropic-Starts (~5 Requests/Minute).
 * Dauert eine Analyse schon länger, wird nicht extra gewartet.
 */
const ANTHROPIC_MIN_ABSTAND_MS = 12_000;
/** Nach so vielen Fehlern in Folge: Lauf stoppen (vermutlich systemisch). */
const NACHTLAUF_MAX_FEHLER_IN_FOLGE = 3;
/**
 * Sicherheitslimit pro Invocation (zusätzlich zum Zeitbudget).
 * Reicht für große Posteingänge; echte Grenze ist deadlineMs / maxDuration.
 */
const NACHTLAUF_MAX_ANALYSEN_PRO_LAUF = 200;
/** Max. Selbst-Fortsetzungen nach dem ersten Cron-Trigger. */
export const NACHTLAUF_MAX_RUNDEN = 40;
/**
 * ~4,5 Min. unter Hobby-maxDuration 300s — Rest geht über Folge-Invocations.
 */
export const NACHTLAUF_DEFAULT_BUDGET_MS = 270_000;

function warteMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PostfachNachtlaufErgebnis = {
  analysiert: number;
  fehlgeschlagen: number;
  offen: number;
  fortsetzen: boolean;
  abgebrochen?: "zu_viele_fehler" | "persistenz";
  inboxSyncFehler?: string;
};

/**
 * Nachtlauf ohne User-JWT: Ankauf-Posteingang listen, dann nacheinander
 * analysieren bis keine offenen Mails mehr da sind oder das Zeitbudget endet.
 * Einzelne Eintrag-Fehler werden übersprungen; nach 3 Fehlern in Folge Stopp.
 */
export async function postfachNachtlauf(input?: {
  /** Erste Runde: Inbox von Graph laden. Folgerunden: nur analysieren. */
  inboxSync?: boolean;
  /**
   * Absolute Deadline (Date.now()-ms). Danach keine neue Analyse mehr starten;
   * Caller kann mit einer neuen Invocation fortsetzen.
   */
  deadlineMs?: number;
}): Promise<PostfachNachtlaufErgebnis> {
  const inboxSync = input?.inboxSync !== false;
  const deadlineMs =
    input?.deadlineMs ?? Date.now() + NACHTLAUF_DEFAULT_BUDGET_MS;
  const postfach = microsoftPostfach();
  let inboxSyncFehler: string | undefined;

  if (inboxSync) {
    try {
      const { accessToken } = await microsoftAccessToken();
      const leicht = await graphPosteingangNachrichten(accessToken, postfach, {
        anzahl: MAX_NACHRICHTEN,
        nurMitAnhang: true,
        mitAnhangMetas: false,
      });
      const bekannt = await existierendeNachrichtIds(
        postfach,
        leicht.map((n) => n.id),
      );
      const neu = leicht.filter((n) => !bekannt.has(n.id));
      const angereichert =
        neu.length === 0
          ? []
          : await mapMitLimit(neu, 4, async (n) => {
              const metas = await graphNachrichtAnhangMetas(
                accessToken,
                postfach,
                n.id,
              );
              return graphNachrichtAnhaengeAnwenden(n, metas);
            });
      const byId = new Map(angereichert.map((n) => [n.id, n]));
      const nachrichten = leicht
        .map((n) => byId.get(n.id) ?? n)
        .filter((n) => Boolean(n.pdfAnhang?.id));
      await eintraegeAnlegen(postfach, nachrichten);
    } catch (err) {
      inboxSyncFehler = fehlerText(err);
      console.error("[postfach] Inbox-Sync im Nachtlauf", err);
      // Bestehende „neu“-Einträge trotzdem analysieren.
    }
  }

  const { accessToken } = await microsoftAccessToken();
  let analysiert = 0;
  let fehlgeschlagen = 0;
  let fehlerInFolge = 0;
  let naechsterStartErlaubt = 0;
  let abgebrochen: PostfachNachtlaufErgebnis["abgebrochen"];

  for (let i = 0; i < NACHTLAUF_MAX_ANALYSEN_PRO_LAUF; i++) {
    if (Date.now() >= deadlineMs) break;

    const offen = await naechsteOffeneMail(postfach);
    if (!offen) break;

    const warte = naechsterStartErlaubt - Date.now();
    if (warte > 0) {
      if (Date.now() + warte >= deadlineMs) break;
      await warteMs(warte);
    }
    naechsterStartErlaubt = Date.now() + ANTHROPIC_MIN_ABSTAND_MS;

    let ok: boolean;
    try {
      ok = await analysiereEintrag(accessToken, postfach, offen);
    } catch (err) {
      console.error("[postfach] Unerwarteter Analysefehler", offen.id, err);
      abgebrochen = "persistenz";
      break;
    }

    if (ok) {
      analysiert += 1;
      fehlerInFolge = 0;
    } else {
      fehlgeschlagen += 1;
      fehlerInFolge += 1;
      console.error(
        "[postfach] Analyse fehlgeschlagen, überspringe",
        offen.id,
        `(${fehlerInFolge}/${NACHTLAUF_MAX_FEHLER_IN_FOLGE} in Folge)`,
      );
      if (fehlerInFolge >= NACHTLAUF_MAX_FEHLER_IN_FOLGE) {
        abgebrochen = "zu_viele_fehler";
        break;
      }
    }
  }

  const nochOffen = await zaehleOffene(postfach);
  return {
    analysiert,
    fehlgeschlagen,
    offen: nochOffen,
    fortsetzen: !abgebrochen && nochOffen > 0,
    abgebrochen,
    inboxSyncFehler,
  };
}
