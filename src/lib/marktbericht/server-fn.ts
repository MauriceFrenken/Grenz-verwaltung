/**
 * Server-Funktionen des Marktberichts. Kennzahlen werden beim Anlegen und beim Neuberechnen
 * eingefroren; freigegebene Berichte sind gesperrt. Zitierte Vergleichswerte und Bundesbank-Zinsen
 * landen zusätzlich in marktdaten, damit die eigene Datensammlung mit jedem Bericht wächst.
 */

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createServiceRoleClient,
  pruefeAufrufer,
  tokenAus,
} from "@/lib/server/aufrufer";
import { dateinameAus, type DateiErgebnis } from "@/lib/vorlagen/export";

import { berechneKennzahlen } from "./daten";
import {
  benchmarksZusammenfuehren,
  bibliothekAuswahl,
  DOKUMENT_SPALTEN,
  dokumentAus,
} from "./quellen";
import {
  periodeSchluessel,
  periodeText,
  TEXT_FASSUNG,
  texteLeer,
  type Benchmark,
  type MarktberichtInhalt,
  type MarktberichtKennzahlen,
  type MarktberichtStatus,
  type MarktberichtTexte,
  type Periode,
} from "./typen";

export type MarktberichtZeile = {
  id: string;
  periode: string;
  titel: string;
  status: MarktberichtStatus;
  stichtag: string;
  createdAt: string;
  updatedAt: string;
  freigegebenAm: string | null;
};

export type MarktberichtVoll = MarktberichtZeile & {
  kennzahlen: MarktberichtKennzahlen;
  inhalt: MarktberichtInhalt;
};

const SPALTEN =
  "id, periode, titel, status, stichtag, created_at, updated_at, freigegeben_am";

function zeile(r: Record<string, unknown>): MarktberichtZeile {
  return {
    id: String(r.id),
    periode: String(r.periode),
    titel: String(r.titel),
    status: r.status as MarktberichtStatus,
    stichtag: String(r.stichtag),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    freigegebenAm: (r.freigegeben_am as string) ?? null,
  };
}

function inhaltAus(roh: unknown): MarktberichtInhalt {
  const i = (roh ?? {}) as Partial<MarktberichtInhalt>;
  return {
    texte: i.texte ?? {},
    benchmarks: Array.isArray(i.benchmarks) ? i.benchmarks : [],
    ...(Array.isArray(i.uebernommen)
      ? { uebernommen: i.uebernommen.filter((x) => typeof x === "string") }
      : {}),
    ...(i.texteAutomatisch === true ? { texteAutomatisch: true } : {}),
    ...(i.texteFaellig === true ? { texteFaellig: true } : {}),
    ...(typeof i.textFassung === "number"
      ? { textFassung: i.textFassung }
      : {}),
  };
}

function voll(r: Record<string, unknown>): MarktberichtVoll {
  return {
    ...zeile(r),
    kennzahlen: r.kennzahlen as MarktberichtKennzahlen,
    inhalt: inhaltAus(r.inhalt),
  };
}

function tabelleFehlt(message: string): boolean {
  return (
    /marktberichte/.test(message) &&
    /does not exist|schema cache/i.test(message)
  );
}

function fehler(message: string): Error {
  return new Error(
    tabelleFehlt(message)
      ? "Die Datenbank-Tabelle für Marktberichte ist noch nicht angelegt (Migration 20261025150000_marktberichte)."
      : message,
  );
}

