/**
 * Server-only Dokumenten-KI: Rechnungserkennung, Ablagevorschlag, Rechnungsfelder.
 * Niemals aus Client-Code importieren (nur Typen sind client-safe).
 */
import {
  KI_MAX_DOKUMENT_ZEICHEN,
  KI_MAX_EINGABE_TOKENS,
  KI_MAX_MAIL_ZEICHEN,
  KI_MAX_STAMMDATEN_ZEICHEN,
  kuerzeTextFuerKi,
  schaetzeTextTokens,
  schaetzeVisionTokens,
} from "@/lib/ki-kontext";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5";

const KONFIDENZ_SCHWELLE = 0.75;

export type DokumentFeldQuelle = {
  value: string | null;
  verbatimQuote: string | null;
  page: number | null;
  konfidenz: number;
};

export type DokumentAnalyseFelder = {
  /** Legacy — wird nicht mehr von der KI befüllt */
  dokumentart?: DokumentFeldQuelle;
  dokumentTitel: DokumentFeldQuelle;
  gesellschaftName: DokumentFeldQuelle;
  ordnerPfad: DokumentFeldQuelle;
  rechnungsnummer: DokumentFeldQuelle;
  rechnungsdatum: DokumentFeldQuelle;
  rechnungsbetrag: DokumentFeldQuelle;
  waehrung: DokumentFeldQuelle;
  zahlungsempfaenger: DokumentFeldQuelle;
  zahlungsempfaengerAdresse: DokumentFeldQuelle;
  rechnungssteller: DokumentFeldQuelle;
  rechnungsstellerAdresse: DokumentFeldQuelle;
};

/** Felder, die die KI extrahiert (ohne Dokumentart — spart Tokens). */
export const DOKUMENT_KI_FELD_IDS = [
  "dokumentTitel",
  "gesellschaftName",
  "ordnerPfad",
  "rechnungsnummer",
  "rechnungsdatum",
  "rechnungsbetrag",
  "waehrung",
  "zahlungsempfaenger",
  "zahlungsempfaengerAdresse",
  "rechnungssteller",
  "rechnungsstellerAdresse",
] as const;

export type DokumentKiFeldId = (typeof DOKUMENT_KI_FELD_IDS)[number];

/** @deprecated Alias — umfasst legacy dokumentart nicht mehr */
export type DokumentFeldId = DokumentKiFeldId;

export const DOKUMENT_FELD_IDS = DOKUMENT_KI_FELD_IDS;

export const DOKUMENT_ABLAGE_FELDER: DokumentKiFeldId[] = [
  "gesellschaftName",
  "ordnerPfad",
];

/** Nur Rechnungsfelder in der Prüf-UI (Gesellschaft steht unter Zuordnung). */
export const DOKUMENT_RECHNUNG_UI_FELDER: DokumentKiFeldId[] = [
  "rechnungsnummer",
  "rechnungsdatum",
  "rechnungsbetrag",
  "waehrung",
  "zahlungsempfaenger",
  "zahlungsempfaengerAdresse",
  "rechnungssteller",
  "rechnungsstellerAdresse",
];

export const DOKUMENT_RECHNUNG_FELDER: DokumentKiFeldId[] = [
  "gesellschaftName",
  ...DOKUMENT_RECHNUNG_UI_FELDER,
];

export const DOKUMENT_FELD_LABELS: Record<DokumentKiFeldId, string> = {
  dokumentTitel: "Dokumenttitel",
  gesellschaftName: "Gesellschaft",
  ordnerPfad: "Zielordner",
  rechnungsnummer: "Rechnungsnummer",
  rechnungsdatum: "Rechnungsdatum",
  rechnungsbetrag: "Rechnungsbetrag",
  waehrung: "Währung",
  zahlungsempfaenger: "Zahlungsempfänger",
  zahlungsempfaengerAdresse: "Adresse Zahlungsempfänger",
  rechnungssteller: "Rechnungssteller",
  rechnungsstellerAdresse: "Adresse Rechnungssteller",
};

export type DokumentVisionBlock =
  | { art: "pdf"; base64: string }
  | { art: "image"; mediaType: string; base64: string };

export type AnalyzeDokumentRequest = {
  documentTitle?: string;
  mailKontext?: string;
  modelContext?: string;
  vision?: DokumentVisionBlock[];
  stammdatenKontext: string;
  /** Scan/Bild ohne verlässlichen PDF-Text — Prompt betont Mail+Vision. */
  istScanVision?: boolean;
};

