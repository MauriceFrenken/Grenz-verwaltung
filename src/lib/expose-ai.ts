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

export type ExposeFeldGruppe = "immobilie" | "transaktion";
export type ExposeFeldTyp = "zahl" | "text" | "auswahl";

export const EXPOSE_FELD_DEFINITIONEN = [
  { id: "baujahr", label: "Baujahr", gruppe: "immobilie" as const, typ: "zahl" as const },
  { id: "heizungsart", label: "Heizungsart", gruppe: "immobilie" as const, typ: "text" as const },
  { id: "energieausweis", label: "Energieausweis", gruppe: "immobilie" as const, typ: "auswahl" as const },
  { id: "anzahlWohnungen", label: "Anzahl Wohnungen", gruppe: "immobilie" as const, typ: "zahl" as const },
  { id: "mietflaecheGesamt", label: "Mietfläche gesamt", gruppe: "immobilie" as const, typ: "zahl" as const },
  { id: "wohnflaeche", label: "Wohnfläche", gruppe: "immobilie" as const, typ: "zahl" as const },
  { id: "gewerbeflaeche", label: "Gewerbefläche", gruppe: "immobilie" as const, typ: "zahl" as const },
  { id: "anzahlStellplaetze", label: "Anzahl Stellplätze", gruppe: "immobilie" as const, typ: "zahl" as const },
  { id: "makler", label: "Makler", gruppe: "transaktion" as const, typ: "text" as const },
  {
    id: "jahresnettokaltmiete",
    label: "Jahresnettokaltmiete",
    gruppe: "transaktion" as const,
    typ: "zahl" as const,
  },
  { id: "objektzustand", label: "Objektzustand", gruppe: "transaktion" as const, typ: "auswahl" as const },
] as const;

/** Felder, die beim Anlegen gesetzt werden — nicht per KI extrahiert. */
export const EXPOSE_SYSTEM_FELDER = [
  { id: "status", label: "Status", gruppe: "transaktion" as const, wert: "Auf dem Markt" },
  {
    id: "minAufDemMarktSeit",
    label: "Min. auf dem Markt seit",
    gruppe: "transaktion" as const,
    autoDatum: true as const,
  },
] as const;

export const EXPOSE_FELD_GRUPPEN: { id: ExposeFeldGruppe; label: string }[] = [
  { id: "immobilie", label: "Real Estate" },
  { id: "transaktion", label: "Transaktionsdatensatz" },
];

export type ExposeFeldId = (typeof EXPOSE_FELD_DEFINITIONEN)[number]["id"];

export const EXPOSE_FELD_IDS = EXPOSE_FELD_DEFINITIONEN.map((d) => d.id);

export type ExposeFelder = Record<ExposeFeldId, ExposeFeldQuelle>;

export type AnalyzeExposeResponse = {
  fields: ExposeFelder;
};

