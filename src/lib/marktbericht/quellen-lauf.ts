/**
 * Automatische Bibliothek: fällige Quelle durchsuchen, neue Berichte herunterladen, Kennzahlen
 * auslesen und Zitate gegen den Originaltext prüfen. Läuft per Cron und per „Jetzt suchen“.
 * Server-only. Dateien werden nicht gespeichert, nur URL, Prüfsumme und Kennzahlen.
 */

import { createHash } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { benchmarksAusDokument, type DokumentInhalt } from "./ki";
import {
  DOKUMENT_SPALTEN,
  dokumentAus,
  htmlZuText,
  istSperrseite,
  QUELLE_SPALTEN,
  quelleAus,
  sichereUrl,
  zitatBelegt,
  type DokumentStatus,
  type MarktberichtDokument,
  type MarktberichtQuelle,
} from "./quellen";
import { berichteSuchen, perKiAbrufen } from "./quellen-ki";
import type { Benchmark } from "./typen";

/** Eine Quelle wird höchstens einmal pro Woche durchsucht. */
const SUCHINTERVALL_TAGE = 7;
const MAX_VERSUCHE = 3;
const MAX_BYTES = 40 * 1024 * 1024;
/** PDF direkt an die KI bis zu dieser Größe; größere gehen als Text mit Seitenmarken. */
const PDF_DIREKT_BYTES = 20 * 1024 * 1024;
const PDF_DIREKT_SEITEN = 100;
const MAX_TEXT = 400_000;
/** Typische Dauer einer Suche bzw. Auslese; danach startet kein neuer Schritt. */
const SUCHE_MS = 150_000;
const AUSLESE_MS = 100_000;
const UA =
  "Mozilla/5.0 (compatible; GrenzCoMarktbericht/1.0; +https://www.grenz-co.de)";

type Geladen =
  | { typ: "pdf"; bytes: Uint8Array; url: string }
  | { typ: "html"; html: string; url: string }
  | { typ: "text"; text: string; url: string }
  | { typ: "gesperrt"; grund: string };

class Abbruch extends Error {}

/**
 * Die KI ist gerade nicht nutzbar (Guthaben leer, Schlüssel fehlt, Überlastung, Netz). Dann
 * zählt nichts als erledigt: Quelle und Dokument bleiben fällig und der nächste Lauf versucht es neu.
 */
export function istKiAusfall(e: unknown): boolean {
  if (e instanceof Anthropic.APIConnectionError) return true;
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? 0;
    return (
      [401, 402, 403, 429].includes(status) ||
      status >= 500 ||
      /credit balance|billing/i.test(e.message)
    );
  }
  return e instanceof Error && /ANTHROPIC_API_KEY/.test(e.message);
}

/** Lädt eine Adresse; Weiterleitungen werden einzeln geprüft (keine internen Ziele). */
async function laden(start: string): Promise<Geladen> {
  let url = sichereUrl(start);
  for (let sprung = 0; sprung < 6 && url; sprung++) {
    const antwort = await fetch(url, {
      redirect: "manual",
      headers: {
        "user-agent": UA,
        accept: "application/pdf,text/html;q=0.9,*/*;q=0.5",
        "accept-language": "de-DE,de;q=0.9",
      },
      signal: AbortSignal.timeout(45_000),
    });
    if (antwort.status >= 300 && antwort.status < 400) {
      const ziel = antwort.headers.get("location");
      url = ziel ? sichereUrl(new URL(ziel, url).toString()) : null;
      continue;
    }
    if ([401, 402, 403].includes(antwort.status))
      return { typ: "gesperrt", grund: `HTTP ${antwort.status}` };
    if (!antwort.ok) throw new Abbruch(`HTTP ${antwort.status}`);
    const laenge = Number(antwort.headers.get("content-length") ?? 0);
    if (laenge > MAX_BYTES) throw new Abbruch("Datei größer als 40 MB");
    const bytes = new Uint8Array(await antwort.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES)
      throw new Abbruch("Datei größer als 40 MB");
    const typ = antwort.headers.get("content-type") ?? "";
    const istPdf =
      /application\/pdf/i.test(typ) ||
      new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
    if (istPdf) return { typ: "pdf", bytes, url };
    if (/text\/html|application\/xhtml/i.test(typ) || !typ)
      return { typ: "html", html: new TextDecoder().decode(bytes), url };
    throw new Abbruch(`Unbekanntes Format ${typ.split(";")[0]}`);
  }
  throw new Abbruch(url ? "Zu viele Weiterleitungen" : "Adresse nicht erlaubt");
}

