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

const TEXT_PROPS = {
  thesen: { type: "array", items: { type: "string" } },
  einleitung: { type: "string" },
  rahmen: { type: "string" },
  angebot: { type: "string" },
  nachfrage: { type: "string" },
  ausblick: { type: "string" },
  schlagzeilen: {
    type: "object",
    properties: {
      rahmen: { type: "string" },
      angebot: { type: "string" },
      nachfrage: { type: "string" },
      ausblick: { type: "string" },
    },
    required: ["rahmen", "angebot", "nachfrage", "ausblick"],
    additionalProperties: false,
  },
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
} as const;

const TEXT_FELDER = [
  "thesen",
  "einleitung",
  "rahmen",
  "angebot",
  "nachfrage",
  "ausblick",
  "schlagzeilen",
  "empfehlungen",
  "ausblickTrends",
] as const;

const TEXT_SCHEMA = {
  type: "object",
  properties: TEXT_PROPS,
  required: TEXT_FELDER,
  additionalProperties: false,
} as const;

const CHAT_SCHEMA = {
  type: "object",
  properties: { antwort: { type: "string" }, ...TEXT_PROPS },
  required: ["antwort", ...TEXT_FELDER],
  additionalProperties: false,
} as const;

/** Stil- und Inhaltsregeln, gemeinsam für den Entwurf und den Chat. */
const REGELN = `Absender ist Grenz & Co. Research, die Research-Abteilung der Grenz & Co. Immobilienberatungs-GmbH (Köln und Düsseldorf), Investmentmakler für Zinshäuser, Mehrfamilienhäuser und Wohn- und Geschäftshäuser im Rheinland.
Leser sind vermögende Privatanleger, Family Offices und Bestandshalter mit einigen Häusern. Sie lesen den Bericht in zwei Minuten und wollen wissen: Was kostet ein Zinshaus, welche Rendite ist drin, was kostet die Finanzierung, wohin gehen Mieten und Preise, was heißt das für Kauf, Verkauf und Bestand.

Stil (Niveau eines Research-Briefs einer Privatbank):
- Jeder Abschnitt beginnt mit der Kernaussage, danach höchstens zwei belegende Sätze. Keine Einleitungsfloskeln („Im ersten Halbjahr zeigte sich …“, „Insgesamt lässt sich festhalten …“).
- Präzise, nüchtern, souverän. Aktive Verben, kurze Hauptsätze, höchstens 22 Wörter pro Satz. Keine Schachtelsätze, keine Klammern, keine Ausrufe, kein Marketing.
- Höchstens drei Zahlen pro Satz. Jede Zahl trägt eine Aussage; keine Zahlenaufzählungen. Dieselbe Zahl nicht in mehreren Abschnitten wiederholen, außer in Thesen und Kurzfassung.
- Fachbegriffe wie Faktor, Bruttorendite, Basispunkte dürfen vorkommen, aber nicht in Klammern erklärt werden (die Erklärung steht im Bericht).
- „Wir“ steht für Grenz & Co. Research. Einschätzungen klar als solche formulieren („Wir erwarten …“).
- Deutsch, keine Gedankenstriche (– oder —), keine Plus-Zeichen vor Zahlen im Fließtext („um 4,5 %“ statt „+4,5 %“).

Harte Regeln:
- Verwende ausschließlich Zahlen, die in den gelieferten Kennzahlen stehen, genau so geschrieben. Rechne nichts neu aus, runde nicht.
- Nenne NIE einen Herausgeber, ein anderes Maklerhaus, einen Gutachterausschuss, eine Behörde oder Bank als Quelle und schreibe nie „laut …“ oder „nach Angaben von …“. Alle Aussagen sind Einschätzungen von Grenz & Co. Research.
- Nenne keine Investoren-, Eigentümer- oder Firmennamen. Keine internen Vermarktungszahlen von Grenz & Co.
- Werte mit älterem Stand (z. B. Gesamtjahr 2025) als solche kennzeichnen („2025“), nicht als aktuelles Halbjahr ausgeben.

Felder und Längen:
- thesen: genau 3, je höchstens 8 Wörter, „Stichwort: Aussage“ (z. B. „Mieten: Düsseldorf legt um 7,4 % zu“).
- einleitung: Kurzfassung, genau 3 Sätze, höchstens 60 Wörter.
- schlagzeilen: je Abschnitt eine Schlagzeile mit der Kernaussage, höchstens 8 Wörter, ohne Punkt (z. B. „Renditen liegen nur knapp über dem Bauzins“).
- rahmen (Finanzierung): 2 bis 3 Sätze, höchstens 60 Wörter.
- angebot (Preise und Renditen): 3 Sätze, höchstens 70 Wörter. Köln, Düsseldorf, Bonn, Umland vergleichen, nicht nacheinander aufzählen.
- nachfrage (Markt und Mieten): 3 Sätze, höchstens 70 Wörter.
- ausblick: 3 Sätze, höchstens 60 Wörter, klare Tendenz.
- empfehlungen: genau 4, für Käufer, Verkäufer, Bestandshalter und Finanzierung, je „Stichwort: Hinweis“, höchstens 16 Wörter. Markteinordnung, keine Anlageberatung im Einzelfall.
- ausblickTrends: 4 bis 6 Kennzahlen (Kaufpreisfaktoren, Mieten, Bauzins, Transaktionen, Nachfrage, Angebot) mit Trend der Periode und Prognose fürs nächste Halbjahr.`;

