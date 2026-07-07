/**
 * Server-only Exposé-Extraktion via OpenAI gpt-4o-mini.
 * Niemals aus Client-Code importieren (nur Typen sind client-safe).
 */
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-4o-mini";

const KONFIDENZ_SCHWELLE = 0.75;

export type ExposeFeldQuelle = {
  value: string | null;
  verbatimQuote: string | null;
  page: number | null;
  konfidenz: number;
};

export type AnalyzeExposeRequest = {
  documentTitle?: string;
  /** Delimited page text from extractPdfForChat */
  modelContext: string;
};

export const EXPOSE_FELD_DEFINITIONEN = [
  { id: "objektadresse", label: "Objektadresse" },
  { id: "kaufpreis", label: "Kaufpreis" },
  { id: "wohnNutzflaeche", label: "Wohn-/Nutzfläche" },
  { id: "anzahlEinheiten", label: "Anzahl Einheiten" },
  { id: "baujahr", label: "Baujahr" },
  { id: "faktorRendite", label: "Faktor/Rendite" },
  { id: "maklerKontakt", label: "Makler/Kontakt" },
] as const;

export type ExposeFeldId = (typeof EXPOSE_FELD_DEFINITIONEN)[number]["id"];

export const EXPOSE_FELD_IDS = EXPOSE_FELD_DEFINITIONEN.map((d) => d.id);

export type ExposeFelder = Record<ExposeFeldId, ExposeFeldQuelle>;

export type AnalyzeExposeResponse = {
  fields: ExposeFelder;
};

function getOpenAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  return key || null;
}

function feldSchema(): string {
  return [
    '      "value": "<string oder null>",',
    '      "verbatimQuote": "<exakter Zitat-Text aus dem PDF oder null>",',
    '      "page": <Dateiseite als Zahl oder null>,',
    '      "konfidenz": <0.0 bis 1.0>',
  ].join("\n");
}

function buildPrompt(): string {
  return [
    "Du bist ein Assistent für deutsche Immobilien-Exposés (FRENKEN Verwaltung).",
    "Extrahiere strukturierte Felder aus dem bereitgestellten PDF-Text.",
    "",
    "=== WICHTIG ===",
    "- Nur extrahieren, was eindeutig im Dokument steht — keine Vermutungen.",
    "- Nicht alle Exposés enthalten alle Felder: fehlende Angaben als value null lassen.",
    "- verbatimQuote: exakter Wortlaut aus dem PDF — kurz (idealerweise eine Zeile), wörtlich kopiert, keine Zusammenfassung.",
    "- page: Dateiseite (1-basiert), passend zum Marker <<<PAGE n>>> im Text — nicht die gedruckte Seitennummer.",
    "- Bei Unsicherheit: value null, verbatimQuote null, page null, konfidenz niedrig (< 0.5).",
    "",
    "Felder:",
    "- objektadresse: Adresse der angebotenen Immobilie (Straße, PLZ, Ort des Objekts).",
    "  Nur wenn explizit als Objekt-/Immobilien-/Lageadresse erkennbar (z. B. „Objektadresse“, „Lage“, „Standort“, „Property location“).",
    "  NICHT verwenden: Makler-/Firmen-/Büroadresse, Impressum, Kontaktblock, Verkäufer-Standort, Briefkopf-Footer.",
    "  Wenn nur eine Firmenadresse im Dokument steht, aber keine Objektadresse → value null.",
    "- kaufpreis: Kaufpreis / Angebotspreis (z. B. „1.250.000 €“ oder „1,25 Mio. €“).",
    "- wohnNutzflaeche: Wohn- und/oder Nutzfläche in m² (z. B. „450 m² Wohnfläche“ oder „320 m² NF“).",
    "- anzahlEinheiten: Anzahl Wohn-/Gewerbeeinheiten (z. B. „6 WE“ oder „12 Einheiten“).",
    "- baujahr: Jahr der Errichtung (z. B. „1972“ oder „Baujahr 1985“).",
    "- faktorRendite: Kaufpreisfaktor und/oder Rendite (z. B. „Faktor 18,5“ oder „5,2 % Rendite“).",
    "- maklerKontakt: Maklerfirma, Ansprechpartner, Telefon, E-Mail — kompakt in value zusammenfassen.",
    "  verbatimQuote: nur ein kurzes, zusammenhängendes Zitat (eine Zeile, max. ~80 Zeichen), z. B. Firmenname oder Telefonzeile.",
    "",
    "Antworte ausschließlich mit gültigem JSON (kein Markdown):",
    "{",
    '  "fields": {',
    '    "objektadresse": {',
    feldSchema(),
    "    },",
    '    "kaufpreis": {',
    feldSchema(),
    "    },",
    '    "wohnNutzflaeche": {',
    feldSchema(),
    "    },",
    '    "anzahlEinheiten": {',
    feldSchema(),
    "    },",
    '    "baujahr": {',
    feldSchema(),
    "    },",
    '    "faktorRendite": {',
    feldSchema(),
    "    },",
    '    "maklerKontakt": {',
    feldSchema(),
    "    }",
    "  }",
    "}",
  ].join("\n");
}