async function ladeVoll(
  admin: SupabaseClient,
  id: string,
): Promise<MarktberichtVoll> {
  const { data, error } = await admin
    .from("marktberichte")
    .select(`${SPALTEN}, kennzahlen, inhalt`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw fehler(error.message);
  if (!data) throw new Error("Marktbericht nicht gefunden.");
  return voll(data);
}

async function ladeEntwurf(
  admin: SupabaseClient,
  id: string,
): Promise<MarktberichtVoll> {
  const b = await ladeVoll(admin, id);
  if (b.status !== "entwurf")
    throw new Error(
      "Der Bericht ist freigegeben und kann nicht mehr geändert werden.",
    );
  return b;
}

function idAus(data: unknown): string {
  const id = (data as { id?: unknown })?.id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    throw new Error("Ungültige Bericht-Id.");
  return id;
}

function periodeAus(data: unknown): Periode {
  const p = (data as { periode?: Partial<Periode> })?.periode ?? {};
  const jahr = Number(p.jahr);
  if (!Number.isInteger(jahr) || jahr < 2020 || jahr > 2100)
    throw new Error("Ungültiges Berichtsjahr.");
  if (p.art !== "H1" && p.art !== "GJ") throw new Error("Ungültige Periode.");
  return { jahr, art: p.art };
}

function text(w: unknown, max: number): string | undefined {
  return typeof w === "string" ? w.slice(0, max) : undefined;
}

function schlagzeilenAus(roh: unknown): MarktberichtTexte["schlagzeilen"] {
  if (!roh || typeof roh !== "object") return undefined;
  const s = roh as Record<string, unknown>;
  return {
    rahmen: text(s.rahmen, 120),
    angebot: text(s.angebot, 120),
    nachfrage: text(s.nachfrage, 120),
    ausblick: text(s.ausblick, 120),
  };
}

function texteAus(roh: unknown): MarktberichtTexte {
  const t = (roh ?? {}) as Record<string, unknown>;
  const liste = (w: unknown, max: number) =>
    Array.isArray(w)
      ? w
          .filter((x): x is string => typeof x === "string")
          .slice(0, 6)
          .map((x) => x.slice(0, max))
      : undefined;
  const trends = Array.isArray(t.ausblickTrends)
    ? (t.ausblickTrends as Record<string, unknown>[])
        .filter(
          (x) =>
            typeof x?.kennzahl === "string" &&
            ["steigend", "stabil", "fallend"].includes(String(x.trend)) &&
            ["steigend", "stabil", "fallend"].includes(String(x.prognose)),
        )
        .slice(0, 8)
        .map((x) => ({
          kennzahl: String(x.kennzahl).slice(0, 80),
          trend: x.trend as "steigend",
          prognose: x.prognose as "steigend",
        }))
    : undefined;
  return {
    thesen: liste(t.thesen, 200),
    einleitung: text(t.einleitung, 1500),
    rahmen: text(t.rahmen, 3000),
    angebot: text(t.angebot, 3000),
    nachfrage: text(t.nachfrage, 3000),
    vermarktung: text(t.vermarktung, 3000),
    ausblick: text(t.ausblick, 3000),
    empfehlungen: liste(t.empfehlungen, 300),
    schlagzeilen: schlagzeilenAus(t.schlagzeilen),
    ausblickTrends: trends,
    pruefhinweise: liste(t.pruefhinweise, 400),
  };
}

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

function benchmarksAus(roh: unknown): Benchmark[] {
  if (!Array.isArray(roh)) return [];
  return (roh as Record<string, unknown>[])
    .slice(0, 60)
    .map((b): Benchmark | null => {
      const wert = Number(b.wert);
      const kennzahl = text(b.kennzahl, 120)?.trim();
      const quelle = text(b.quelle, 200)?.trim();
      const stichtag = text(b.stichtag, 10);
      if (!kennzahl || !quelle || !Number.isFinite(wert)) return null;
      if (!stichtag || !ISO_TAG.test(stichtag)) return null;
      const url = text(b.url, 500)?.trim();
      const veraenderung = text(b.veraenderung, 60)?.trim();
      const zitat = text(b.zitat, 400)?.trim();
      return {
        id:
          typeof b.id === "string" && b.id.length <= 40
            ? b.id
            : crypto.randomUUID(),
        kennzahl,
        region: text(b.region, 80)?.trim() ?? "",
        wert,
        einheit: text(b.einheit, 20)?.trim() ?? "",
        ...(veraenderung ? { veraenderung } : {}),
        quelle,
        stichtag,
        ...(Number.isInteger(b.seite) ? { seite: Number(b.seite) } : {}),
        ...(url && /^https:\/\//.test(url) ? { url } : {}),
        ...(zitat ? { zitat } : {}),
        geprueft: b.geprueft === true,
        ...(b.pruefung === "automatisch" || b.pruefung === "nutzer"
          ? { pruefung: b.pruefung }
          : {}),
        ...(Number.isFinite(Number(b.relevanz)) && b.relevanz != null
          ? { relevanz: Math.max(0, Math.min(100, Number(b.relevanz))) }
          : {}),
        ...(typeof b.dokumentId === "string" && b.dokumentId.length <= 40
          ? { dokumentId: b.dokumentId }
          : {}),
      };
    })
    .filter((b): b is Benchmark => b !== null);
}

function artAus(b: Benchmark): string {
  const k = `${b.kennzahl} ${b.einheit}`.toLowerCase();
  if (/rendite/.test(k)) return "spitzenrendite";
  if (/liegenschaftszins/.test(k)) return "liegenschaftszins";
  if (/faktor|vervielf/.test(k)) return "kaufpreisfaktor";
  if (/leerstand/.test(k)) return "leerstand";
  if (/miete/.test(k)) return "angebotsmiete";
  if (/volumen|umsatz/.test(k)) return "transaktionsvolumen";
  if (/kaufpreis|€\/m/.test(k)) return "kaufpreis";
  return "sonstiges";
}

/** Geprüfte Vergleichswerte und Zinsreihen in marktdaten spiegeln (Datensammlung). Fehler hier blockieren den Bericht nicht. */
async function marktdatenSpiegeln(
  admin: SupabaseClient,
  b: MarktberichtVoll,
): Promise<void> {
  const prefix = `marktbericht:${b.id}:`;
  const geprueft = b.inhalt.benchmarks.filter((x) => x.geprueft);
  const zeilen = [
    ...geprueft.map((x) => ({
      quelle: "research_bericht",
      quelle_ref: `${prefix}${x.id}`,
      art: artAus(x),
      ort: x.region || null,
      wert: x.wert,
      einheit: x.einheit || "–",
      stichtag: x.stichtag,
      periode: b.periode,
      beleg: {
        dokument: x.quelle,
        seite: x.seite ?? null,
        zitat: x.zitat ?? null,
        url: x.url ?? null,
        kennzahl: x.kennzahl,
        veraenderung: x.veraenderung ?? null,
      },
      lizenz: "zitat",
    })),
    ...b.kennzahlen.zinsen.reihen.flatMap((r) =>
      r.werte.map((w) => ({
        quelle: "bundesbank",
        quelle_ref: `${r.reihe}:${w.monat}`,
        art: "zins",
        ort: "Deutschland",
        wert: w.wert,
        einheit: r.einheit,
        stichtag: `${w.monat}-01`,
        periode: null,
        beleg: {
          dokument: r.quelle,
          url: `https://api.statistiken.bundesbank.de/rest/data/${r.reihe}`,
          kennzahl: r.label,
        },
        lizenz: "open",
      })),
    ),
  ];
  try {
    if (zeilen.length) {
      const { error } = await admin
        .from("marktdaten")
        .upsert(zeilen, { onConflict: "quelle,quelle_ref" });
      if (error) throw error;
    }
    const ids = geprueft.map((x) => `${prefix}${x.id}`);
    let loeschen = admin
      .from("marktdaten")
      .delete()
      .eq("quelle", "research_bericht")
      .like("quelle_ref", `${prefix}%`);
    if (ids.length)
      loeschen = loeschen.not(
        "quelle_ref",
        "in",
        `(${ids.map((i) => `"${i}"`).join(",")})`,
      );
    await loeschen;
  } catch (e) {
    console.warn("[marktbericht] marktdaten nicht aktualisiert:", e);
  }
}

export const marktberichteListeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ supabaseAccessToken: tokenAus(data) }))
  .handler(async ({ data }): Promise<MarktberichtZeile[]> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const { data: rows, error } = await createServiceRoleClient()
      .from("marktberichte")
      .select(SPALTEN)
      .order("periode", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw fehler(error.message);
    return (rows ?? []).map(zeile);
  });