/**
 * Direkter Download; weist die Seite unseren Server ab (403, Bot-Schutz), holt Anthropic sie
 * über web_fetch. Liefert auch das nichts, gilt der Bericht als gesperrt.
 */
async function ladenMitErsatz(url: string): Promise<Geladen> {
  let direkt: Geladen | null = null;
  let fehler: unknown = null;
  try {
    direkt = await laden(url);
    if (direkt.typ !== "gesperrt") return direkt;
  } catch (e) {
    // Nicht vorhanden, zu groß oder falsches Format: der Ersatzweg hilft nicht.
    if (e instanceof Abbruch && !/HTTP (429|5\d\d)/.test(e.message)) throw e;
    fehler = e;
  }
  const ki = await perKiAbrufen(url).catch((e) => {
    if (istKiAusfall(e)) throw e;
    return null;
  });
  if (ki?.typ === "pdf") return { typ: "pdf", bytes: ki.bytes, url: ki.url };
  if (ki?.typ === "text" && ki.text.length > 300)
    return { typ: "text", text: ki.text, url: ki.url };
  if (fehler) throw fehler;
  return direkt ?? { typ: "gesperrt", grund: "Abruf abgewiesen" };
}

async function pdfSeiten(bytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).map((t) =>
    (t ?? "").replace(/\s+/g, " ").trim(),
  );
}

function mitSeitenmarken(seiten: string[]): string {
  return seiten
    .map((t, i) => `=== Seite ${i + 1} ===\n${t}`)
    .join("\n\n")
    .slice(0, MAX_TEXT);
}

/** Zitate gegen den Originaltext prüfen; belegte Werte gelten als geprüft. */
export function automatischPruefen(
  werte: Benchmark[],
  seiten: string[],
): Benchmark[] {
  return werte.map((b) =>
    zitatBelegt(b, seiten)
      ? { ...b, geprueft: true, pruefung: "automatisch" as const }
      : { ...b, geprueft: false },
  );
}

/** PDF-Bytes auslesen und automatisch prüfen (auch für Uploads im Editor). */
export async function pdfAuslesen(
  bytes: Uint8Array,
  titel: string,
  url?: string,
): Promise<{ werte: Benchmark[]; seiten: number }> {
  const seiten = await pdfSeiten(bytes).catch(() => [] as string[]);
  const inhalt: DokumentInhalt =
    bytes.byteLength <= PDF_DIREKT_BYTES &&
    (seiten.length === 0 || seiten.length <= PDF_DIREKT_SEITEN)
      ? { pdfBase64: Buffer.from(bytes).toString("base64") }
      : { text: mitSeitenmarken(seiten), art: "pdf" };
  const werte = await benchmarksAusDokument(inhalt, titel, url);
  return { werte: automatischPruefen(werte, seiten), seiten: seiten.length };
}