export type OrdnerWahlSchrittRequest = {
  documentTitle?: string;
  mailKontext?: string;
  modelContext?: string;
  dokumentTyp: DokumentTyp;
  gesellschaftName: string;
  aktuellerPfad: string;
  unterordner: string[];
};

export type OrdnerWahlSchrittResponse = {
  gewaehlterOrdner: string | null;
  konfidenz: number;
};

export type GesellschaftRootWahlRequest = {
  gesellschaftName: string;
  gesellschaftKuerzel?: string | null;
  gesellschaftId?: string | null;
  rootOrdner: string[];
  documentTitle?: string;
  mailKontext?: string;
  modelContext?: string;
};

export type DokumentTyp = "rechnung" | "dokument" | "expose";

export type AnalyzeDokumentResponse = {
  dokumentTyp: DokumentTyp;
  dokumentTypKonfidenz: number;
  /** @deprecated Abgeleitet aus dokumentTyp === "rechnung" */
  istRechnung: boolean;
  /** @deprecated Alias für dokumentTypKonfidenz bei Rechnungen */
  istRechnungKonfidenz: number;
  felder: DokumentAnalyseFelder;
};

const ABLAGESTRUKTUR = `
Ablagestruktur Grenz & Co. (Zielordner in OneDrive):

Oberste Ebene: ein Ordner je Gesellschaft (exakte Namen können leicht abweichen, z. B. Präfix 01_).

Je Gesellschaft typisch:
- 01_Geschaeftsfuehrung
- 02_Finanzen (oder „Finanzen & Steuern“)
- 03_Vertraege
- 04_Personal
- 99_Archiv

Wichtig:
- Nur Ordner wählen, die eindeutig zum Dokument passen; im Zweifel eine Ebene höher bleiben.
`.trim();

function getAnthropicKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  return key || null;
}

function leeresFeld(): DokumentFeldQuelle {
  return { value: null, verbatimQuote: null, page: null, konfidenz: 0 };
}

function normalisiereFeld(raw: unknown): DokumentFeldQuelle {
  if (!raw || typeof raw !== "object") return leeresFeld();
  const o = raw as Record<string, unknown>;
  const value =
    typeof o.value === "string"
      ? o.value.trim() || null
      : o.value === null
        ? null
        : null;
  const verbatimQuote =
    typeof o.verbatimQuote === "string"
      ? o.verbatimQuote.trim() || null
      : null;
  const page =
    typeof o.page === "number" && Number.isFinite(o.page)
      ? Math.max(1, Math.floor(o.page))
      : null;
  const konfidenz =
    typeof o.konfidenz === "number" && Number.isFinite(o.konfidenz)
      ? Math.min(1, Math.max(0, o.konfidenz))
      : 0;
  return { value, verbatimQuote, page, konfidenz };
}

function leereFelder(): DokumentAnalyseFelder {
  return Object.fromEntries(
    DOKUMENT_KI_FELD_IDS.map((id) => [id, leeresFeld()]),
  ) as DokumentAnalyseFelder;
}

function parseAntwort(text: string): AnalyzeDokumentResponse {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("KI-Antwort enthielt kein JSON.");

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const felderRaw = (parsed.felder ?? {}) as Record<string, unknown>;
  const felder = leereFelder();
  for (const id of DOKUMENT_KI_FELD_IDS) {
    felder[id] = normalisiereFeld(felderRaw[id]);
  }

  const dokumentTyp = normalisiereDokumentTyp(parsed.dokumentTyp, parsed.istRechnung);
  const dokumentTypKonfidenz =
    typeof parsed.dokumentTypKonfidenz === "number"
      ? Math.min(1, Math.max(0, parsed.dokumentTypKonfidenz))
      : typeof parsed.istRechnungKonfidenz === "number"
        ? Math.min(1, Math.max(0, parsed.istRechnungKonfidenz))
        : 0;

  return {
    dokumentTyp,
    dokumentTypKonfidenz,
    istRechnung: dokumentTyp === "rechnung",
    istRechnungKonfidenz: dokumentTypKonfidenz,
    felder,
  };
}

function normalisiereDokumentTyp(
  typ: unknown,
  legacyIstRechnung: unknown,
): DokumentTyp {
  if (typ === "rechnung" || typ === "dokument" || typ === "expose") {
    return typ;
  }
  return legacyIstRechnung === true ? "rechnung" : "dokument";
}

function feldSchema(): string {
  return [
    '      "value": "<string oder null>",',
    '      "verbatimQuote": "<exakter Zitat-Text aus dem PDF oder null>",',
    '      "page": <Dateiseite als Zahl oder null>,',
    '      "konfidenz": <0.0 bis 1.0>',
  ].join("\n");
}

