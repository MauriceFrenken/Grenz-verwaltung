/**
 * KI-Teil des Marktberichts. Server-only.
 * 1. Texte (Thesen, Seitentexte, Ausblick) nur aus den eingefrorenen Kennzahlen; Zahlen, die dort
 *    nicht stehen, werden als Prüfhinweis markiert.
 * 2. Kennzahlen aus hochgeladenen Marktberichten anderer Häuser auslesen (mit Seite und Zitat);
 *    sie bleiben ungeprüft, bis ein Nutzer sie bestätigt.
 */

import Anthropic from "@anthropic-ai/sdk";

import { kennzahlenText, unbelegteZahlen } from "./bericht";
import type {
  Benchmark,
  MarktberichtKennzahlen,
  MarktberichtTexte,
} from "./typen";

const MODELL = "claude-opus-5-5";

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim())
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  return new Anthropic();
}

function textAus(antwort: Anthropic.Message): string {
  if (antwort.stop_reason === "refusal")
    throw new Error("Die KI hat die Anfrage abgelehnt.");
  if (antwort.stop_reason === "max_tokens")
    throw new Error("Die KI-Antwort war zu lang. Bitte erneut versuchen.");
  const block = antwort.content.find((b) => b.type === "text");
  if (!block || block.type !== "text")
    throw new Error("Die KI hat keinen Text geliefert.");
  return block.text;
}

const ohneStriche = (s: string) => s.replace(/\s*[–—]\s*/g, ", ").trim();

const TREND = { type: "string", enum: ["steigend", "stabil", "fallend"] };

const TEXT_SCHEMA = {
  type: "object",
  properties: {
    thesen: { type: "array", items: { type: "string" } },
    einleitung: { type: "string" },
    rahmen: { type: "string" },
    angebot: { type: "string" },
    nachfrage: { type: "string" },
    vermarktung: { type: "string" },
    ausblick: { type: "string" },
    ausblickTrends: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kennzahl: { type: "string" },
          trend: TREND,
          prognose: TREND,
        },
        required: ["kennzahl", "trend", "prognose"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "thesen",
    "einleitung",
    "rahmen",
    "angebot",
    "nachfrage",
    "vermarktung",
    "ausblick",
    "ausblickTrends",
  ],
  additionalProperties: false,
} as const;

const TEXT_SYSTEM = `Du bist Research-Analyst bei Grenz & Co. Immobilienberatungs-GmbH (Köln und Düsseldorf), einer Investmentmaklerin für Zinshäuser, Mehrfamilienhäuser und Wohn- und Geschäftshäuser von 1 bis 15 Mio. € im Rheinland.
Du schreibst die Texte des halbjährlichen Marktberichts „Zinshäuser Rheinland“ im Stil der Research-Berichte großer Häuser (BNP Paribas Real Estate, Cushman & Wakefield): sachlich, verdichtet, mit Zahlen.

Harte Regeln:
- Verwende ausschließlich Zahlen, die in den gelieferten Kennzahlen stehen, genau so geschrieben. Rechne keine neuen Zahlen aus und runde nicht um.
- Zitierte Werte anderer Häuser immer mit Quelle nennen („laut BNP Paribas Real Estate …“).
- Wo Fallzahlen klein sind oder der Vorjahresvergleich fehlt, sage das offen statt zu verallgemeinern.
- Nenne keine Investoren- oder Eigentümernamen aus Grenz-Daten. Akteure aus dem Markt-Radar nur, wenn sie in der Presse genannt sind.
- Keine Gedankenstriche (– oder —). Kurze Sätze. Deutsch.

Felder:
- thesen: genau 3 Kernthesen, je höchstens 12 Wörter, beginnend mit einem fettfähigen Stichwort und Doppelpunkt (z. B. „Köln vorn: Angebotsfaktor über Düsseldorf“).
- einleitung: Kurzfassung des Berichts in 3 Sätzen.
- rahmen: 2 bis 3 Sätze zum Zins- und Finanzierungsumfeld.
- angebot: 3 bis 4 Sätze zum Angebotsmarkt nach Teilmärkten.
- nachfrage: 3 Sätze zur Käuferseite (Volumen, Strategien, Regionen).
- vermarktung: 2 bis 3 Sätze zur eigenen Vermarktung von Grenz & Co.
- ausblick: 3 bis 4 Sätze zum nächsten Halbjahr, vorsichtig formuliert.
- ausblickTrends: 4 bis 6 Kennzahlen (Angebotsfaktor, Angebotspreis, Angebotsmenge, Bauzins, Nachfrage, Mieten) mit Trend der Periode und Prognose fürs nächste Halbjahr.`;

