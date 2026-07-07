/**
 * Server-only Dokumentenanalyse:
 * - Anhänge: OpenAI gpt-4o-mini (nur OCR / Textextraktion)
 * - Zuordnung: Anthropic Claude Sonnet (nur Text, keine Bilder)
 * Niemals aus Client-Code importieren.
 */
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const OCR_MODEL = "gpt-4o-mini";
const DEFAULT_CLASSIFY_MODEL = "claude-sonnet-4-6";

/** Unterhalb dieser Konfidenz wird Mandant/Objekt verworfen. */
const KONFIDENZ_SCHWELLE_MANDANT_OBJEKT = 0.75;
/** Kategorien dürfen bei klaren Hinweisen (Dateiname, Betreff, OCR) etwas niedriger sein. */
const KONFIDENZ_SCHWELLE_KATEGORIE = 0.5;
/** Unterhalb dieser Schwelle wird auch der Dateiname verworfen. */
const KONFIDENZ_SCHWELLE_DATEINAME = 0.5;

const ANALYSABLE_ATTACHMENT_TYPES = /^(image\/(jpeg|jpg|png|gif|webp)|application\/pdf)$/i;

type IncomingAttachment = {
  name?: string;
  contentType?: string;
  dataBase64?: string;
};

export type KategorieKontext = {
  id: string;
  name: string;
  beschreibung: string;
};

export type MandantKontext = {
  id: string;
  name: string;
  kuerzel: string;
};

export type ObjektKontext = {
  id: string;
  bezeichnung: string;
  mandantId: string;
  adresse: string;
};

export type AnalyzeDokumentRequest = {
  subject?: string;
  from?: string;
  text?: string;
  attachments?: IncomingAttachment[];
  kategorien: KategorieKontext[];
  mandanten: MandantKontext[];
  objekte: ObjektKontext[];
};

export type AnalyzeDokumentResponse = {
  kategorieId: string | null;
  mandantId: string | null;
  objektId: string | null;
  dateiname: string | null;
  konfidenz: number;
  vollstaendig: boolean;
};

function getOpenAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  return key || null;
}

function getAnthropicKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  return key || null;
}

function getClassifyModel(): string {
  const raw = process.env.ANTHROPIC_MODEL?.trim();
  if (raw && raw !== "undefined") return raw;
  return DEFAULT_CLASSIFY_MODEL;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/strasse/g, "str")
    .replace(/straße/g, "str")
    .replace(/str\./g, "str")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textContainsPhrase(haystack: string, needle: string, minLen = 4): boolean {
  const normalizedNeedle = normalizeForMatch(needle);
  if (normalizedNeedle.length < minLen) return false;
  return normalizeForMatch(haystack).includes(normalizedNeedle);
}

function strasseAusAdresse(adresse: string): string {
  return adresse.split(",")[0]?.trim() ?? adresse.trim();
}

function mandantPasstZuText(mandant: MandantKontext, quelltext: string): boolean {
  if (textContainsPhrase(quelltext, mandant.name, 3)) return true;
  if (mandant.kuerzel.trim().length >= 2 && textContainsPhrase(quelltext, mandant.kuerzel, 2)) {
    return true;
  }
  return false;
}

function objektPasstZuText(objekt: ObjektKontext, quelltext: string): boolean {
  const strasse = strasseAusAdresse(objekt.adresse);
  if (strasse.length >= 4 && textContainsPhrase(quelltext, strasse, 4)) return true;

  const strasseOhneHausnummer = strasse.replace(/\s+\d+[a-z]?.*$/i, "").trim();
  if (strasseOhneHausnummer.length >= 4 && textContainsPhrase(quelltext, strasseOhneHausnummer, 4)) {
    return true;
  }

  if (textContainsPhrase(quelltext, objekt.bezeichnung, 3)) return true;

  const plzOrt = objekt.adresse.match(/\b(\d{5}\s+[^\s,]+)/);
  if (plzOrt && textContainsPhrase(quelltext, plzOrt[1], 5)) return true;

  return false;
}