const TEXT_SYSTEM = `Du schreibst den halbjährlichen Marktbericht „Zinshäuser Rheinland“.\n\n${REGELN}`;

const CHAT_SYSTEM = `Du überarbeitest den Marktbericht „Zinshäuser Rheinland“ nach der Anweisung eines Mitarbeiters von Grenz & Co.\n\n${REGELN}\n\nVorgehen:\n- Setze die Anweisung genau um und ändere nur, was sie betrifft. Alle übrigen Felder gibst du unverändert zurück.\n- Verlangt die Anweisung Zahlen, die nicht in den Kennzahlen stehen, oder das Nennen von Quellen, setze sie nicht um und sage das in „antwort“.\n- „antwort“: ein bis zwei Sätze an den Mitarbeiter, was du geändert hast.`;

/** Namen fremder Quellen, die im Bericht nicht vorkommen dürfen. */
const QUELLEN =
  /\b(laut|nach angaben|zufolge|bnp|paribas|jll|jones lang|cbre|cushman|wakefield|savills|colliers|engel\s*&\s*völkers|e&v|greif|contzen|aengevelt|dip\b|gutachterausschuss|oberer gutachter|ivd|bundesbank|destatis|bulwiengesa|empirica|greix|immoscout|immowelt|research-berichte?n? anderer)\b/i;

function felder(texte: MarktberichtTexte): [string, string | undefined][] {
  const s = texte.schlagzeilen ?? {};
  return [
    ["Thesen", texte.thesen?.join(" ")],
    ["Kurzfassung", texte.einleitung],
    ["Schlagzeilen", [s.rahmen, s.angebot, s.nachfrage, s.ausblick].join(" ")],
    ["Finanzierung", texte.rahmen],
    ["Preise und Renditen", texte.angebot],
    ["Markt und Mieten", texte.nachfrage],
    ["Ausblick", texte.ausblick],
    ["Empfehlungen", texte.empfehlungen?.join(" ")],
  ];
}

export function quellenGenannt(texte: MarktberichtTexte): string[] {
  return felder(texte)
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
  schlagzeilen: NonNullable<MarktberichtTexte["schlagzeilen"]>;
  empfehlungen: string[];
  ausblickTrends: NonNullable<MarktberichtTexte["ausblickTrends"]>;
};

const ohnePlus = (s: string) => ohneStriche(s).replace(/(^|\s)\+(?=\d)/g, "$1");
const zeile = (s: string) => ohnePlus(s).replace(/\.$/, "");