function visionZuApi(
  block: DokumentVisionBlock,
): Record<string, unknown> {
  if (block.art === "pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: block.base64,
      },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: block.mediaType,
      data: block.base64,
    },
  };
}

function begrenzeVisionFuerPrompt(
  vision: DokumentVisionBlock[],
  textTokenBudget: number,
): DokumentVisionBlock[] {
  if (vision.length === 0) return vision;

  const restBudget = KI_MAX_EINGABE_TOKENS - textTokenBudget;
  if (restBudget <= 0) return [];

  let aktuell = vision;
  while (aktuell.length > 0 && schaetzeVisionTokens(aktuell) > restBudget) {
    const ohnePdf = aktuell.filter((block) => block.art !== "pdf");
    if (ohnePdf.length < aktuell.length) {
      aktuell = ohnePdf;
      continue;
    }
    aktuell = aktuell.slice(0, -1);
  }
  return aktuell;
}

export async function anthropicNachricht(
  system: string,
  userText: string,
  vision: DokumentVisionBlock[] = [],
  maxTokens = 4096,
): Promise<string> {
  const key = getAnthropicKey();
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  }

  // Dokument/Bild zuerst — Anthropic empfiehlt das für PDF-/Scan-Verständnis.
  const userContent: Array<Record<string, unknown>> = [
    ...vision.map(visionZuApi),
    { type: "text", text: userText },
  ];

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as { error?: { message?: string } }).error?.message ===
        "string"
        ? (json as { error: { message: string } }).error.message
        : `Anthropic-Fehler (${res.status})`;
    throw new Error(msg);
  }

  const content = (json as { content?: Array<{ type?: string; text?: string }> })
    .content;
  const textBlock = content?.find((b) => b.type === "text");
  const text = textBlock?.text?.trim();
  if (!text) throw new Error("KI-Antwort war leer.");
  return text;
}

