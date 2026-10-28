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
    ausblick: { type: "string" },
    empfehlungen: { type: "array", items: { type: "string" } },
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
    "ausblick",
    "empfehlungen",
    "ausblickTrends",
  ],
  additionalProperties: false,
} as const;

const TEXT_SYSTEM = `Du schreibst für Grenz & Co. Research, die Research-Abteilung der Grenz & Co. Immobilienberatungs-GmbH (Köln und Düsseldorf), Investmentmakler für Zinshäuser, Mehrfamilienhäuser und Wohn- und Geschäftshäuser im Rheinland.
Leser sind private und semi-professionelle Immobilieninvestoren: vermögende Privatpersonen, Family Offices, Bestandshalter mit einigen Häusern. Sie wollen in zwei Minuten wissen: Was kostet ein Zinshaus gerade, welche Rendite ist drin, wie teuer ist die Finanzierung, wohin gehen Mieten und Preise, ist jetzt ein guter Zeitpunkt zu kaufen oder zu verkaufen.

Stil:
- Kurz, klar, auf den Punkt. Aktive Sätze, keine Füllwörter, kein Fachjargon ohne Erklärung (Faktor = Kaufpreis durch Jahresnettokaltmiete).
- Souverän und meinungsstark wie ein erfahrener Research-Analyst, aber seriös. „Wir“ steht für Grenz & Co. Research.
- Konkrete Zahlen statt Adjektive. Deutsch. Keine Gedankenstriche (– oder —).

Harte Regeln:
- Verwende ausschließlich Zahlen, die in den gelieferten Kennzahlen stehen, genau so geschrieben. Rechne keine neuen Zahlen aus und runde nicht um.
- Nenne NIE einen Herausgeber, ein anderes Maklerhaus, einen Gutachterausschuss, eine Behörde oder Bank als Quelle und schreibe nie „laut …“ oder „nach Angaben von …“. Alle Aussagen sind Einschätzungen von Grenz & Co. Research („Unsere Auswertung zeigt …“, „Wir beobachten …“).
- Nenne keine Investoren-, Eigentümer- oder Firmennamen.
- Interne Vermarktungszahlen von Grenz & Co. (Mandate, Abschlüsse, Interessenten) gehören nicht in den Bericht.
- Wo Daten dünn sind, formuliere vorsichtig statt zu verallgemeinern, ohne die Datenlage ausführlich zu erklären.

Felder:
- thesen: genau 3 Kernthesen, je höchstens 10 Wörter, Stichwort mit Doppelpunkt, dann die Aussage (z. B. „Mieten ziehen an: Köln plus 4,5 % zum Vorjahr“).
- einleitung: Kurzfassung in 3 Sätzen, die das Wichtigste für Investoren zusammenfasst.
- rahmen: Finanzierung, 2 bis 3 Sätze: Bauzins, Bundesanleihe, und was der Abstand zwischen Rendite und Bauzins für fremdfinanzierte Käufe bedeutet.
- angebot: Preise und Renditen, 3 bis 4 Sätze zu Köln, Düsseldorf, Bonn und Umland: Faktoren, Kaufpreise je m², Bruttorenditen.
- nachfrage: Investmentmarkt und Mieten, 3 Sätze: Umsatz und Belebung des Marktes, Mietentwicklung, was Käufer derzeit suchen.
- ausblick: 3 Sätze zum nächsten Halbjahr, vorsichtig, mit klarer Tendenz.
- empfehlungen: 3 bis 4 Hinweise „Was das für Investoren bedeutet“, je höchstens 22 Wörter, Stichwort mit Doppelpunkt (z. B. „Käufer: Faktoren unter 20 bieten im Umland solide Bruttorenditen“). Keine Anlageberatung im Einzelfall, sondern Markteinordnung.
- ausblickTrends: 4 bis 6 Kennzahlen (Kaufpreisfaktoren, Mieten, Bauzins, Transaktionen, Nachfrage, Angebot) mit Trend der Periode und Prognose fürs nächste Halbjahr.`;

/** Namen fremder Quellen, die im Bericht nicht vorkommen dürfen. */
const QUELLEN =
  /\b(laut|nach angaben|zufolge|bnp|paribas|jll|jones lang|cbre|cushman|wakefield|savills|colliers|engel\s*&\s*völkers|e&v|greif|contzen|aengevelt|dip\b|gutachterausschuss|oberer gutachter|ivd|bundesbank|destatis|bulwiengesa|empirica|greix|immoscout|immowelt|research-berichte?n? anderer)\b/i;

export function quellenGenannt(texte: MarktberichtTexte): string[] {
  const felder: [string, string | undefined][] = [
    ["Thesen", texte.thesen?.join(" ")],
    ["Kurzfassung", texte.einleitung],
    ["Finanzierung", texte.rahmen],
    ["Preise und Renditen", texte.angebot],
    ["Investmentmarkt", texte.nachfrage],
    ["Ausblick", texte.ausblick],
    ["Empfehlungen", texte.empfehlungen?.join(" ")],
  ];
  return felder
    .map(([name, t]) => {
      const m = (t ?? "").match(QUELLEN);
      return m
        ? `${name}: „${m[0]}“ nennt eine fremde Quelle. Bitte umformulieren.`
        : null;
    })
    .filter((x): x is string => x !== null);
}

type RohTexte = {
  thesen: string[];
  einleitung: string;
  rahmen: string;
  angebot: string;
  nachfrage: string;
  ausblick: string;
  empfehlungen: string[];
  ausblickTrends: NonNullable<MarktberichtTexte["ausblickTrends"]>;
};

