/**
 * Entdeckung neuer Investoren per KI-Websuche: Wer hat 2025/2026 Wohn- oder Wohn-/Geschäftshäuser
 * in NRW gekauft oder sucht sie mit aktuellem Ankaufsprofil? Jeder Fund braucht eine Quelle aus
 * den tatsächlichen Suchergebnissen. Neue Firmen landen als Liste „recherche“ in investor_quellen
 * und durchlaufen danach dieselbe Existenz- und Insolvenzprüfung wie alle anderen. Server-only.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalisiereFirma, normalisiereUrl } from "@/lib/markt-radar/abgleich";

import { INVESTOR_TYPEN } from "./bereinigung";

const MODELL = "claude-opus-5-5";
const MAX_FORTSETZUNGEN = 4;

/** Suchfelder, eines je Lauf im Wechsel, damit jede Woche andere Ecken des Markts drankommen. */
export const SUCHFELDER = [
  "Käufer von Mehrfamilienhäusern und Wohnportfolios im Ruhrgebiet (Dortmund, Essen, Bochum, Duisburg, Gelsenkirchen, Oberhausen) mit Ankauf 2025 oder 2026",
  "Käufer von Wohn- und Geschäftshäusern im Rheinland (Düsseldorf, Köln, Bonn, Mönchengladbach, Krefeld, Neuss) mit Ankauf 2025 oder 2026",
  "Family Offices und Privatinvestoren mit veröffentlichtem Ankaufsprofil für Wohnimmobilien in NRW, Volumen etwa 1 bis 20 Mio. €",
  "Bestandshalter und Wohnungsunternehmen, die 2026 aktiv Wohnungsbestände in Nordrhein-Westfalen zukaufen (Pressemitteilungen, Fachpresse)",
  "Fonds, KVGs und institutionelle Anleger mit Ankäufen von Wohnimmobilien in NRW-Mittelstädten (Münster, Bielefeld, Aachen, Wuppertal, Hagen, Siegen) 2025 oder 2026",
  "Käufer von Wohnimmobilien aus Transaktionsmeldungen von Maklern in NRW (Deal-Magazin, Immobilien Zeitung, Thomas Daily, Pressemitteilungen) 2026",
] as const;

const NUTZUNGEN = ["Wohnen", "Wohn-/ Geschäftshaus", "Büro", "Einzelhandel", "Pflege", "Studentenwohnen", "Grundstück"] as const;