const FELD_ANWEISUNGEN: Record<ExposeFeldId, string> = {
  baujahr:
    "Baujahr / Jahr der Errichtung als vierstellige Jahreszahl (z. B. „1972“). Nur die Zahl in value — kein Text.",
  heizungsart:
    "Heizungsart als Freitext (z. B. „Gas-Etagenheizungen“, „Öl-Zentralheizung“, „Fernwärme“). Nur die Art, keine Kontaktdaten.",
  energieausweis:
    "Energieeffizienzklasse des Energieausweises — nur die Klasse in value (z. B. „A+“, „A“, „B“, „C“, „D“, „E“, „F“, „G“, „H“). Keine Zusatzinfos.",
  anzahlWohnungen:
    "Anzahl Wohnungen / Wohneinheiten (z. B. „6 WE“). Nur die Zahl in value — keine Einheit, kein „WE“.",
  mietflaecheGesamt:
    "Gesamte vermietbare / Mietfläche in Quadratmetern. Nur die Zahl in value — kein m², qm oder Quadratmeter.",
  wohnflaeche:
    "Wohnfläche in Quadratmetern. Nur die Zahl in value — kein m², qm oder Quadratmeter.",
  gewerbeflaeche:
    "Gewerbefläche in Quadratmetern. Nur die Zahl in value — kein m², qm oder Quadratmeter. null wenn nicht angegeben.",
  anzahlStellplaetze:
    "Anzahl Stellplätze / Parkplätze / Garagen. Nur die Zahl in value — keine Einheit.",
  makler:
    "Maklerfirma / Immobilienmakler (z. B. „Engel & Völkers“, „JLL“). Nur Firmenname — keine Telefonnummern oder E-Mails.",
  jahresnettokaltmiete:
    "Jahresnettokaltmiete / Jahreskaltmiete / Ist-Miete p.a. Nur die Zahl in value — kein €, EUR oder Währung. Bei Monatsmiete: Jahreswert berechnen (× 12).",
  objektzustand:
    "Objektzustand als Buchstabe A, B, C oder D — nur wenn im Exposé explizit als Zustandsklasse (A–D) erkennbar. Bei Unsicherheit: value null, konfidenz niedrig.",
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
  const feldListe = EXPOSE_FELD_DEFINITIONEN.map(
    (d) => `- ${d.id}: ${FELD_ANWEISUNGEN[d.id]}`,
  ).join("\n");

  const jsonFelder = EXPOSE_FELD_DEFINITIONEN.map(
    (d) => `    "${d.id}": {\n${feldSchema()}\n    }`,
  ).join(",\n");

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
    "=== ZAHLEN-FORMAT ===",
    "- Alle Felder vom Typ „Zahl“: value enthält ausschließlich Ziffern (ggf. Dezimalpunkt).",
    "- Keine Währung (€, EUR, USD), keine Flächeneinheit (m², qm), keine Prozentzeichen, keine Tausendertrennzeichen.",
    "- Beispiele: „1.250.000 €“ → value „1250000“, „450 m²“ → value „450“, „6 WE“ → value „6“.",
    "",
    "Felder:",
    feldListe,
    "",
    "Antworte ausschließlich mit gültigem JSON (kein Markdown):",
    "{",
    '  "fields": {',
    jsonFelder,
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

function parseDeutscheZahl(raw: string): number | null {
  let s = raw.replace(/[^\d.,]/g, "").trim();
  if (!s) return null;

  if (s.includes(".") && s.includes(",")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    const [, nachkomma] = s.split(",");
    if (nachkomma !== undefined && nachkomma.length <= 2) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(".")) {
    const [, nachkomma] = s.split(".");
    if (nachkomma !== undefined && nachkomma.length === 3) {
      s = s.replace(/\./g, "");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeZahl(raw: string | null, ganzzahl: boolean): string | null {
  if (!raw) return null;

  let s = raw.trim();
  const mio = s.match(/([\d.,]+)\s*Mio\.?/i);
  if (mio) {
    const basis = parseDeutscheZahl(mio[1]);
    if (basis !== null) {
      const wert = basis * 1_000_000;
      return ganzzahl ? String(Math.round(wert)) : String(wert);
    }
  }

  const n = parseDeutscheZahl(s);
  if (n === null) return null;
  return ganzzahl ? String(Math.round(n)) : String(n);
}

function normalizeEnergieausweis(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.trim().match(/\b([A-H]\+?)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function normalizeObjektzustand(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.trim().match(/\b([A-D])\b/i);
  return match ? match[1].toUpperCase() : null;
}

function normalizeBaujahr(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return match ? match[1] : normalizeZahl(raw, true);
}

function normalizeFeldWert(id: ExposeFeldId, value: string | null): string | null {
  if (!value) return null;

  const def = EXPOSE_FELD_DEFINITIONEN.find((d) => d.id === id);
  if (!def) return value;

  switch (def.typ) {
    case "zahl":
      if (id === "baujahr") return normalizeBaujahr(value);
      return normalizeZahl(value, id !== "jahresnettokaltmiete");
    case "auswahl":
      if (id === "energieausweis") return normalizeEnergieausweis(value);
      if (id === "objektzustand") return normalizeObjektzustand(value);
      return value.trim() || null;
    default:
      return value.trim() || null;
  }
}

function parseFeld(id: ExposeFeldId, raw: unknown): ExposeFeldQuelle {
  if (!raw || typeof raw !== "object") return leeresFeld();
  const o = raw as Record<string, unknown>;

  const rawValue =
    typeof o.value === "string" && o.value.trim() ? o.value.trim() : null;
  const value = normalizeFeldWert(id, rawValue);
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
    fields[id] = parseFeld(id, fieldsRaw[id]);
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
      max_output_tokens: 3000,
      temperature: 0,
    }),
  });

  const json = (await res.json()) as OpenAiResponse;
  if (!res.ok) {
    throw new Error(json.error?.message ?? `OpenAI Fehler (${res.status})`);
  }

  return parseJsonResponse(extractText(json));
}