export async function handleAnalyzeDokumentRequest(
  input: AnalyzeDokumentRequest,
): Promise<AnalyzeDokumentResponse> {
  const titel = input.documentTitle?.trim() || "Dokument";
  const kontext = kuerzeTextFuerKi(
    input.modelContext ?? "",
    KI_MAX_DOKUMENT_ZEICHEN,
  );
  const mailKontext = kuerzeTextFuerKi(
    (input.mailKontext ?? "").trim(),
    KI_MAX_MAIL_ZEICHEN,
  );
  const stammdatenKontext = kuerzeTextFuerKi(
    input.stammdatenKontext,
    KI_MAX_STAMMDATEN_ZEICHEN,
  );
  let vision = input.vision ?? [];

  if (!kontext.trim() && vision.length === 0 && !mailKontext) {
    throw new Error("Kein Analyse-Kontext für dieses Dokument.");
  }

  const scanRegeln = input.istScanVision
    ? `
Scan-/Bild-Modus (wichtig):
- Primär den Scan/die Bilder lesen; E-Mail-Betreff und Mail-Text sind zusätzlicher Kontext zur Einordnung.
- Wenn Betreff/Dateiname/Mail klar eine Gesellschaft nennen und der Scan dazu passt: genau diese Gesellschaft wählen.
- Gesellschafter, Notarparteien oder Mitunterzeichner sind NICHT die Ziel-Gesellschaft.
- Gründung, Gesellschafterliste, Gesellschaftsvertrag, Handelsregister, Sitzverlegung, Beglaubigung: gesellschaftName = die gegründete/betroffene Gesellschaft.
- Nichts erfinden: nur übernehmen, was im Scan klar steht.
- verbatimQuote muss zum gewählten gesellschaftName passen (nicht eine andere Firma zitieren).
- Abschnitt „ANDERE ANHÄNGE DIESER MAIL“: bei Unsicherheit die sichere Geschwister-Zuordnung übernehmen, wenn der Inhalt nicht klar widerspricht.
`
    : `
- Nutze E-Mail-Betreff, Absender und Mail-Text für die Zuordnung.
- Abschnitt „ANDERE ANHÄNGE DIESER MAIL“: bei Unsicherheit die sichere Geschwister-Zuordnung übernehmen.
`;

  const systemPrompt = `Du analysierst eingehende E-Mail-Anhänge für Grenz & Co.

Schritt 1: Klassifiziere den Anhang in genau einen Typ:
- "rechnung": Rechnung, Invoice, Gutschrift mit Betrag und Zahlungsaufforderung
- "expose": Immobilien-Exposé / Verkaufsunterlage (Objektbeschreibung, Kaufpreis, Miete, Maklerangebot, Objektdaten, Grundriss, Energieausweis als Exposé-PDF)
- "dokument": sonstige Geschäftsdokumente (Verträge, Korrespondenz, Protokolle, Versicherungen, …)

Schritt 2a (rechnung): Extrahiere Rechnungsfelder; Gesellschaft aus STAMMDATEN.
Schritt 2b (dokument): Gesellschaft aus STAMMDATEN — Zielordner wird serverseitig ermittelt.
Schritt 2c (expose): keine weitere Zuordnung — Exposés laufen über den Exposé-Import.

${ABLAGESTRUKTUR}

Regeln:
- dokumentTitel: nur für allgemeine Dokumente einen kurzen, präzisen Dateinamen-Titel aus dem Inhalt bilden (z. B. "Maklervertrag Musterstraße 1" oder "Versicherungsbestätigung Betriebshaftpflicht"). Keine Dateiendung, kein Datum, keine internen IDs erfinden. Für Rechnungen und Exposés null.
- gesellschaftName = die Gesellschaft aus STAMMDATEN, DER das Dokument gehört / die betroffen ist (Briefempfänger, Vertragspartner, gegründete Gesellschaft), exakt aus STAMMDATEN. Nicht Absender/Versicherer/Rechnungssteller, nicht bloß ein Gesellschafter oder Notar.
- ordnerPfad: immer null lassen (wird separat über OneDrive ermittelt).
- Bei Rechnungen (Eingangsrechnungen): zahlungsempfaenger = Gesellschaft aus STAMMDATEN, an die die Rechnung adressiert ist, rechnungssteller = Aussteller/Lieferant.
- rechnungsbetrag: nur Zahl mit Dezimalpunkt, keine Währung.
- waehrung: z. B. EUR.
- Nur Informationen aus Dokument + E-Mail — nichts erfinden. Bei Unsicherheit: value null, konfidenz niedrig.
- Bei Scans/Bildern ohne Text: verbatimQuote darf null sein.
${scanRegeln}
Antworte NUR mit JSON:
{
  "dokumentTyp": "rechnung" | "dokument" | "expose",
  "dokumentTypKonfidenz": <0.0-1.0>,
  "felder": {
    "dokumentTitel": { ${feldSchema()} },
    "gesellschaftName": { ${feldSchema()} },
    "ordnerPfad": { ${feldSchema()} },
    "rechnungsnummer": { ${feldSchema()} },
    "rechnungsdatum": { ${feldSchema()} },
    "rechnungsbetrag": { ${feldSchema()} },
    "waehrung": { ${feldSchema()} },
    "zahlungsempfaenger": { ${feldSchema()} },
    "zahlungsempfaengerAdresse": { ${feldSchema()} },
    "rechnungssteller": { ${feldSchema()} },
    "rechnungsstellerAdresse": { ${feldSchema()} }
  }
}`;

  const userPrompt = `Dokument: ${titel}

=== STAMMDATEN (Gesellschaften) ===
${stammdatenKontext}
${mailKontext ? `\n=== E-MAIL (Betreff, Absender, Inhalt — wichtig für die Einordnung) ===\n${mailKontext}\n` : ""}
${kontext ? `\n=== DOKUMENT / ANHANG-KONTEXT ===\n${kontext}` : ""}
${input.istScanVision ? "\n(Scan: Bilder/PDF-Seiten sind oben angehängt — zuerst lesen, dann mit E-Mail abgleichen.)\n" : ""}`;

  const textTokenSchaetzung =
    schaetzeTextTokens(systemPrompt) + schaetzeTextTokens(userPrompt);
  vision = begrenzeVisionFuerPrompt(vision, textTokenSchaetzung);

  const text = await anthropicNachricht(systemPrompt, userPrompt, vision);
  return parseAntwort(text);
}

function parseOrdnerWahlJson(
  text: string,
  erlaubteNamen: string[],
  minKonfidenz = 0.35,
): OrdnerWahlSchrittResponse {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { gewaehlterOrdner: null, konfidenz: 0 };
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const raw =
    typeof parsed.gewaehlterOrdner === "string"
      ? parsed.gewaehlterOrdner.trim()
      : null;
  const gewaehlterOrdner =
    raw && erlaubteNamen.includes(raw) ? raw : null;
  const konfidenz =
    typeof parsed.konfidenz === "number"
      ? Math.min(1, Math.max(0, parsed.konfidenz))
      : gewaehlterOrdner
        ? 0.5
        : 0;

  if (gewaehlterOrdner && konfidenz < minKonfidenz) {
    return { gewaehlterOrdner: null, konfidenz };
  }

  return { gewaehlterOrdner, konfidenz };
}