/** Vergleichswerte aus der Bibliothek (automatisch belegt) für eine Periode. */
async function bibliothekFuer(
  admin: SupabaseClient,
  periode: Periode,
): Promise<Benchmark[]> {
  const [{ data: doks, error }, { data: quellen }] = await Promise.all([
    admin
      .from("marktbericht_dokumente")
      .select(DOKUMENT_SPALTEN)
      .eq("status", "ausgelesen")
      .limit(1000),
    admin.from("marktbericht_quellen").select("id, name"),
  ]);
  // Ohne Bibliothek-Tabelle (Migration fehlt) bleibt der Bericht ohne fremde Werte.
  if (error) return [];
  return bibliothekAuswahl(
    (doks ?? []).map(dokumentAus),
    periode,
    new Map((quellen ?? []).map((q) => [String(q.id), String(q.name)])),
  );
}

/** Bericht anlegen: Kennzahlen einfrieren, Vergleichswerte aus Vorversion und Bibliothek übernehmen. */
export async function berichtAnlegen(
  admin: SupabaseClient,
  periode: Periode,
  erstelltVon: string | null,
): Promise<MarktberichtZeile> {
  const kennzahlen = await berechneKennzahlen(admin, periode);
  // Vergleichswerte des letzten Berichts derselben Periode als Ausgangspunkt übernehmen.
  const { data: vorher } = await admin
    .from("marktberichte")
    .select("inhalt")
    .eq("periode", periodeSchluessel(periode))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { benchmarks } = benchmarksZusammenfuehren(
    vorher ? inhaltAus(vorher.inhalt).benchmarks : [],
    await bibliothekFuer(admin, periode),
  );
  const inhalt: MarktberichtInhalt = {
    texte: {},
    benchmarks,
    uebernommen: benchmarks.map((b) => b.id),
  };
  const { data: row, error } = await admin
    .from("marktberichte")
    .insert({
      periode: periodeSchluessel(periode),
      titel: `Marktbericht Zinshäuser Rheinland ${periodeText(periode)}`,
      stichtag: kennzahlen.stichtag,
      kennzahlen,
      inhalt,
      erstellt_von: erstelltVon,
    })
    .select(SPALTEN)
    .single();
  if (error) throw fehler(error.message);
  return zeile(row);
}