function filterKandidaten(req: AnalyzeDokumentRequest, quelltext: string) {
  const mandanten = req.mandanten.filter((m) => mandantPasstZuText(m, quelltext));
  const mandantIds = new Set(mandanten.map((m) => m.id));
  const objekte = req.objekte.filter(
    (o) => objektPasstZuText(o, quelltext) && (mandanten.length === 0 || mandantIds.has(o.mandantId)),
  );
  return { mandanten, objekte };
}

function kategoriePasstZuKontext(kategorie: KategorieKontext, quelltext: string): boolean {
  if (textContainsPhrase(quelltext, kategorie.name, 3)) return true;

  const stichworte = kategorie.beschreibung
    .split(/[\s,;]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4);
  return stichworte.some((w) => textContainsPhrase(quelltext, w, 4));
}

/** Eindeutiger Kategorie-Treffer aus Betreff, Dateinamen oder OCR-Text. */
function ableiteOffensichtlicheKategorie(
  kategorien: KategorieKontext[],
  quelltext: string,
): string | null {
  const treffer = kategorien.filter((k) => kategoriePasstZuKontext(k, quelltext));
  if (treffer.length === 1) return treffer[0].id;
  return null;
}

function mandantNameMap(mandanten: MandantKontext[]): Map<string, string> {
  return new Map(mandanten.map((m) => [m.id, m.name]));
}

function buildClassifyPrompt(
  req: AnalyzeDokumentRequest,
  kandidaten: { mandanten: MandantKontext[]; objekte: ObjektKontext[] },
  quelltext: string,
): string {
  const mandantNamen = mandantNameMap(req.mandanten);
  const lines = [
    "Du bist ein Assistent einer deutschen Immobilienverwaltung (FRENKEN).",
    "Ordne die E-Mail anhand des Dokumenttexts und der Metadaten zu.",
    "",
    "=== KATEGORIE (moderat zuordnen) ===",
    "kategorieId darf gesetzt werden, wenn der Dokumenttyp aus Betreff, Anhang-Dateinamen,",
    "E-Mail-Text oder OCR-Inhalt klar hervorgeht (z. B. Dateiname „Rechnung.pdf“ → Kategorie Rechnung).",
    "Typische Hinweise: Dateiname, Betreff, Wörter wie Rechnung, Mietvertrag, Nebenkostenabrechnung im Text.",
    "Bei mehreren gleich passenden Kategorien oder völlig unklarem Inhalt: null.",
    "",
    "=== MANDANT / OBJEKT (streng — nur bei Textbeleg) ===",
    "mandantId und objektId NUR wählen, wenn Adresse, Objektbezeichnung oder Mandantenname",
    "eindeutig im Dokumenttext vorkommen. Lieber null als falsch.",
    "Du darfst für Mandant/Objekt NUR IDs aus den Kandidatenlisten unten wählen.",
    "",
    "=== DOKUMENTTEXT ===",
    quelltext.trim() || "(kein Text)",
    "",
    "Verfügbare Kategorien:",
  ];

  for (const k of req.kategorien) {
    lines.push(`- ID "${k.id}" | ${k.name} — ${k.beschreibung}`);
  }

  if (kandidaten.mandanten.length === 0) {
    lines.push(
      "",
      "Mandanten-Kandidaten: KEINE — kein Mandantenname im Dokumenttext gefunden. mandantId MUSS null sein.",
    );
  } else {
    lines.push("", "Mandanten-Kandidaten (nur aus dieser Liste):");
    for (const m of kandidaten.mandanten) {
      lines.push(`- ID "${m.id}" | ${m.name} (${m.kuerzel})`);
    }
  }

  if (kandidaten.objekte.length === 0) {
    lines.push(
      "",
      "Objekt-Kandidaten: KEINE — keine Objektadresse/Bezeichnung im Dokumenttext gefunden. objektId MUSS null sein.",
    );
  } else {
    lines.push("", "Objekt-Kandidaten (nur aus dieser Liste):");
    for (const o of kandidaten.objekte) {
      const mandantName = mandantNamen.get(o.mandantId) ?? o.mandantId;
      lines.push(`- ID "${o.id}" | ${o.bezeichnung} — ${o.adresse} (Mandant: ${mandantName})`);
    }
  }

  lines.push(
    "",
    "Metadaten:",
    `Betreff: ${req.subject?.trim() || "(kein Betreff)"}`,
    `Absender: ${req.from?.trim() || "(unbekannt)"}`,
    "",
    "Antworte ausschließlich mit gültigem JSON (kein Markdown):",
    "{",
    '  "kategorieId": "<uuid oder null>",',
    '  "mandantId": "<id oder null>",',
    '  "objektId": "<id oder null>",',
    '  "dateiname": "<sinnvoller Dateiname mit Endung oder null>",',
    '  "konfidenz": <0.0 bis 1.0>,',
    '  "konfidenzKategorie": <0.0 bis 1.0>,',
    '  "konfidenzMandant": <0.0 bis 1.0>,',
    '  "konfidenzObjekt": <0.0 bis 1.0>',
    "}",
  );

  return lines.join("\n");
}

type OcrContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_file"; filename: string; file_data: string };

function buildOcrContent(att: IncomingAttachment): OcrContentPart[] {
  const contentType = att.contentType?.trim() ?? "";
  const data = att.dataBase64?.trim() ?? "";
  const name = att.name?.trim() || "anhang";

  const parts: OcrContentPart[] = [
    {
      type: "input_text",
      text: `Dateiname: ${name}\nExtrahiere den vollständigen Text aus diesem Dokument.`,
    },
  ];

  if (/^image\//i.test(contentType)) {
    parts.push({
      type: "input_image",
      image_url: `data:${contentType};base64,${data}`,
    });
  } else {
    parts.push({
      type: "input_file",
      filename: name.endsWith(".pdf") ? name : "anhang.pdf",
      file_data: `data:application/pdf;base64,${data}`,
    });
  }

  return parts;
}

type OpenAiResponse = {
  output?: {
    type?: string;
    content?: { type?: string; text?: string }[];
  }[];
  output_text?: string;
  error?: { message?: string };
};

function extractOpenAiText(json: OpenAiResponse): string {
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text;
  }
  const parts: string[] = [];
  for (const item of json.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

async function extrahiereAnhangTexte(
  attachments: IncomingAttachment[] | undefined,
  apiKey: string,
): Promise<string[]> {
  const ergebnisse: string[] = [];

  for (const att of attachments ?? []) {
    const contentType = att.contentType?.trim() ?? "";
    const data = att.dataBase64?.trim() ?? "";
    if (!data || !ANALYSABLE_ATTACHMENT_TYPES.test(contentType)) continue;

    const res = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        instructions:
          "Du bist ein reines OCR-System. Extrahiere den vollständigen Text aus dem Dokument wörtlich. " +
          "Keine Interpretation, keine Zusammenfassung, keine Zuordnung zu Adressen oder Firmen. " +
          "Bei unleserlichen Stellen [unleserlich] schreiben.",
        input: [{ role: "user", content: buildOcrContent(att) }],
        max_output_tokens: 4000,
        temperature: 0,
      }),
    });

    const json = (await res.json()) as OpenAiResponse;
    if (!res.ok) {
      throw new Error(json.error?.message ?? `OpenAI OCR Fehler (${res.status})`);
    }

    const text = extractOpenAiText(json);
    if (text) {
      const name = att.name?.trim() || "Anhang";
      ergebnisse.push(`--- Anhang: ${name} ---\n${text}`);
    }
  }

  return ergebnisse;
}