async function dokumentAuslesen(
  admin: SupabaseClient,
  dok: MarktberichtDokument & { versuche?: number },
): Promise<DokumentStatus> {
  const fertig = async (
    status: DokumentStatus,
    felder: Record<string, unknown> = {},
  ) => {
    await admin
      .from("marktbericht_dokumente")
      .update({ status, ausgelesen_am: new Date().toISOString(), ...felder })
      .eq("id", dok.id);
    return status;
  };
  try {
    const geladen = await ladenMitErsatz(dok.url);
    if (geladen.typ === "gesperrt")
      return fertig("gesperrt", {
        fehler: `Nur mit Anmeldung (${geladen.grund})`,
      });

    let werte: Benchmark[];
    let seitenZahl: number;
    let sha: string;
    if (geladen.typ === "pdf") {
      sha = createHash("sha256").update(geladen.bytes).digest("hex");
      const r = await pdfAuslesen(geladen.bytes, dok.titel, dok.url);
      werte = r.werte;
      seitenZahl = r.seiten;
    } else {
      const html = geladen.typ === "html" ? geladen.html : "";
      const text = geladen.typ === "html" ? htmlZuText(html) : geladen.text;
      if (istSperrseite(html, text))
        return fertig("gesperrt", {
          art: "html",
          fehler: "Bericht nur gegen Registrierung",
        });
      if (text.length < 300)
        return fertig("ohne_werte", { art: "html", fehler: "Seite ohne Text" });
      sha = createHash("sha256").update(text).digest("hex");
      const roh = await benchmarksAusDokument(
        { text: text.slice(0, MAX_TEXT), art: "html" },
        dok.titel,
        dok.url,
      );
      werte = automatischPruefen(roh, [text]);
      seitenZahl = 1;
    }

    // Dasselbe Dokument unter anderer Adresse schon ausgelesen: nicht doppelt zählen.
    const { data: gleich } = await admin
      .from("marktbericht_dokumente")
      .select("id")
      .eq("sha256", sha)
      .neq("id", dok.id)
      .limit(1);
    if (gleich?.length)
      return fertig("ohne_werte", {
        sha256: sha,
        fehler: "Dublette eines erfassten Dokuments",
      });

    const stichtag = dok.stichtag ?? werte[0]?.stichtag ?? null;
    return fertig(werte.length ? "ausgelesen" : "ohne_werte", {
      art: geladen.typ === "pdf" ? "pdf" : "html",
      sha256: sha,
      seiten: seitenZahl,
      stichtag,
      kennzahlen: werte.map((w) => ({
        ...w,
        stichtag: stichtag ?? w.stichtag,
      })),
      fehler: null,
    });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    if (istKiAusfall(e)) {
      // Kein Versuch verbraucht: das Dokument bleibt „neu“ für den nächsten Lauf.
      await admin
        .from("marktbericht_dokumente")
        .update({ fehler: `KI nicht verfügbar: ${meldung}`.slice(0, 500) })
        .eq("id", dok.id);
      throw e;
    }
    const versuche = (dok.versuche ?? 0) + 1;
    await admin
      .from("marktbericht_dokumente")
      .update({
        versuche,
        fehler: meldung.slice(0, 500),
        status:
          versuche >= MAX_VERSUCHE || e instanceof Abbruch ? "fehler" : "neu",
      })
      .eq("id", dok.id);
    return "fehler";
  }
}