/**
 * Automatischer Entwurf: ab 1. August für das erste Halbjahr, ab 1. Februar für das Vorjahr,
 * sobald die großen Häuser ihre Zahlen veröffentlicht haben. Legt nur an, wenn es für die
 * Periode noch keinen Bericht gibt, und schreibt die Texte mit der KI vor. Freigeben bleibt beim Nutzer.
 */
export async function automatischerEntwurf(
  admin: SupabaseClient,
  heute = new Date(),
): Promise<string | null> {
  const jahr = heute.getUTCFullYear();
  const monat = heute.getUTCMonth() + 1;
  const periode: Periode =
    monat >= 8
      ? { jahr, art: "H1" }
      : monat >= 2
        ? { jahr: jahr - 1, art: "GJ" }
        : { jahr: jahr - 1, art: "H1" };
  const { data: da, error } = await admin
    .from("marktberichte")
    .select("id")
    .eq("periode", periodeSchluessel(periode))
    .limit(1);
  if (error) throw fehler(error.message);
  if (da?.length) return null;
  // Erst wenn jede aktive Quelle einmal durchsucht ist, sonst fehlen die Vergleichswerte.
  const { count: offen } = await admin
    .from("marktbericht_quellen")
    .select("id", { count: "exact", head: true })
    .eq("aktiv", true)
    .is("zuletzt_gesucht", null);
  if (offen) return null;
  const neu = await berichtAnlegen(admin, periode, null);
  await automatischSchreiben(admin, neu.id);
  return neu.id;
}

/**
 * Kompletter Entwurf ohne Zutun: Kennzahlen neu berechnen und alle Texte von der KI schreiben
 * lassen. Vergleichswerte bleiben, wie sie sind. Die Texte gelten als automatisch, bis jemand sie ändert.
 */