function baueQuelltext(req: AnalyzeDokumentRequest, anhangTexte: string[]): string {
  const anhangNamen = (req.attachments ?? [])
    .map((a) => a.name?.trim())
    .filter((name): name is string => Boolean(name));

  const teile = [
    `Betreff: ${req.subject?.trim() || "(kein Betreff)"}`,
    `Absender: ${req.from?.trim() || "(unbekannt)"}`,
  ];

  if (anhangNamen.length > 0) {
    teile.push(`Anhang-Dateinamen: ${anhangNamen.join(", ")}`);
  }

  teile.push("", "E-Mail-Text:", req.text?.trim() || "(kein E-Mail-Text)");

  if (anhangTexte.length > 0) {
    teile.push("", "Anhang-Text (OCR):", ...anhangTexte);
  }

  return teile.join("\n");
}

type AnthropicResponse = {
  content?: { type?: string; text?: string }[];
  error?: { type?: string; message?: string };
};

function anthropicFehlermeldung(json: AnthropicResponse, status: number): string {
  const msg = json.error?.message?.trim();
  if (!msg) return `Anthropic Fehler (${status})`;
  if (msg.startsWith("model:")) {
    const modell = msg.replace(/^model:\s*/i, "");
    return `Anthropic-Modell „${modell}" ist nicht verfügbar (evtl. eingestellt). Setze ANTHROPIC_MODEL in .env.local, z. B. claude-sonnet-4-6.`;
  }
  return msg;
}

function extractAnthropicText(json: AnthropicResponse): string {
  const parts: string[] = [];
  for (const block of json.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

async function klassifiziereMitClaude(
  req: AnalyzeDokumentRequest,
  quelltext: string,
  kandidaten: { mandanten: MandantKontext[]; objekte: ObjektKontext[] },
  apiKey: string,
): Promise<string> {
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getClassifyModel(),
      max_tokens: 512,
      temperature: 0,
      system: buildClassifyPrompt(req, kandidaten, quelltext),
      messages: [
        {
          role: "user",
          content: "Analysiere den Dokumenttext im System-Prompt und antworte mit JSON.",
        },
      ],
    }),
  });

  const json = (await res.json()) as AnthropicResponse;
  if (!res.ok) {
    throw new Error(anthropicFehlermeldung(json, res.status));
  }

  return extractAnthropicText(json);
}

function liesFeldKonfidenz(
  parsed: Record<string, unknown>,
  schluessel: string,
  fallback: number,
): number {
  const wert = parsed[schluessel];
  if (typeof wert === "number" && wert >= 0 && wert <= 1) return wert;
  return fallback;
}

function validiereGegenQuelltext(
  req: AnalyzeDokumentRequest,
  mandantId: string | null,
  objektId: string | null,
  quelltext: string,
): { mandantId: string | null; objektId: string | null } {
  let nextMandantId = mandantId;
  let nextObjektId = objektId;

  if (nextMandantId) {
    const mandant = req.mandanten.find((m) => m.id === nextMandantId);
    if (!mandant || !mandantPasstZuText(mandant, quelltext)) {
      nextMandantId = null;
    }
  }

  if (nextObjektId) {
    const objekt = req.objekte.find((o) => o.id === nextObjektId);
    if (!objekt || !objektPasstZuText(objekt, quelltext)) {
      nextObjektId = null;
    }
  }

  if (nextObjektId && nextMandantId) {
    const objekt = req.objekte.find((o) => o.id === nextObjektId);
    if (objekt && objekt.mandantId !== nextMandantId) {
      nextObjektId = null;
    }
  }

  return { mandantId: nextMandantId, objektId: nextObjektId };
}