/** KI wählt den passenden OneDrive-Oberordner zur identifizierten Gesellschaft. */
export async function waehleGesellschaftRootOrdner(
  input: GesellschaftRootWahlRequest,
): Promise<OrdnerWahlSchrittResponse> {
  if (input.rootOrdner.length === 0) {
    return { gewaehlterOrdner: null, konfidenz: 0 };
  }

  if (input.rootOrdner.length === 1) {
    return { gewaehlterOrdner: input.rootOrdner[0]!, konfidenz: 1 };
  }

  const systemPrompt = `Du ordnest eine Gesellschaft aus den Stammdaten dem passenden OneDrive-Oberordner zu.

${ABLAGESTRUKTUR}

Regeln:
- Wähle genau einen Ordnernamen aus der Liste (exakte Schreibweise).
- Die Gesellschaft kommt aus Stammdaten — der Ordnername kann anders formatiert sein (z. B. Präfix 05_, Großschreibung).
- Nur Ordner aus der Liste wählen.

Antworte NUR mit JSON:
{
  "gewaehlterOrdner": "<exakter Name aus Liste>",
  "konfidenz": <0.0-1.0>
}`;

  const ordnerListe = input.rootOrdner.map((n) => `- ${n}`).join("\n");
  const kuerzel = input.gesellschaftKuerzel?.trim();
  const kontext = kuerzeTextFuerKi(input.modelContext ?? "", 4_000);
  const mail = kuerzeTextFuerKi(input.mailKontext ?? "", 1_500);

  const userPrompt = `Gesellschaft (Stammdaten): ${input.gesellschaftName}${kuerzel ? ` (Kürzel: ${kuerzel})` : ""}${input.gesellschaftId ? `\nID: ${input.gesellschaftId}` : ""}

Verfügbare OneDrive-Oberordner:
${ordnerListe}
${input.documentTitle ? `\nDokument: ${input.documentTitle}` : ""}
${mail ? `\nE-Mail:\n${mail}` : ""}
${kontext ? `\nDokumentauszug:\n${kontext}` : ""}`;

  const text = await anthropicNachricht(systemPrompt, userPrompt, [], 256);
  return parseOrdnerWahlJson(text, input.rootOrdner, 0.4);
}

export async function waehleUnterordnerSchritt(
  input: OrdnerWahlSchrittRequest,
): Promise<OrdnerWahlSchrittResponse> {
  if (input.unterordner.length === 0) {
    return { gewaehlterOrdner: null, konfidenz: 1 };
  }

  const systemPrompt = `Du wählst den passenden Unterordner für ein Geschäftsdokument in der Ablage von Grenz & Co.

${ABLAGESTRUKTUR}

Regeln:
- Wähle genau einen Ordnernamen aus der Liste (exakte Schreibweise) oder null.
- null = aktueller Pfad ist bereits der richtige Zielordner.
- Nur tiefer gehen wenn ein Unterordner eindeutig zum Dokument passt.

Antworte NUR mit JSON:
{
  "gewaehlterOrdner": "<exakter Name aus Liste oder null>",
  "konfidenz": <0.0-1.0>
}`;

  const ordnerListe = input.unterordner.map((n) => `- ${n}`).join("\n");
  const kontext = kuerzeTextFuerKi(input.modelContext ?? "", 8_000);
  const mail = kuerzeTextFuerKi(input.mailKontext ?? "", 2_000);

  const userPrompt = `Dokument: ${input.documentTitle ?? "Dokument"}
Typ: ${input.dokumentTyp}
Gesellschaft: ${input.gesellschaftName}
Aktueller Pfad: ${input.aktuellerPfad}

Verfügbare Unterordner:
${ordnerListe}
${mail ? `\nE-Mail:\n${mail}` : ""}
${kontext ? `\nDokumentauszug:\n${kontext}` : ""}`;

  const text = await anthropicNachricht(systemPrompt, userPrompt, [], 512);
  return parseOrdnerWahlJson(text, input.unterordner);
}

export function hatAnalyseWerte(felder: DokumentAnalyseFelder | null): boolean {
  if (!felder) return false;
  const relevant: DokumentKiFeldId[] = [
    "dokumentTitel",
    "ordnerPfad",
    "gesellschaftName",
    "rechnungsnummer",
    "rechnungsbetrag",
  ];
  return relevant.some((id) => (felder[id]?.value ?? "").trim());
}

export function feldUeberSchwelle(feld: DokumentFeldQuelle | undefined): boolean {
  if (!feld?.value?.trim()) return false;
  return feld.konfidenz >= KONFIDENZ_SCHWELLE;
}