export async function automatischSchreiben(
  admin: SupabaseClient,
  id: string,
): Promise<MarktberichtVoll> {
  const b = await ladeEntwurf(admin, id);
  const kennzahlen = await berechneKennzahlen(admin, b.kennzahlen.periode);
  const { texteEntwurf } = await import("./ki");
  const texte = await texteEntwurf(kennzahlen, b.inhalt.benchmarks);
  // Erneut lesen: Während die KI schreibt, kann jemand gespeichert haben.
  const jetzt = await ladeEntwurf(admin, id);
  if (!texteLeer(jetzt.inhalt.texte) && !jetzt.inhalt.texteAutomatisch)
    return jetzt;
  const inhalt: MarktberichtInhalt = {
    ...jetzt.inhalt,
    texte,
    texteAutomatisch: true,
    textFassung: TEXT_FASSUNG,
  };
  delete inhalt.texteFaellig;
  const { error } = await admin
    .from("marktberichte")
    .update({ kennzahlen, stichtag: kennzahlen.stichtag, inhalt })
    .eq("id", id);
  if (error) throw fehler(error.message);
  return ladeVoll(admin, id);
}

/**
 * Cron: höchstens einen offenen Entwurf vervollständigen, der noch keine Texte hat oder dessen
 * unveränderte KI-Texte neue Vergleichswerte oder neue KI-Vorgaben (TEXT_FASSUNG) noch nicht kennen.
 */
export async function entwurfTexteNachziehen(
  admin: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await admin
    .from("marktberichte")
    .select("id, inhalt")
    .eq("status", "entwurf")
    .order("updated_at", { ascending: false });
  if (error) throw fehler(error.message);
  const offen = (data ?? []).find((r) => {
    const i = inhaltAus(r.inhalt);
    return (
      texteLeer(i.texte) ||
      (i.texteAutomatisch &&
        (i.texteFaellig || (i.textFassung ?? 1) < TEXT_FASSUNG))
    );
  });
  if (!offen) return null;
  await automatischSchreiben(admin, String(offen.id));
  return String(offen.id);
}

/**
 * Offene Entwürfe um neu belegte Bibliothekswerte ihrer Periode ergänzen. Vorhandene Werte und
 * Texte bleiben unverändert; entfernte Werte kommen nur zurück, wenn die Bibliothek sie neu liefert.
 */
export async function entwuerfeAktualisieren(
  admin: SupabaseClient,
): Promise<number> {
  const { data, error } = await admin
    .from("marktberichte")
    .select("id, kennzahlen, inhalt")
    .eq("status", "entwurf");
  if (error) throw fehler(error.message);
  let aktualisiert = 0;
  for (const r of data ?? []) {
    const periode = (r.kennzahlen as MarktberichtKennzahlen).periode;
    const inhalt = inhaltAus(r.inhalt);
    const bekannt = new Set(
      (inhalt.uebernommen ?? []).concat(inhalt.benchmarks.map((b) => b.id)),
    );
    const neu = (await bibliothekFuer(admin, periode)).filter(
      (b) => !bekannt.has(b.id),
    );
    const { benchmarks, hinzugefuegt } = benchmarksZusammenfuehren(
      inhalt.benchmarks,
      neu,
    );
    if (!hinzugefuegt) continue;
    const { error: e } = await admin
      .from("marktberichte")
      .update({
        inhalt: {
          ...inhalt,
          benchmarks,
          uebernommen: [...bekannt, ...neu.map((b) => b.id)].slice(-500),
          ...(inhalt.texteAutomatisch ? { texteFaellig: true } : {}),
        },
      })
      .eq("id", r.id);
    if (!e) aktualisiert++;
  }
  return aktualisiert;
}

export const marktberichtAnlegenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    periode: periodeAus(data),
  }))
  .handler(async ({ data }): Promise<MarktberichtZeile> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    return berichtAnlegen(
      createServiceRoleClient(),
      data.periode,
      aufrufer.userId === "cron" ? null : aufrufer.userId,
    );
  });