function texteAusRoh(roh: RohTexte): MarktberichtTexte {
  return {
    thesen: roh.thesen.slice(0, 3).map(zeile),
    einleitung: ohnePlus(roh.einleitung),
    rahmen: ohnePlus(roh.rahmen),
    angebot: ohnePlus(roh.angebot),
    nachfrage: ohnePlus(roh.nachfrage),
    ausblick: ohnePlus(roh.ausblick),
    schlagzeilen: {
      rahmen: zeile(roh.schlagzeilen.rahmen ?? ""),
      angebot: zeile(roh.schlagzeilen.angebot ?? ""),
      nachfrage: zeile(roh.schlagzeilen.nachfrage ?? ""),
      ausblick: zeile(roh.schlagzeilen.ausblick ?? ""),
    },
    empfehlungen: roh.empfehlungen.slice(0, 4).map(zeile),
    ausblickTrends: roh.ausblickTrends.slice(0, 6),
  };
}

async function anfragen<T>(
  system: string,
  schema: { [key: string]: unknown },
  inhalt: string,
): Promise<T> {
  const antwort = await client()
    .messages.stream({
      model: MODELL,
      max_tokens: 8000,
      system,
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema },
      },
      messages: [{ role: "user", content: inhalt }],
    })
    .finalMessage();
  return JSON.parse(textAus(antwort)) as T;
}

function texteAnfragen(kontext: string, korrektur?: string): Promise<RohTexte> {
  return anfragen<RohTexte>(
    TEXT_SYSTEM,
    TEXT_SCHEMA,
    `<kennzahlen>\n${kontext}\n</kennzahlen>\n\nSchreibe die Texte des Marktberichts als JSON.${korrektur ? `\n\nDein letzter Entwurf hatte diese Fehler, vermeide sie:\n${korrektur}` : ""}`,
  );
}

function fehlerIn(texte: MarktberichtTexte, kontext: string): string[] {
  return [...quellenGenannt(texte), ...pruefe(texte, kontext)];
}

export async function texteEntwurf(
  k: MarktberichtKennzahlen,
  benchmarks: Benchmark[],
): Promise<MarktberichtTexte> {
  const kontext = kennzahlenText(k, benchmarks);
  let texte = texteAusRoh(await texteAnfragen(kontext));
  let fehler = fehlerIn(texte, kontext);
  // Einmal nachbessern lassen, wenn eine Quelle genannt ist oder Zahlen nicht belegt sind.
  if (fehler.length) {
    texte = texteAusRoh(await texteAnfragen(kontext, fehler.join("\n")));
    fehler = fehlerIn(texte, kontext);
  }
  texte.pruefhinweise = fehler;
  return texte;
}

/** Chat im Editor: Texte nach einer Anweisung überarbeiten. Ergebnis ist ungespeichert. */
export async function texteUeberarbeiten(
  k: MarktberichtKennzahlen,
  benchmarks: Benchmark[],
  texte: MarktberichtTexte,
  anweisung: string,
  verlauf: { anweisung: string; antwort: string }[],
): Promise<{ texte: MarktberichtTexte; antwort: string }> {
  const kontext = kennzahlenText(k, benchmarks);
  const bisher = { ...texte };
  delete bisher.pruefhinweise;
  const frueher = verlauf
    .slice(-6)
    .map((v) => `Mitarbeiter: ${v.anweisung}\nDu: ${v.antwort}`)
    .join("\n\n");
  const roh = await anfragen<RohTexte & { antwort: string }>(
    CHAT_SYSTEM,
    CHAT_SCHEMA,
    `<kennzahlen>\n${kontext}\n</kennzahlen>\n\n<bericht>\n${JSON.stringify(bisher, null, 1)}\n</bericht>\n\n${frueher ? `<bisheriger_chat>\n${frueher}\n</bisheriger_chat>\n\n` : ""}<anweisung>\n${anweisung}\n</anweisung>\n\nGib den vollständigen überarbeiteten Bericht als JSON zurück.`,
  );
  const neu = texteAusRoh({
    ...roh,
    // Leere Schlagzeilen der KI nicht übernehmen, wenn es vorher welche gab.
    schlagzeilen: { ...texte.schlagzeilen, ...roh.schlagzeilen },
  } as RohTexte);
  neu.pruefhinweise = fehlerIn(neu, kontext);
  return { texte: neu, antwort: ohneStriche(roh.antwort) };
}

/** Zahlen in den Texten, die nicht in den Kennzahlen stehen, als Hinweis für die Redaktion. */
export function pruefe(texte: MarktberichtTexte, kontext: string): string[] {
  const hinweise: string[] = [];
  for (const [name, t] of felder(texte)) {
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
