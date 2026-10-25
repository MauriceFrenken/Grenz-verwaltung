/**
 * Investorenprüfung per KI-Websuche: Gibt es die Gesellschaft noch, ist sie insolvent, in
 * Liquidation oder gelöscht, und sucht sie aktuell (2026) Immobilien? Ergebnis mit Quellen,
 * die gegen die tatsächlich gefundenen URLs geprüft werden. Server-only.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalisiereUrl } from "@/lib/markt-radar/abgleich";

const MODELL = "claude-opus-5-5";
const MAX_FORTSETZUNGEN = 4;
/** Firmen je KI-Aufruf: spart Kosten, bleibt aber gründlich. */
export const JE_AUFRUF = 5;

export type PruefStatus = "aktiv" | "insolvenz" | "liquidation" | "geloescht" | "unklar";

export type PruefKandidat = {
  schluessel: string;
  firma: string;
  webseite: string | null;
  ort: string | null;
};

export type PruefErgebnis = {
  schluessel: string;
  status: PruefStatus;
  begruendung: string;
  quelleUrl: string | null;
  webseite: string | null;
  ankaufsprofilUrl: string | null;
  ankaufsprofilKurz: string | null;
  aktiv2026: boolean | null;
  letzteAktivitaet: string | null;
};

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  return new Anthropic();
}

const SYSTEM = `Du prüfst für Grenz & Co. (Investmentmakler, Düsseldorf) Immobilieninvestoren, bevor sie in die Investorendatenbank kommen.

Für jede Firma:
1. Existiert die Gesellschaft noch und ist sie geschäftlich aktiv? Suche nach Insolvenzbekanntmachungen (insolvenzbekanntmachungen.de, Presse), Liquidation („i. L.“), Löschung im Handelsregister, Umfirmierung oder Verschmelzung.
2. Hat sie eine Website mit aktuellem Ankaufsprofil? Wenn ja: Link und Kriterien in einem Satz (Objektart, Region, Volumen, Faktor).
3. Gibt es Hinweise auf Ankäufe oder Ankaufsaktivität im Jahr 2025 oder 2026?

Regeln: Nur belegte Aussagen mit exakter Quell-URL. Bei gleichnamigen Firmen auf Ort und Website achten. Wenn nichts zu finden ist, Status „unklar“, nicht raten.`;

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
        required: [
          "schluessel", "status", "begruendung", "quelleUrl", "webseite",
          "ankaufsprofilUrl", "ankaufsprofilKurz", "aktiv2026", "letzteAktivitaet",
        ],
        properties: {
          schluessel: { type: "string" },
          status: { type: "string", enum: ["aktiv", "insolvenz", "liquidation", "geloescht", "unklar"] },
          begruendung: { type: "string", description: "Ein Satz mit dem Beleg" },
          quelleUrl: { type: ["string", "null"] },
          webseite: { type: ["string", "null"] },
          ankaufsprofilUrl: { type: ["string", "null"] },
          ankaufsprofilKurz: { type: ["string", "null"] },
          aktiv2026: { type: ["boolean", "null"], description: "Ankauf oder Ankaufsprofil 2025/2026 belegt" },
          letzteAktivitaet: { type: ["string", "null"], description: "z. B. „03/2026 Ankauf MFH in Köln“" },
        },
      },
    },
  },
} as const;