export const marktberichtLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: idAus(data),
  }))
  .handler(async ({ data }): Promise<MarktberichtVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    return ladeVoll(createServiceRoleClient(), data.id);
  });

export const marktberichtNeuBerechnenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: idAus(data),
  }))
  .handler(async ({ data }): Promise<MarktberichtVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const b = await ladeEntwurf(admin, data.id);
    const kennzahlen = await berechneKennzahlen(admin, b.kennzahlen.periode);
    const { error } = await admin
      .from("marktberichte")
      .update({ kennzahlen, stichtag: kennzahlen.stichtag })
      .eq("id", data.id);
    if (error) throw fehler(error.message);
    return ladeVoll(admin, data.id);
  });

export const marktberichtSpeichernFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { texte?: unknown; benchmarks?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      id: idAus(data),
      texte: texteAus(d.texte),
      benchmarks: benchmarksAus(d.benchmarks),
    };
  })
  .handler(async ({ data }): Promise<MarktberichtVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    const vorher = await ladeEntwurf(admin, data.id);
    // Wer die Texte ändert, übernimmt sie: danach schreibt die KI sie nicht mehr automatisch neu.
    const unveraendert =
      JSON.stringify(texteAus(vorher.inhalt.texte)) ===
      JSON.stringify(data.texte);
    const inhalt: MarktberichtInhalt = {
      texte: data.texte,
      benchmarks: data.benchmarks,
      ...(vorher.inhalt.uebernommen
        ? { uebernommen: vorher.inhalt.uebernommen }
        : {}),
      ...(vorher.inhalt.texteAutomatisch && unveraendert
        ? {
            texteAutomatisch: true,
            ...(vorher.inhalt.texteFaellig ? { texteFaellig: true } : {}),
            ...(vorher.inhalt.textFassung
              ? { textFassung: vorher.inhalt.textFassung }
              : {}),
          }
        : {}),
    };
    const { error } = await admin
      .from("marktberichte")
      .update({ inhalt })
      .eq("id", data.id);
    if (error) throw fehler(error.message);
    const b = await ladeVoll(admin, data.id);
    await marktdatenSpiegeln(admin, b);
    return b;
  });

export const marktberichtKiTexteFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { benchmarks?: unknown };
    return {
      supabaseAccessToken: tokenAus(data),
      id: idAus(data),
      benchmarks: benchmarksAus(d.benchmarks),
    };
  })
  .handler(async ({ data }): Promise<MarktberichtTexte> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const b = await ladeEntwurf(createServiceRoleClient(), data.id);
    const { texteEntwurf } = await import("./ki");
    return texteEntwurf(b.kennzahlen, data.benchmarks);
  });

/**
 * Chat im Editor: Die KI überarbeitet die aktuellen (auch ungespeicherten) Texte nach einer
 * Anweisung. Das Ergebnis wird nicht gespeichert; der Editor übernimmt und speichert es.
 */
export const marktberichtChatFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      texte?: unknown;
      benchmarks?: unknown;
      anweisung?: unknown;
      verlauf?: unknown;
    };
    const anweisung =
      typeof d.anweisung === "string" ? d.anweisung.trim().slice(0, 2000) : "";
    if (!anweisung) throw new Error("Bitte eine Anweisung eingeben.");
    const verlauf = Array.isArray(d.verlauf)
      ? (d.verlauf as Record<string, unknown>[])
          .filter(
            (v) =>
              typeof v?.anweisung === "string" &&
              typeof v?.antwort === "string",
          )
          .slice(-6)
          .map((v) => ({
            anweisung: String(v.anweisung).slice(0, 2000),
            antwort: String(v.antwort).slice(0, 1000),
          }))
      : [];
    return {
      supabaseAccessToken: tokenAus(data),
      id: idAus(data),
      texte: texteAus(d.texte),
      benchmarks: benchmarksAus(d.benchmarks),
      anweisung,
      verlauf,
    };
  })
  .handler(
    async ({
      data,
    }): Promise<{ texte: MarktberichtTexte; antwort: string }> => {
      await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
      const b = await ladeEntwurf(createServiceRoleClient(), data.id);
      const { texteUeberarbeiten } = await import("./ki");
      return texteUeberarbeiten(
        b.kennzahlen,
        data.benchmarks,
        data.texte,
        data.anweisung,
        data.verlauf,
      );
    },
  );