/** Neue Berichte einer Quelle suchen und als „neu“ eintragen. */
async function quelleDurchsuchen(
  admin: SupabaseClient,
  quelle: MarktberichtQuelle,
): Promise<number> {
  const { data: bekannt } = await admin
    .from("marktbericht_dokumente")
    .select("url")
    .eq("quelle_id", quelle.id)
    .order("gefunden_am", { ascending: false })
    .limit(40);
  try {
    const { funde } = await berichteSuchen(
      quelle,
      (bekannt ?? []).map((d) => String(d.url)),
    );
    const zeilen = funde
      .map((f) => ({ ...f, url: sichereUrl(f.url) }))
      .filter((f): f is typeof f & { url: string } => !!f.url && !!f.titel)
      .map((f) => ({
        quelle_id: quelle.id,
        url: f.url,
        titel: f.titel,
        art: f.art,
        stichtag: f.stichtag,
        region: f.region,
      }));
    let neu = 0;
    if (zeilen.length) {
      const { data, error } = await admin
        .from("marktbericht_dokumente")
        .upsert(zeilen, { onConflict: "url", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(error.message);
      neu = data?.length ?? 0;
    }
    await admin
      .from("marktbericht_quellen")
      .update({
        zuletzt_gesucht: new Date().toISOString(),
        letzter_fehler: null,
      })
      .eq("id", quelle.id);
    return neu;
  } catch (e) {
    // KI-Ausfall: Quelle bleibt sofort fällig. Andere Fehler: in einem Tag erneut versuchen.
    const ausfall = istKiAusfall(e);
    await admin
      .from("marktbericht_quellen")
      .update({
        ...(ausfall
          ? {}
          : {
              zuletzt_gesucht: new Date(
                Date.now() - (SUCHINTERVALL_TAGE - 1) * 86_400_000,
              ).toISOString(),
            }),
        letzter_fehler: (e instanceof Error ? e.message : String(e)).slice(
          0,
          500,
        ),
      })
      .eq("id", quelle.id);
    throw e;
  }
}

export type LaufErgebnis = {
  durchsucht: string[];
  neueDokumente: number;
  ausgelesen: number;
  gesperrt: number;
  fehler: number;
  /** Gesetzt, wenn der Lauf wegen eines KI-Ausfalls abgebrochen wurde. */
  kiAusfall?: string;
};

/**
 * Ein Lauf: eine fällige (oder die gewählte) Quelle durchsuchen, dann offene Dokumente auslesen,
 * solange die Zeit reicht. Was nicht fertig wird, übernimmt der nächste Lauf.
 */
export async function quellenLauf(
  admin: SupabaseClient,
  optionen: { quelleId?: string; deadlineMs: number; ohneSuche?: boolean },
): Promise<LaufErgebnis> {
  const ergebnis: LaufErgebnis = {
    durchsucht: [],
    neueDokumente: 0,
    ausgelesen: 0,
    gesperrt: 0,
    fehler: 0,
  };
  const rest = () => optionen.deadlineMs - Date.now();

  let abfrage = admin.from("marktbericht_quellen").select(QUELLE_SPALTEN);
  if (optionen.quelleId) abfrage = abfrage.eq("id", optionen.quelleId);
  else
    abfrage = abfrage
      .eq("aktiv", true)
      .or(
        `zuletzt_gesucht.is.null,zuletzt_gesucht.lt.${new Date(Date.now() - SUCHINTERVALL_TAGE * 86_400_000).toISOString()}`,
      );
  const { data: quellen, error } = await abfrage
    .order("zuletzt_gesucht", { ascending: true, nullsFirst: true })
    .limit(1);
  if (error) throw new Error(error.message);

  const quelle = quellen?.[0] ? quelleAus(quellen[0]) : null;
  if (quelle && !optionen.ohneSuche && rest() > SUCHE_MS) {
    ergebnis.neueDokumente += await quelleDurchsuchen(admin, quelle).catch(
      (e) => {
        console.warn(`[marktbericht-quellen] ${quelle.kuerzel}:`, e);
        ergebnis.fehler++;
        if (istKiAusfall(e))
          ergebnis.kiAusfall = e instanceof Error ? e.message : String(e);
        return 0;
      },
    );
    ergebnis.durchsucht.push(quelle.name);
  }

  const versucht: string[] = [];
  while (!ergebnis.kiAusfall && rest() > AUSLESE_MS) {
    let offen = admin
      .from("marktbericht_dokumente")
      .select(`${DOKUMENT_SPALTEN}, versuche`)
      .eq("status", "neu");
    if (optionen.quelleId) offen = offen.eq("quelle_id", optionen.quelleId);
    // Jedes Dokument höchstens einmal je Lauf.
    if (versucht.length)
      offen = offen.not("id", "in", `(${versucht.join(",")})`);
    const { data } = await offen
      .order("versuche", { ascending: true })
      .order("gefunden_am", { ascending: true })
      .limit(1);
    if (!data?.length) break;
    const dok = { ...dokumentAus(data[0]), versuche: Number(data[0].versuche) };
    versucht.push(dok.id);
    let status: DokumentStatus;
    try {
      status = await dokumentAuslesen(admin, dok);
    } catch (e) {
      ergebnis.kiAusfall = e instanceof Error ? e.message : String(e);
      ergebnis.fehler++;
      break;
    }
    if (status === "ausgelesen" || status === "ohne_werte")
      ergebnis.ausgelesen++;
    else if (status === "gesperrt") ergebnis.gesperrt++;
    else ergebnis.fehler++;
  }
  return ergebnis;
}