function parseJsonResponse(
  raw: string,
  req: AnalyzeDokumentRequest,
  quelltext: string,
  kandidaten: { mandanten: MandantKontext[]; objekte: ObjektKontext[] },
): AnalyzeDokumentResponse {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return {
      kategorieId: null,
      mandantId: null,
      objektId: null,
      dateiname: null,
      konfidenz: 0,
      vollstaendig: false,
    };
  }

  const kategorieIds = new Set(req.kategorien.map((k) => k.id));
  const mandantIds = new Set(kandidaten.mandanten.map((m) => m.id));
  const objektIds = new Set(kandidaten.objekte.map((o) => o.id));
  const objektMandant = new Map(req.objekte.map((o) => [o.id, o.mandantId]));

  let kategorieId =
    typeof parsed.kategorieId === "string" && kategorieIds.has(parsed.kategorieId)
      ? parsed.kategorieId
      : null;
  let mandantId =
    typeof parsed.mandantId === "string" && mandantIds.has(parsed.mandantId)
      ? parsed.mandantId
      : null;
  let objektId =
    typeof parsed.objektId === "string" && objektIds.has(parsed.objektId) ? parsed.objektId : null;
  let dateiname =
    typeof parsed.dateiname === "string" && parsed.dateiname.trim()
      ? parsed.dateiname.trim()
      : null;
  const konfidenz =
    typeof parsed.konfidenz === "number" && parsed.konfidenz >= 0 && parsed.konfidenz <= 1
      ? parsed.konfidenz
      : 0;

  if (objektId) {
    const erwarteterMandant = objektMandant.get(objektId);
    if (mandantId && erwarteterMandant !== mandantId) {
      objektId = null;
    } else if (!mandantId && erwarteterMandant) {
      mandantId = erwarteterMandant;
    }
  }

  if (kategorieId) {
    const kategorieKonfidenz = liesFeldKonfidenz(parsed, "konfidenzKategorie", konfidenz);
    const hatOffensichtlichenBeleg =
      kategorieId === ableiteOffensichtlicheKategorie(req.kategorien, quelltext);
    const schwelle = hatOffensichtlichenBeleg ? 0.35 : KONFIDENZ_SCHWELLE_KATEGORIE;
    if (kategorieKonfidenz < schwelle) {
      kategorieId = null;
    }
  }
  if (mandantId && liesFeldKonfidenz(parsed, "konfidenzMandant", 0) < KONFIDENZ_SCHWELLE_MANDANT_OBJEKT) {
    mandantId = null;
  }
  if (objektId && liesFeldKonfidenz(parsed, "konfidenzObjekt", 0) < KONFIDENZ_SCHWELLE_MANDANT_OBJEKT) {
    objektId = null;
  }

  const validiert = validiereGegenQuelltext(req, mandantId, objektId, quelltext);
  mandantId = validiert.mandantId;
  objektId = validiert.objektId;

  // Niedrige Gesamtkonfidenz betrifft nur Mandant/Objekt — Kategorie separat behandeln
  if (konfidenz < KONFIDENZ_SCHWELLE_MANDANT_OBJEKT) {
    mandantId = null;
    objektId = null;
  }

  if (!kategorieId) {
    kategorieId = ableiteOffensichtlicheKategorie(req.kategorien, quelltext);
  }
  if (konfidenz < KONFIDENZ_SCHWELLE_DATEINAME) {
    dateiname = null;
  }

  const vollstaendig = Boolean(kategorieId && mandantId && objektId && dateiname);

  return { kategorieId, mandantId, objektId, dateiname, konfidenz, vollstaendig };
}

export async function handleAnalyzeDokumentRequest(
  body: AnalyzeDokumentRequest,
): Promise<AnalyzeDokumentResponse> {
  const openAiKey = getOpenAiKey();
  const anthropicKey = getAnthropicKey();

  if (!openAiKey) {
    throw new Error(
      "OPENAI_API_KEY ist nicht konfiguriert. Trage den Schlüssel in .env.local ein und starte den Dev-Server neu.",
    );
  }
  if (!anthropicKey) {
    throw new Error(
      "ANTHROPIC_API_KEY ist nicht konfiguriert. Trage den Schlüssel in .env.local ein und starte den Dev-Server neu.",
    );
  }

  if (body.kategorien.length === 0) {
    throw new Error("Mindestens eine Kategorie muss angelegt sein, bevor die KI analysieren kann.");
  }

  const anhangTexte = await extrahiereAnhangTexte(body.attachments, openAiKey);
  const quelltext = baueQuelltext(body, anhangTexte);
  const kandidaten = filterKandidaten(body, quelltext);

  const raw = await klassifiziereMitClaude(body, quelltext, kandidaten, anthropicKey);
  return parseJsonResponse(raw, body, quelltext, kandidaten);
}
