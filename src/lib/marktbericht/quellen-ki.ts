/**
 * Sucht mit Websuche die jüngsten Marktberichte eines Hauses. Server-only.
 * Schritt 1 recherchiert frei, Schritt 2 überführt das Ergebnis in feste Felder. Ob eine URL
 * wirklich ein Bericht ist, entscheidet erst der Download in quellen-lauf.ts.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { MarktberichtQuelle } from "./quellen";

const MODELL = "claude-opus-5-5";
const MAX_FORTSETZUNGEN = 3;

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim())
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  return new Anthropic();
}

export type BerichtFund = {
  url: string;
  titel: string;
  art: "pdf" | "html";
  stichtag: string | null;
  region: string | null;
};

const SYSTEM = `Du bist Research-Assistent bei Grenz & Co. Immobilienberatungs-GmbH (Köln und Düsseldorf), einer Investmentmaklerin für Zinshäuser, Mehrfamilienhäuser und Wohn- und Geschäftshäuser im Rheinland.
Für den halbjährlichen Marktbericht „Zinshäuser Rheinland“ sammelst du die aktuellen Marktberichte anderer Häuser und öffentlicher Stellen, um deren Kennzahlen mit Quelle zu zitieren.

Arbeitsweise:
- Suche die jüngsten Veröffentlichungen des genannten Hauses zum Suchauftrag, höchstens 18 Monate alt. Wohnen und Investment im Rheinland vor Deutschland insgesamt.
- Bevorzugt die direkte URL der PDF-Datei, wenn sie ohne Anmeldung abrufbar ist. Prüfe das mit web_fetch.
- Ist der Bericht nur gegen Registrierung oder Formular erhältlich, nimm stattdessen die öffentliche Pressemitteilung oder Berichtsseite des Hauses, auf der die Kennzahlen im Text stehen. Umgehe keine Anmeldung.
- Nur Seiten des Hauses selbst oder der Behörde (bei Gutachterausschüssen auch boris.nrw.de). Keine Presseartikel Dritter.
- Erfinde keine URLs. Nenne nur URLs, die du in der Suche oder beim Abruf gesehen hast.
- Liste am Ende jede Veröffentlichung mit Titel, exakter URL, Art (PDF oder Webseite), Stichtag der Daten (z. B. 30.06.2026) und Region.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["berichte"],
  properties: {
    berichte: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "titel", "art", "stichtag", "region"],
        properties: {
          url: { type: "string" },
          titel: { type: "string" },
          art: { type: "string", enum: ["pdf", "html"] },
          stichtag: {
            type: ["string", "null"],
            description:
              "Stichtag der Daten JJJJ-MM-TT, z. B. Quartals- oder Halbjahresende",
          },
          region: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export async function berichteSuchen(
  quelle: Pick<MarktberichtQuelle, "name" | "suchauftrag">,
  bekannteUrls: string[],
): Promise<{ funde: BerichtFund[]; suchen: number }> {
  const ki = client();
  const heute = new Date().toISOString().slice(0, 10);
  const bekannt = bekannteUrls.length
    ? `\n\nDiese URLs sind schon erfasst. Nenne sie nur, wenn es keine neueren gibt:\n${bekannteUrls.slice(0, 40).join("\n")}`
    : "";
  const nachrichten: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Heute ist der ${heute}.\nHaus: ${quelle.name}\nSuchauftrag: ${quelle.suchauftrag}\n\nFinde die jüngsten Marktberichte (höchstens 6).${bekannt}`,
    },
  ];
  let bericht = "";
  let suchen = 0;
  for (let runde = 0; runde <= MAX_FORTSETZUNGEN; runde++) {
    const antwort = await ki.messages
      .stream({
        model: MODELL,
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { effort: "medium" },
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 8,
            user_location: {
              type: "approximate",
              city: "Köln",
              region: "Nordrhein-Westfalen",
              country: "DE",
              timezone: "Europe/Berlin",
            },
          },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
        ],
        messages: nachrichten,
      })
      .finalMessage();
    suchen += antwort.usage.server_tool_use?.web_search_requests ?? 0;
    for (const block of antwort.content)
      if (block.type === "text") bericht += block.text;
    if (antwort.stop_reason === "refusal")
      throw new Error("Die KI hat die Suche abgelehnt.");
    if (antwort.stop_reason !== "pause_turn") break;
    nachrichten.push({ role: "assistant", content: antwort.content });
  }
  if (!bericht.trim()) return { funde: [], suchen };

  const struktur = await ki.messages
    .stream({
      model: MODELL,
      max_tokens: 4000,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system:
        "Überführe die Liste der Veröffentlichungen in die Felder. Übernimm nur, was im Text steht, und kopiere URLs exakt.",
      messages: [{ role: "user", content: bericht }],
    })
    .finalMessage();
  const block = struktur.content.find((b) => b.type === "text");
  if (!block || block.type !== "text" || struktur.stop_reason !== "end_turn")
    return { funde: [], suchen };
  const { berichte } = JSON.parse(block.text) as { berichte: BerichtFund[] };
  return {
    funde: berichte
      .map((b) => ({
        ...b,
        titel: b.titel.trim().slice(0, 300),
        stichtag:
          b.stichtag && /^\d{4}-\d{2}-\d{2}$/.test(b.stichtag)
            ? b.stichtag
            : null,
      }))
      .slice(0, 6),
    suchen,
  };
}

export type KiAbruf =
  | { typ: "pdf"; bytes: Uint8Array; url: string }
  | { typ: "text"; text: string; url: string };

/**
 * Ersatzweg, wenn eine Seite unseren Server abweist (Bot-Schutz bei CBRE, Colliers u. a.):
 * Anthropic ruft die Adresse mit web_fetch ab, wir übernehmen den gelieferten Inhalt unverändert.
 */
export async function perKiAbrufen(url: string): Promise<KiAbruf | null> {
  const antwort = await client()
    .messages.stream({
      model: MODELL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      tools: [
        {
          type: "web_fetch_20260209",
          name: "web_fetch",
          max_uses: 1,
          max_content_tokens: 300_000,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Rufe genau diese Adresse einmal mit web_fetch ab und antworte danach nur mit „fertig“:\n${url}`,
        },
      ],
    })
    .finalMessage();
  for (const block of antwort.content) {
    if (block.type !== "web_fetch_tool_result") continue;
    const inhalt = block.content;
    if (inhalt.type !== "web_fetch_result") return null;
    const quelle = inhalt.content.source;
    if (quelle.type === "base64")
      return {
        typ: "pdf",
        bytes: new Uint8Array(Buffer.from(quelle.data, "base64")),
        url: inhalt.url,
      };
    return { typ: "text", text: quelle.data, url: inhalt.url };
  }
  return null;
}