const SYSTEM = `Du recherchierst für Grenz & Co. (Investmentmakler für Wohn- und Wohn-/Geschäftshäuser in NRW, Objekte meist 1 bis 20 Mio. €) neue Investoren.

Gesucht sind Käufer, also Firmen, die selbst Immobilien erwerben: Family Offices, Bestandshalter, Wohnungsunternehmen, Fonds/KVGs, Projektentwickler mit Bestandsankauf, semiprofessionelle Investoren. Keine Makler, Berater, Banken, Hausverwaltungen oder reine Vermittlungsportale.

Für jede Firma brauchst du einen Beleg aus 2025 oder 2026: eine Transaktionsmeldung mit ihr als Käufer oder ein aktuelles Ankaufsprofil auf ihrer Website. Nenne die exakte Quell-URL. Ohne Beleg nicht aufnehmen. Gib Sitz, Website und, falls genannt, Volumen, Nutzungen und Regionen an. Keine Personen, nur Firmen.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["firmen"],
  properties: {
    firmen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["firma", "ort", "webseite", "typ", "nutzungen", "volumenMin", "volumenMax", "regionen", "nrw", "beleg", "quelleUrl", "letzteAktivitaet"],
        properties: {
          firma: { type: "string" },
          ort: { type: ["string", "null"] },
          webseite: { type: ["string", "null"] },
          typ: { type: ["string", "null"], enum: [...INVESTOR_TYPEN.filter((t) => t !== "Privat"), null] },
          nutzungen: { type: "array", items: { type: "string", enum: [...NUTZUNGEN] } },
          volumenMin: { type: ["number", "null"], description: "in Euro" },
          volumenMax: { type: ["number", "null"], description: "in Euro" },
          regionen: { type: "array", items: { type: "string" } },
          nrw: { type: "boolean", description: "Kauft nachweislich in NRW oder hat Sitz in NRW" },
          beleg: { type: "string", description: "Ein Satz: was wann gekauft oder gesucht wird" },
          quelleUrl: { type: "string" },
          letzteAktivitaet: { type: ["string", "null"], description: "z. B. „05/2026 Ankauf 40 WE in Essen“" },
        },
      },
    },
  },
} as const;

export type EntdeckterInvestor = {
  firma: string;
  ort: string | null;
  webseite: string | null;
  typ: string | null;
  nutzungen: string[];
  volumenMin: number | null;
  volumenMax: number | null;
  regionen: string[];
  nrw: boolean;
  beleg: string;
  quelleUrl: string;
  letzteAktivitaet: string | null;
};

/** Gleiche Gewichtung wie scripts/investoren-quellen/aufbereiten.py, ohne E-Mail (Recherche liefert keine). */
export function passungRecherche(f: Pick<EntdeckterInvestor, "nrw" | "nutzungen" | "volumenMin" | "volumenMax" | "typ">): number {
  let p = f.nrw ? 40 : 0;
  if (f.nutzungen.includes("Wohnen") || f.nutzungen.includes("Wohn-/ Geschäftshaus")) p += 25;
  const min = f.volumenMin ?? 0;
  const max = f.volumenMax ?? 1e12;
  if (min <= 20_000_000 && max >= 1_000_000) p += 20;
  if (f.typ) p += 5;
  return Math.min(p, 100);
}

/** Behält nur Funde mit belegter Quelle und ohne bekannte Firma; je Firma ein Eintrag. */
export function fundeFiltern(funde: EntdeckterInvestor[], gefundeneUrls: Iterable<string>, bekannt: Set<string>): EntdeckterInvestor[] {
  const urls = new Set([...gefundeneUrls].map((u) => normalisiereUrl(u)).filter(Boolean));
  const gesehen = new Set<string>();
  return funde.filter((f) => {
    const kern = normalisiereFirma(f.firma);
    if (kern.length < 3 || bekannt.has(kern) || gesehen.has(kern)) return false;
    if (!urls.has(normalisiereUrl(f.quelleUrl))) return false;
    gesehen.add(kern);
    return true;
  });
}

async function recherchieren(suchfeld: string, ausschluss: string[]): Promise<{ funde: EntdeckterInvestor[]; urls: Set<string> }> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  const ki = new Anthropic();
  const nachrichten: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `Heute ist der ${new Date().toISOString().slice(0, 10)}. Suchfeld: ${suchfeld}.\n\n` +
        `Finde bis zu 12 Käufer mit Beleg. Diese kennen wir schon, bitte nicht nennen: ${ausschluss.join(", ")}.\n\n` +
        "Schreibe am Ende je Firma einen Absatz mit Name, Sitz, Website, Typ, Nutzungen, Volumen, Regionen, Beleg und Quell-URL.",
    },
  ];
  const urls = new Set<string>();
  let bericht = "";
  for (let runde = 0; runde <= MAX_FORTSETZUNGEN; runde++) {
    const antwort = await ki.messages
      .stream({
        model: MODELL,
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { effort: "low" },
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 12 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 },
        ],
        messages: nachrichten,
      })
      .finalMessage();
    for (const block of antwort.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) urls.add(r.url);
      } else if (block.type === "web_fetch_tool_result") {
        const inhalt = block.content as { type?: string; url?: string };
        if (inhalt.type === "web_fetch_result" && inhalt.url) urls.add(inhalt.url);
      } else if (block.type === "text") {
        bericht += block.text;
      }
    }
    if (antwort.stop_reason === "refusal") throw new Error("Die KI hat die Recherche abgelehnt.");
    if (antwort.stop_reason !== "pause_turn") break;
    nachrichten.push({ role: "assistant", content: antwort.content });
  }

  const struktur = await ki.messages
    .stream({
      model: MODELL,
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: "Überführe den Recherchebericht in die Felder. Nur, was im Bericht steht; URLs exakt kopieren. Beträge in Euro.",
      messages: [{ role: "user", content: bericht || "Kein Bericht." }],
    })
    .finalMessage();
  const text = struktur.content.find((b) => b.type === "text");
  const funde = text && text.type === "text" ? (JSON.parse(text.text) as { firmen: EntdeckterInvestor[] }).firmen : [];
  return { funde, urls };
}

async function alleFirmen(admin: SupabaseClient, tabelle: string, spalte: string): Promise<string[]> {
  const namen: string[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await admin.from(tabelle).select(spalte).not(spalte, "is", null).range(von, von + 999);
    if (error) throw new Error(error.message);
    for (const z of (data ?? []) as unknown as Record<string, string>[]) namen.push(z[spalte]);
    if (!data || data.length < 1000) break;
  }
  return namen;
}

/**
 * Ein Entdeckungslauf über ein Suchfeld (ohne Angabe: im Wochenwechsel). Speichert neue Firmen
 * als offene Listeneinträge; in Salesforce wird nichts angelegt.
 */
export async function entdeckungLauf(
  admin: SupabaseClient,
  feldIndex?: number,
): Promise<{ suchfeld: string; gefunden: number; neu: number; firmen: string[] }> {
  const index = feldIndex ?? Math.floor(Date.now() / (3.5 * 86_400_000)) % SUCHFELDER.length;
  const suchfeld = SUCHFELDER[index % SUCHFELDER.length];

  const [quellen, investoren, sf] = await Promise.all([
    alleFirmen(admin, "investor_quellen", "firma"),
    alleFirmen(admin, "investoren", "name"),
    alleFirmen(admin, "sf_kontakte", "firma"),
  ]);
  const bekannt = new Set([...quellen, ...investoren, ...sf].map((n) => normalisiereFirma(n)).filter((n) => n.length >= 3));
  // Zuletzt recherchierte Firmen ausdrücklich ausschließen, damit die KI Neues sucht.
  const { data: zuletzt } = await admin
    .from("investor_quellen")
    .select("firma")
    .eq("quelle", "recherche")
    .order("importiert_am", { ascending: false })
    .limit(60);

  const { funde, urls } = await recherchieren(suchfeld, (zuletzt ?? []).map((z) => String(z.firma)));
  const neu = fundeFiltern(funde, urls, bekannt);
  if (neu.length) {
    const jetzt = new Date().toISOString();
    const { error } = await admin.from("investor_quellen").upsert(
      neu.map((f) => ({
        schluessel: `recherche:${normalisiereFirma(f.firma)}`,
        quelle: "recherche",
        firma: f.firma.trim(),
        ort: f.ort,
        adresse: f.ort,
        webseite: f.webseite,
        quelle_link: f.quelleUrl,
        typ: f.typ,
        nutzungen: f.nutzungen,
        volumen_min: f.volumenMin && f.volumenMin >= 250_000 ? f.volumenMin : null,
        volumen_max: f.volumenMax && f.volumenMax >= 250_000 ? f.volumenMax : null,
        regionen: f.regionen,
        nrw_bezug: f.nrw ? "region" : null,
        passung: passungRecherche(f),
        roh: { beleg: f.beleg, letzteAktivitaet: f.letzteAktivitaet, suchfeld },
        importiert_am: jetzt,
      })),
      { onConflict: "schluessel", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    const { quellenBereinigen } = await import("./dubletten");
    await quellenBereinigen(admin);
  }
  return { suchfeld, gefunden: funde.length, neu: neu.length, firmen: neu.map((f) => f.firma) };
}