export async function texteEntwurf(
  k: MarktberichtKennzahlen,
  benchmarks: Benchmark[],
): Promise<MarktberichtTexte> {
  const kontext = kennzahlenText(k, benchmarks);
  const antwort = await client().messages.create({
    model: MODELL,
    max_tokens: 6000,
    system: TEXT_SYSTEM,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: TEXT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `<kennzahlen>\n${kontext}\n</kennzahlen>\n\nSchreibe die Texte des Marktberichts als JSON.`,
      },
    ],
  });
  const roh = JSON.parse(textAus(antwort)) as Required<
    Omit<MarktberichtTexte, "pruefhinweise">
  >;
  const texte: MarktberichtTexte = {
    thesen: roh.thesen.slice(0, 3).map(ohneStriche),
    einleitung: ohneStriche(roh.einleitung),
    rahmen: ohneStriche(roh.rahmen),
    angebot: ohneStriche(roh.angebot),
    nachfrage: ohneStriche(roh.nachfrage),
    vermarktung: ohneStriche(roh.vermarktung),
    ausblick: ohneStriche(roh.ausblick),
    ausblickTrends: roh.ausblickTrends.slice(0, 6),
  };
  texte.pruefhinweise = pruefe(texte, kontext);
  return texte;
}

/** Zahlen in den Texten, die nicht in den Kennzahlen stehen, als Hinweis für die Redaktion. */
export function pruefe(texte: MarktberichtTexte, kontext: string): string[] {
  const hinweise: string[] = [];
  const felder: [string, string | undefined][] = [
    ["Thesen", texte.thesen?.join(" ")],
    ["Kurzfassung", texte.einleitung],
    ["Rahmenbedingungen", texte.rahmen],
    ["Angebot", texte.angebot],
    ["Nachfrage", texte.nachfrage],
    ["Vermarktung", texte.vermarktung],
    ["Ausblick", texte.ausblick],
  ];
  for (const [name, t] of felder) {
    const fremd = unbelegteZahlen(t ?? "", kontext);
    if (fremd.length)
      hinweise.push(
        `${name}: Zahl ${fremd.join(", ")} steht nicht in den Kennzahlen. Bitte prüfen.`,
      );
  }
  return hinweise;
}

const BENCH_SCHEMA = {
  type: "object",
  properties: {
    herausgeber: { type: "string" },
    stichtag: { type: "string", description: "ISO-Datum JJJJ-MM-TT" },
    kennzahlen: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kennzahl: { type: "string" },
          region: { type: "string" },
          wert: { type: "number" },
          einheit: { type: "string" },
          veraenderung: { type: "string" },
          seite: { type: "integer" },
          zitat: { type: "string" },
        },
        required: [
          "kennzahl",
          "region",
          "wert",
          "einheit",
          "veraenderung",
          "seite",
          "zitat",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["herausgeber", "stichtag", "kennzahlen"],
  additionalProperties: false,
} as const;

const BENCH_SYSTEM = `Du liest Marktberichte von Immobilienberatern (z. B. BNP Paribas Real Estate, JLL, CBRE, Cushman & Wakefield, Savills, Colliers, Engel & Völkers) und Grundstücksmarktberichte der Gutachterausschüsse.
Lies die Kennzahlen aus, die für einen Marktbericht über Zinshäuser, Wohninvestment und Wohnungsmarkt im Rheinland (Köln, Düsseldorf, NRW) oder Deutschland relevant sind:
Transaktionsvolumen, Spitzenrenditen, Kaufpreisfaktoren, Kaufpreise je m², Angebots- und Vergleichsmieten, Leerstand, Anteil Käufergruppen, Liegenschaftszinssätze, Prognosen.
Regeln:
- Nur Werte, die wörtlich im Dokument stehen. "zitat" ist der exakte Textausschnitt mit der Zahl, "seite" die Seitenzahl im PDF (ab 1).
- "wert" als Zahl (z. B. 3.81 für „3,81 %“, 749 für „749 Mio. €“), "einheit" z. B. „%“, „Mio. €“, „€/m²“, „Faktor“.
- "veraenderung" so wie im Dokument („+34 % y/y“, „+10 bp“) oder leer.
- "region" z. B. „Düsseldorf“, „Köln“, „Top-7“, „Deutschland“.
- Höchstens 15 Kennzahlen, die wichtigsten zuerst.`;

export async function benchmarksAusPdf(
  pdfBase64: string,
  dateiname: string,
): Promise<Benchmark[]> {
  const antwort = await client().messages.create({
    model: MODELL,
    max_tokens: 8000,
    system: BENCH_SYSTEM,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: BENCH_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
            title: dateiname,
          },
          { type: "text", text: "Lies die Kennzahlen als JSON aus." },
        ],
      },
    ],
  });
  const roh = JSON.parse(textAus(antwort)) as {
    herausgeber: string;
    stichtag: string;
    kennzahlen: {
      kennzahl: string;
      region: string;
      wert: number;
      einheit: string;
      veraenderung: string;
      seite: number;
      zitat: string;
    }[];
  };
  const stichtag = /^\d{4}-\d{2}-\d{2}$/.test(roh.stichtag)
    ? roh.stichtag
    : new Date().toISOString().slice(0, 10);
  return roh.kennzahlen
    .filter((x) => Number.isFinite(x.wert) && x.zitat.trim())
    .slice(0, 15)
    .map((x) => ({
      id: crypto.randomUUID(),
      kennzahl: ohneStriche(x.kennzahl),
      region: x.region,
      wert: x.wert,
      einheit: x.einheit,
      veraenderung: x.veraenderung || undefined,
      quelle: `${roh.herausgeber}, ${dateiname.replace(/\.pdf$/i, "")}`,
      stichtag,
      seite: x.seite,
      zitat: x.zitat.slice(0, 400),
      geprueft: false,
    }));
}
