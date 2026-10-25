/**
 * KI-Teil des Markt-Radars. Server-only.
 * Schritt 1 recherchiert mit Websuche die Immobiliennews der letzten Tage,
 * Schritt 2 überführt den Bericht in feste Felder. Quellen prüft abgleich.ts gegen die
 * tatsächlich gefundenen URLs, damit keine erfundenen Meldungen gespeichert werden.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { RadarFund, RadarSeite } from "./typen";

const MODELL = "claude-opus-5-5";
/** pause_turn: lange Suchen pausiert der Server; so oft setzen wir fort. */
const MAX_FORTSETZUNGEN = 4;

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim())
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  return new Anthropic();
}

const AUFTRAG: Record<RadarSeite, string> = {
  kaeufer: `Finde Unternehmen und Personen, die gerade aktiv Immobilien KAUFEN oder Kapital dafür einsammeln:
- gemeldete Ankäufe und Portfoliokäufe, neue Fonds oder Ankaufsprogramme, Family Offices und Bestandshalter mit neuen Zukäufen
- Investoren, die neue Ankaufsprofile oder Zielregionen veröffentlichen
- Markteintritte in NRW oder Düsseldorf`,
  verkaeufer: `Finde Unternehmen und Personen, die Immobilien VERKAUFEN wollen oder müssen:
- gemeldete Verkaufsabsichten, Portfoliobereinigungen, Desinvestitionen, Verkaufsprozesse
- Projektentwickler mit Fertigstellungen oder finanziellen Schwierigkeiten, Insolvenzen mit Immobilienbestand
- Nachfolge- und Erbfälle, Konzerne mit Standortaufgaben, Fonds in Liquidation oder am Laufzeitende`,
};

function systemPrompt(seite: RadarSeite, profil: string): string {
  return `Du bist Research-Analyst bei Grenz & Co. Immobilienberatungs-GmbH in Düsseldorf, einer Investmentmaklerin für Zinshäuser, Wohn- und Geschäftshäuser und Gewerbeimmobilien.

Profil von Grenz & Co. (aus Salesforce):
${profil}

Deine Aufgabe ist das tägliche Markt-Radar für die Seite „${seite === "kaeufer" ? "Käufer" : "Verkäufer"}“.
${AUFTRAG[seite]}

Arbeitsweise:
- Suche in deutschsprachigen Immobiliennews der letzten 7 Tage (z. B. Immobilien Zeitung, Thomas Daily, Property Magazine, immobilienmanager, Börsen-Zeitung, Handelsblatt, Rheinische Post, WAZ, Pressemitteilungen von Maklern und Investoren).
- Schwerpunkt Düsseldorf, Rheinland und NRW. Bundesweite Akteure nur, wenn sie in NRW aktiv sind oder ins Profil passen.
- Nenne nur Akteure, die in einer gefundenen Quelle konkret genannt werden. Erfinde nichts.
- Bewerte die Relevanz für Grenz & Co. von 0 bis 100: Passen Region, Objektart und Größe? Ist ein Mandat oder eine Käuferansprache realistisch? Große Konzerndeals jenseits von 100 Mio. € oder Akteure ohne NRW-Bezug sind wenig relevant.
- Schreibe für jeden Akteur: Name, Typ, was passiert ist, Ort, Volumen falls genannt, Datum, die exakte URL der Quelle und eine kurze Begründung der Relevanz.`;
}

function bereitsBekannt(akteure: string[]): string {
  if (!akteure.length) return "";
  return `\n\nDiese Akteure wurden in den letzten 30 Tagen schon gemeldet. Nimm sie nur auf, wenn es ein neues Ereignis gibt:\n${akteure.slice(0, 150).join("; ")}`;
}

type Recherche = {
  bericht: string;
  urls: string[];
  usage: { input: number; output: number; suchen: number };
};