type OpenAiResponse = {
  output?: {
    type?: string;
    content?: { type?: string; text?: string }[];
  }[];
  output_text?: string;
  error?: { message?: string };
};

function extractText(json: OpenAiResponse): string {
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text;
  }
  const parts: string[] = [];
  for (const item of json.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join(" ");
}

function leeresFeld(): ExposeFeldQuelle {
  return { value: null, verbatimQuote: null, page: null, konfidenz: 0 };
}

function parseFeld(raw: unknown): ExposeFeldQuelle {
  if (!raw || typeof raw !== "object") return leeresFeld();
  const o = raw as Record<string, unknown>;

  const value =
    typeof o.value === "string" && o.value.trim() ? o.value.trim() : null;
  const verbatimQuote =
    typeof o.verbatimQuote === "string" && o.verbatimQuote.trim()
      ? o.verbatimQuote.trim()
      : null;
  const page =
    typeof o.page === "number" && Number.isInteger(o.page) && o.page >= 1
      ? o.page
      : null;
  const konfidenz =
    typeof o.konfidenz === "number" && o.konfidenz >= 0 && o.konfidenz <= 1
      ? o.konfidenz
      : 0;

  if (konfidenz < KONFIDENZ_SCHWELLE) {
    return { value: null, verbatimQuote, page, konfidenz };
  }

  return { value, verbatimQuote, page, konfidenz };
}

function leereFelder(): ExposeFelder {
  return Object.fromEntries(EXPOSE_FELD_IDS.map((id) => [id, leeresFeld()])) as ExposeFelder;
}

function parseJsonResponse(raw: string): AnalyzeExposeResponse {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return { fields: leereFelder() };
  }

  const fieldsRaw =
    parsed.fields && typeof parsed.fields === "object"
      ? (parsed.fields as Record<string, unknown>)
      : {};

  const fields = leereFelder();
  for (const id of EXPOSE_FELD_IDS) {
    fields[id] = parseFeld(fieldsRaw[id]);
  }

  return { fields };
}

export async function handleAnalyzeExposeRequest(
  body: AnalyzeExposeRequest,
): Promise<AnalyzeExposeResponse> {
  const apiKey = getOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY ist nicht konfiguriert. Trage den Schlüssel in .env.local ein und starte den Dev-Server neu.",
    );
  }

  const context = body.modelContext?.trim();
  if (!context) {
    throw new Error("Kein PDF-Text zum Analysieren vorhanden.");
  }

  const title = body.documentTitle?.trim() || "Exposé";
  const userText = [
    `Dokument: ${title}`,
    "",
    "=== PDF-TEXT (Seiten mit <<<PAGE n>>>) ===",
    context.slice(0, 120_000),
  ].join("\n");

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: buildPrompt(),
      input: [{ role: "user", content: [{ type: "input_text", text: userText }] }],
      max_output_tokens: 2000,
      temperature: 0,
    }),
  });

  const json = (await res.json()) as OpenAiResponse;
  if (!res.ok) {
    throw new Error(json.error?.message ?? `OpenAI Fehler (${res.status})`);
  }

  return parseJsonResponse(extractText(json));
}