async function texteAnfragen(
  kontext: string,
  korrektur?: string,
): Promise<MarktberichtTexte> {
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
        content: `<kennzahlen>\n${kontext}\n</kennzahlen>\n\nSchreibe die Texte des Marktberichts als JSON.${korrektur ? `\n\nDein letzter Entwurf hatte diese Fehler, vermeide sie:\n${korrektur}` : ""}`,
      },
    ],
  });
  const roh = JSON.parse(textAus(antwort)) as RohTexte;
  return {
    thesen: roh.thesen.slice(0, 3).map(ohneStriche),
    einleitung: ohneStriche(roh.einleitung),
    rahmen: ohneStriche(roh.rahmen),
    angebot: ohneStriche(roh.angebot),
    nachfrage: ohneStriche(roh.nachfrage),
    ausblick: ohneStriche(roh.ausblick),
    empfehlungen: roh.empfehlungen.slice(0, 4).map(ohneStriche),
    ausblickTrends: roh.ausblickTrends.slice(0, 6),
  };
}

export async function texteEntwurf(
  k: MarktberichtKennzahlen,
  benchmarks: Benchmark[],
): Promise<MarktberichtTexte> {
  const kontext = kennzahlenText(k, benchmarks);
  let texte = await texteAnfragen(kontext);
  let fehler = [...quellenGenannt(texte), ...pruefe(texte, kontext)];
  // Einmal nachbessern lassen, wenn eine Quelle genannt ist oder Zahlen nicht belegt sind.
  if (fehler.length) {
    texte = await texteAnfragen(kontext, fehler.join("\n"));
    fehler = [...quellenGenannt(texte), ...pruefe(texte, kontext)];
  }
  texte.pruefhinweise = fehler;
  return texte;
}

/** Zahlen in den Texten, die nicht in den Kennzahlen stehen, als Hinweis für die Redaktion. */
export function pruefe(texte: MarktberichtTexte, kontext: string): string[] {
  const hinweise: string[] = [];
  const felder: [string, string | undefined][] = [
    ["Thesen", texte.thesen?.join(" ")],
    ["Kurzfassung", texte.einleitung],
    ["Finanzierung", texte.rahmen],
    ["Preise und Renditen", texte.angebot],
    ["Investmentmarkt", texte.nachfrage],
    ["Ausblick", texte.ausblick],
    ["Empfehlungen", texte.empfehlungen?.join(" ")],
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
          relevanz: {
            type: "integer",
            description:
              "0 bis 100: Bedeutung für einen Bericht über Zinshäuser im Rheinland",
          },
        },
        required: [
          "kennzahl",
          "region",
          "wert",
          "einheit",
          "veraenderung",
          "seite",
          "zitat",
          "relevanz",
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
- Nur Werte, die wörtlich im Dokument stehen. "zitat" ist der exakte, zusammenhängende Textausschnitt (ein Satz oder eine Tabellenzeile, höchstens 300 Zeichen) mit der Zahl genau so geschrieben wie im Dokument, ohne Auslassungen. "seite" die Seitenzahl im PDF (ab 1), bei Webseiten 1.
- "relevanz": Wohnen, Mehrfamilienhäuser und Wohn- und Geschäftshäuser in Köln, Düsseldorf, Bonn und NRW hoch; Deutschland-Werte für Wohnen mittel; Büro, Logistik oder Einzelhandel niedrig.
- "wert" als Zahl (z. B. 3.81 für „3,81 %“, 749 für „749 Mio. €“), "einheit" z. B. „%“, „Mio. €“, „€/m²“, „Faktor“.
- "veraenderung" so wie im Dokument („+34 % y/y“, „+10 bp“) oder leer.
- "region" z. B. „Düsseldorf“, „Köln“, „Top-7“, „Deutschland“.
- Höchstens 15 Kennzahlen, die wichtigsten zuerst.`;

export type DokumentInhalt =
  | { pdfBase64: string }
  | { text: string; art: "pdf" | "html" };

/** Kennzahlen aus einem Marktbericht (PDF oder Text einer Webseite) mit Seite und Zitat. */
export async function benchmarksAusDokument(
  inhalt: DokumentInhalt,
  titel: string,
  url?: string,
): Promise<Benchmark[]> {
  const dokument: Anthropic.DocumentBlockParam =
    "pdfBase64" in inhalt
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: inhalt.pdfBase64,
          },
          title: titel,
        }
      : {
          type: "document",
          source: { type: "text", media_type: "text/plain", data: inhalt.text },
          title: titel,
        };
  const antwort = await client()
    .messages.stream({
      model: MODELL,
      max_tokens: 10000,
      system: BENCH_SYSTEM,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: BENCH_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            dokument,
            { type: "text", text: "Lies die Kennzahlen als JSON aus." },
          ],
        },
      ],
    })
    .finalMessage();
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
      relevanz: number;
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
      ...(x.veraenderung ? { veraenderung: x.veraenderung } : {}),
      quelle: `${roh.herausgeber}, ${titel.replace(/\.pdf$/i, "")}`,
      stichtag,
      ...(Number.isInteger(x.seite) && x.seite > 0 ? { seite: x.seite } : {}),
      ...(url ? { url } : {}),
      zitat: x.zitat.slice(0, 400),
      relevanz: Math.max(0, Math.min(100, Math.round(x.relevanz))),
      geprueft: false,
    }));
}

/** Hochgeladenes PDF auslesen (Editor). */
export function benchmarksAusPdf(
  pdfBase64: string,
  dateiname: string,
): Promise<Benchmark[]> {
  return benchmarksAusDokument({ pdfBase64 }, dateiname);
}