/** Kompletten Entwurf schreiben: Kennzahlen neu berechnen, alle Texte per KI, direkt gespeichert. */
export const marktberichtAutoEntwurfFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: idAus(data),
  }))
  .handler(async ({ data }): Promise<MarktberichtVoll> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    return automatischSchreiben(createServiceRoleClient(), data.id);
  });

/** PDF eines fremden Marktberichts: Kennzahlen mit Seite und Zitat auslesen (ungeprüft). */
export const marktberichtPdfAuslesenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { base64?: unknown; dateiname?: unknown };
    const base64 = typeof d.base64 === "string" ? d.base64 : "";
    if (!base64) throw new Error("Keine Datei übergeben.");
    // Vercel nimmt höchstens 4,5 MB je Anfrage an; Base64 macht die Datei ein Drittel größer.
    if (base64.length > 4_200_000)
      throw new Error(
        "Die PDF ist größer als 3 MB. Bitte nur die Seiten mit den Kennzahlen hochladen.",
      );
    return {
      supabaseAccessToken: tokenAus(data),
      base64,
      dateiname: (typeof d.dateiname === "string"
        ? d.dateiname
        : "Marktbericht.pdf"
      ).slice(0, 160),
    };
  })
  .handler(async ({ data }): Promise<Benchmark[]> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    if (!data.base64.startsWith("JVBER"))
      throw new Error("Bitte eine PDF-Datei hochladen.");
    const { pdfAuslesen } = await import("./quellen-lauf");
    const { werte } = await pdfAuslesen(
      new Uint8Array(Buffer.from(data.base64, "base64")),
      data.dateiname,
    );
    return werte;
  });

export const marktberichtFreigebenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: idAus(data),
  }))
  .handler(async ({ data }): Promise<MarktberichtVoll> => {
    const aufrufer = await pruefeAufrufer(
      data.supabaseAccessToken,
      "schreiben",
    );
    if (aufrufer.userId === "cron")
      throw new Error("Freigeben kann nur ein Nutzer.");
    const admin = createServiceRoleClient();
    const b = await ladeEntwurf(admin, data.id);
    if (b.inhalt.benchmarks.some((x) => !x.geprueft))
      throw new Error(
        "Es gibt noch ungeprüfte Vergleichswerte. Bitte bestätigen oder entfernen.",
      );
    const { error } = await admin
      .from("marktberichte")
      .update({
        status: "freigegeben",
        freigegeben_von: aufrufer.userId,
        freigegeben_am: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw fehler(error.message);
    return ladeVoll(admin, data.id);
  });

export const marktberichtLoeschenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: idAus(data),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await pruefeAufrufer(data.supabaseAccessToken, "schreiben");
    const admin = createServiceRoleClient();
    await ladeEntwurf(admin, data.id);
    const { error } = await admin
      .from("marktberichte")
      .delete()
      .eq("id", data.id);
    if (error) throw fehler(error.message);
    await admin
      .from("marktdaten")
      .delete()
      .eq("quelle", "research_bericht")
      .like("quelle_ref", `marktbericht:${data.id}:%`);
    return { ok: true };
  });

export const marktberichtPdfFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({
    supabaseAccessToken: tokenAus(data),
    id: idAus(data),
  }))
  .handler(async ({ data }): Promise<DateiErgebnis> => {
    await pruefeAufrufer(data.supabaseAccessToken);
    const b = await ladeVoll(createServiceRoleClient(), data.id);
    const { marktberichtAlsPdf } = await import("./pdf");
    const datei = await marktberichtAlsPdf(b);
    return {
      dateiname: dateinameAus(b.titel, "pdf"),
      mime: "application/pdf",
      base64: datei.toString("base64"),
    };
  });