/** Schritt 1: Websuche, Ergebnis als Freitextbericht plus alle gefundenen URLs. */
async function recherchieren(
  seite: RadarSeite,
  profil: string,
  bekannteAkteure: string[],
  auftrag?: string,
): Promise<Recherche> {
  const ki = client();
  const heute = new Date().toISOString().slice(0, 10);
  const nachrichten: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Heute ist der ${heute}. Erstelle das Markt-Radar „${seite === "kaeufer" ? "Käufer" : "Verkäufer"}“ für Grenz & Co. Liste am Ende alle Akteure mit allen Angaben und der exakten Quell-URL auf.${auftrag ? `\n\nSonderauftrag (geht dem täglichen Schwerpunkt vor):\n${auftrag}` : bereitsBekannt(bekannteAkteure)}`,
    },
  ];
  const urls = new Set<string>();
  const usage = { input: 0, output: 0, suchen: 0 };
  let bericht = "";

  for (let runde = 0; runde <= MAX_FORTSETZUNGEN; runde++) {
    const antwort = await ki.messages
      .stream({
        model: MODELL,
        max_tokens: 32000,
        system: systemPrompt(seite, profil),
        output_config: { effort: "medium" },
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 12,
            user_location: {
              type: "approximate",
              city: "Düsseldorf",
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

    usage.input += antwort.usage.input_tokens;
    usage.output += antwort.usage.output_tokens;
    usage.suchen += antwort.usage.server_tool_use?.web_search_requests ?? 0;

    for (const block of antwort.content) {
      if (
        block.type === "web_search_tool_result" &&
        Array.isArray(block.content)
      ) {
        for (const r of block.content) urls.add(r.url);
      } else if (block.type === "web_fetch_tool_result") {
        const inhalt = block.content as { type?: string; url?: string };
        if (inhalt.type === "web_fetch_result" && inhalt.url)
          urls.add(inhalt.url);
      } else if (block.type === "text") {
        bericht += block.text;
      }
    }

    if (antwort.stop_reason === "refusal")
      throw new Error("Die KI hat die Recherche abgelehnt.");
    if (antwort.stop_reason !== "pause_turn") break;
    nachrichten.push({ role: "assistant", content: antwort.content });
  }

  return { bericht: bericht.trim(), urls: [...urls], usage };
}

const FUND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["funde"],
  properties: {
    funde: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "akteur",
          "akteurTyp",
          "ereignis",
          "transaktion",
          "objektart",
          "ort",
          "volumenEur",
          "ereignisAm",
          "quelleUrl",
          "quelleTitel",
          "quelleMedium",
          "relevanz",
          "begruendung",
        ],
        properties: {
          akteur: { type: "string", description: "Firmen- oder Personenname" },
          akteurTyp: {
            type: ["string", "null"],
            description:
              "z. B. Family Office, Fonds, Bestandshalter, Projektentwickler, Privatinvestor, Unternehmen, öffentliche Hand",
          },
          ereignis: {
            type: "string",
            description: "Ein Satz, was passiert ist",
          },
          transaktion: {
            type: ["string", "null"],
            description:
              "z. B. Ankauf, Verkauf, Verkaufsabsicht, Fondsauflage, Insolvenz",
          },
          objektart: { type: ["string", "null"] },
          ort: { type: ["string", "null"] },
          volumenEur: {
            type: ["number", "null"],
            description: "Volumen in Euro, nur wenn genannt",
          },
          ereignisAm: {
            type: ["string", "null"],
            description: "Datum JJJJ-MM-TT, falls bekannt",
          },
          quelleUrl: {
            type: "string",
            description: "Exakte URL aus dem Bericht",
          },
          quelleTitel: { type: ["string", "null"] },
          quelleMedium: { type: ["string", "null"] },
          relevanz: { type: "integer", description: "0 bis 100" },
          begruendung: { type: "string" },
        },
      },
    },
  },
} as const;

/** Schritt 2: Bericht in feste Felder überführen (ohne neue Fakten). */
async function strukturieren(
  seite: RadarSeite,
  bericht: string,
): Promise<{ funde: RadarFund[]; input: number; output: number }> {
  if (!bericht) return { funde: [], input: 0, output: 0 };
  const antwort = await client()
    .messages.stream({
      model: MODELL,
      max_tokens: 32000,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: FUND_SCHEMA },
      },
      system:
        "Überführe den Recherchebericht in die vorgegebenen Felder. Übernimm nur, was im Bericht steht, und kopiere URLs exakt. Ein Eintrag je Akteur und Quelle.",
      messages: [
        {
          role: "user",
          content: `Seite: ${seite === "kaeufer" ? "Käufer" : "Verkäufer"}\n\nBericht:\n${bericht}`,
        },
      ],
    })
    .finalMessage();
  if (antwort.stop_reason === "refusal")
    throw new Error("Die KI hat die Auswertung abgelehnt.");
  if (antwort.stop_reason === "max_tokens")
    throw new Error("Die Auswertung war zu lang.");
  const block = antwort.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    return { funde: [], input: 0, output: 0 };
  const { funde } = JSON.parse(block.text) as { funde: RadarFund[] };
  return {
    funde,
    input: antwort.usage.input_tokens,
    output: antwort.usage.output_tokens,
  };
}

export async function radarRecherche(
  seite: RadarSeite,
  profil: string,
  bekannteAkteure: string[],
  auftrag?: string,
) {
  const recherche = await recherchieren(
    seite,
    profil,
    bekannteAkteure,
    auftrag,
  );
  const struktur = await strukturieren(seite, recherche.bericht);
  return {
    funde: struktur.funde,
    urls: recherche.urls,
    usage: {
      input: recherche.usage.input + struktur.input,
      output: recherche.usage.output + struktur.output,
      suchen: recherche.usage.suchen,
    },
  };
}