/** Prüft bis zu JE_AUFRUF Firmen. URLs, die die Websuche nicht geliefert hat, werden verworfen. */
export async function firmenPruefen(kandidaten: PruefKandidat[]): Promise<{
  ergebnisse: PruefErgebnis[];
  usage: { input: number; output: number; suchen: number };
}> {
  const ki = client();
  const liste = kandidaten
    .map((k) => `- Schlüssel ${k.schluessel}: ${k.firma}${k.ort ? `, ${k.ort}` : ""}${k.webseite ? `, Website ${k.webseite}` : ""}`)
    .join("\n");
  const nachrichten: Anthropic.MessageParam[] = [
    { role: "user", content: `Heute ist der ${new Date().toISOString().slice(0, 10)}. Prüfe diese Firmen:\n${liste}\n\nSchreibe am Ende je Firma einen Absatz mit Schlüssel, Ergebnis und Quell-URLs.` },
  ];
  const urls = new Set<string>();
  const usage = { input: 0, output: 0, suchen: 0 };
  let bericht = "";
  for (let runde = 0; runde <= MAX_FORTSETZUNGEN; runde++) {
    const antwort = await ki.messages
      .stream({
        model: MODELL,
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { effort: "low" },
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 4 * kandidaten.length },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 * kandidaten.length },
        ],
        messages: nachrichten,
      })
      .finalMessage();
    usage.input += antwort.usage.input_tokens;
    usage.output += antwort.usage.output_tokens;
    usage.suchen += antwort.usage.server_tool_use?.web_search_requests ?? 0;
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
    if (antwort.stop_reason === "refusal") throw new Error("Die KI hat die Prüfung abgelehnt.");
    if (antwort.stop_reason !== "pause_turn") break;
    nachrichten.push({ role: "assistant", content: antwort.content });
  }

  const struktur = await ki.messages
    .stream({
      model: MODELL,
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: "Überführe den Prüfbericht in die Felder. Nur, was im Bericht steht; URLs exakt kopieren. Ein Eintrag je Schlüssel.",
      messages: [{ role: "user", content: `Schlüssel: ${kandidaten.map((k) => k.schluessel).join(", ")}\n\nBericht:\n${bericht}` }],
    })
    .finalMessage();
  usage.input += struktur.usage.input_tokens;
  usage.output += struktur.usage.output_tokens;
  const text = struktur.content.find((b) => b.type === "text");
  const roh = text && text.type === "text" ? (JSON.parse(text.text) as { firmen: PruefErgebnis[] }).firmen : [];

  const gefunden = new Set([...urls].map((u) => normalisiereUrl(u)).filter(Boolean));
  const belegt = (u: string | null) => (u && gefunden.has(normalisiereUrl(u)) ? u : null);
  const bekannt = new Set(kandidaten.map((k) => k.schluessel));
  const ergebnisse = roh
    .filter((e) => bekannt.has(e.schluessel))
    .map((e) => {
      const quelleUrl = belegt(e.quelleUrl);
      // Ohne belegte Quelle keine harte Aussage über Insolvenz oder Löschung.
      const status: PruefStatus = e.status !== "aktiv" && e.status !== "unklar" && !quelleUrl ? "unklar" : e.status;
      return { ...e, status, quelleUrl, ankaufsprofilUrl: belegt(e.ankaufsprofilUrl) ?? e.ankaufsprofilUrl };
    });
  return { ergebnisse, usage };
}

/**
 * Ein Prüflauf: nimmt die wichtigsten ungeprüften Firmen (Salesforce-Investoren zuerst, dann
 * Listen nach Passung), prüft sie und speichert das Ergebnis. Für Cron in kleinen Paketen.
 */
export async function pruefLauf(admin: SupabaseClient, anzahl = 20): Promise<{ geprueft: number; auffaellig: number }> {
  const { data: offen, error } = await admin.rpc("investor_pruefung_kandidaten", { anzahl });
  if (error) throw new Error(error.message);
  const kandidaten = (offen ?? []) as PruefKandidat[];
  let geprueft = 0;
  let auffaellig = 0;
  for (let i = 0; i < kandidaten.length; i += JE_AUFRUF) {
    const paket = kandidaten.slice(i, i + JE_AUFRUF);
    const { ergebnisse } = await firmenPruefen(paket);
    const je = new Map(ergebnisse.map((e) => [e.schluessel, e]));
    const zeilen = paket.map((k) => {
      const e = je.get(k.schluessel);
      return {
        schluessel: k.schluessel,
        firma: k.firma,
        status: e?.status ?? "unklar",
        begruendung: e?.begruendung ?? "Kein Ergebnis der Recherche.",
        quelle_url: e?.quelleUrl ?? null,
        webseite: e?.webseite ?? k.webseite,
        ankaufsprofil_url: e?.ankaufsprofilUrl ?? null,
        ankaufsprofil_kurz: e?.ankaufsprofilKurz ?? null,
        aktiv_2026: e?.aktiv2026 ?? null,
        letzte_aktivitaet: e?.letzteAktivitaet ?? null,
        geprueft_am: new Date().toISOString(),
      };
    });
    const { error: f } = await admin.from("investor_pruefungen").upsert(zeilen, { onConflict: "schluessel" });
    if (f) throw new Error(f.message);
    geprueft += zeilen.length;
    auffaellig += zeilen.filter((z) => z.status !== "aktiv" && z.status !== "unklar").length;
  }
  return { geprueft, auffaellig };
}
