/**
 * Server-only Dokumenten-KI: Rechnungserkennung, Ablagevorschlag, Rechnungsfelder.
 * Niemals aus Client-Code importieren (nur Typen sind client-safe).
 */
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
  gesellschaftName: DokumentFeldQuelle;
  objektBezeichnung: DokumentFeldQuelle;
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
  "gesellschaftName",
  "objektBezeichnung",
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
  "objektBezeichnung",
  "ordnerPfad",
];

/** Nur Rechnungsfelder in der Prüf-UI (Gesellschaft/Objekt stehen unter Zuordnung). */
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
  "objektBezeichnung",
  ...DOKUMENT_RECHNUNG_UI_FELDER,
];

export const DOKUMENT_FELD_LABELS: Record<DokumentKiFeldId, string> = {
  gesellschaftName: "Gesellschaft",
  objektBezeichnung: "Objekt",
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
  onedriveKontext: string;
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
FRENKEN – Einheitliche Ablagestruktur (Zielordner):

Oberste Ebene (Gesellschaften):
- 01_FRENKEN HOLDING GMBH
- 02_FRENKEN IMMOBILIEN GMBH
- 03_FRENKEN INVESTMENT MANAGEMENT GMBH
- 04_FRENKEN CAPITAL MANAGEMENT GMBH
- 05_MTF CAPITAL GMBH
- 99_ARCHIV

Je Gesellschaft:
- 01_Geschaeftsfuehrung
- 02_Finanzen
- 03_Vertraege
- 04_Personal
- 05_Beteiligungen bzw. 05_Immobilien
- 99_Archiv

Immobilien (unter 05_Immobilien):
- 01_Ankauf, 02_Bestand, 03_Verkauf, 04_Projekte

Einzelne Immobilie (Muster): IM-2026-001_Duesseldorf_Musterstrasse
  - 01_Stammdaten, 02_Vertraege, 03_Finanzen, 04_Technik, 05_Mieter, 99_Archiv

Gruppenweite Unterlagen (Holding): 01_Geschaeftsfuehrung, 02_Strategie, 03_Recht, 04_Versicherungen, 05_Banken, 99_Archiv
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

export async function handleAnalyzeDokumentRequest(
  input: AnalyzeDokumentRequest,
): Promise<AnalyzeDokumentResponse> {
  const key = getAnthropicKey();
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  }

  const titel = input.documentTitle?.trim() || "Dokument";
  const kontext = (input.modelContext ?? "").slice(0, 120_000);
  const mailKontext = (input.mailKontext ?? "").trim();
  const vision = input.vision ?? [];

  if (!kontext.trim() && vision.length === 0 && !mailKontext) {
    throw new Error("Kein Analyse-Kontext für dieses Dokument.");
  }

  const systemPrompt = `Du analysierst eingehende E-Mail-Anhänge für die FRENKEN-Gruppe.

Schritt 1: Klassifiziere den Anhang in genau einen Typ:
- "rechnung": Rechnung, Invoice, Gutschrift mit Betrag und Zahlungsaufforderung
- "expose": Immobilien-Exposé / Verkaufsunterlage (Objektbeschreibung, Kaufpreis, Miete, Maklerangebot, Objektdaten, Grundriss, Energieausweis als Exposé-PDF)
- "dokument": sonstige Geschäftsdokumente (Verträge, Korrespondenz, Protokolle, Versicherungen, …)

Schritt 2a (rechnung): Extrahiere Rechnungsfelder und ordne Gesellschaft/Objekt zu.
Schritt 2b (dokument): Ordne Gesellschaft/Objekt zu und wähle den tiefsten passenden Zielordner.
Schritt 2c (expose): Objektadresse falls erkennbar; ordnerPfad leer lassen.

${ABLAGESTRUKTUR}

Regeln:
- Nutze die Stammdaten-Liste für Gesellschafts- und Objektzuordnung.
- Nutze die OneDrive-Ordnerliste — wähle den tiefsten existierenden Ordner, der zum Dokument passt.
- Bei objektbezogenen Unterlagen (Adresse, Grundstück, Immobilie): bis zum konkreten Objektordner (IM-…_Strasse) und ggf. passenden Unterordner (01_Stammdaten, 02_Vertraege, 03_Finanzen, 04_Technik, …) — nicht bei 02_Bestand oder 05_Immobilien stoppen, wenn ein passender Objektordner in der Liste steht.
- ordnerPfad: exakter vollständiger Pfad aus der OneDrive-Liste, z. B. "05_MTF CAPITAL GMBH/05_Immobilien/02_Bestand/IM-2026-001_Duesseldorf_Bendemannstrasse/01_Stammdaten"
- Bei Rechnungen: zahlungsempfaenger = an wen gezahlt wird (FRENKEN-Gesellschaft), rechnungssteller = Aussteller.
- rechnungsbetrag: nur Zahl mit Dezimalpunkt, keine Währung.
- waehrung: z. B. EUR.
- Nur Informationen aus dem Dokument — nichts erfinden. Bei Unsicherheit: value null, konfidenz niedrig.
- Bei Scans/Bildern ohne Text: verbatimQuote darf null sein.
- Nutze auch E-Mail-Betreff, Absender und Mail-Text für die Zuordnung.

Antworte NUR mit JSON:
{
  "dokumentTyp": "rechnung" | "dokument" | "expose",
  "dokumentTypKonfidenz": <0.0-1.0>,
  "felder": {
    "gesellschaftName": { ${feldSchema()} },
    "objektBezeichnung": { ${feldSchema()} },
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

=== STAMMDATEN (Gesellschaften & Objekte) ===
${input.stammdatenKontext}

=== ONEDRIVE (bestehende Ordner) ===
${input.onedriveKontext}
${mailKontext ? `\n=== E-MAIL ===\n${mailKontext}\n` : ""}
${kontext ? `\n=== KONTEXT ===\n${kontext}` : ""}`;

  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: userPrompt },
    ...vision.map(visionZuApi),
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
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
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

  return parseAntwort(text);
}

export function hatAnalyseWerte(felder: DokumentAnalyseFelder | null): boolean {
  if (!felder) return false;
  const relevant: DokumentKiFeldId[] = [
    "ordnerPfad",
    "gesellschaftName",
    "objektBezeichnung",
    "rechnungsnummer",
    "rechnungsbetrag",
  ];
  return relevant.some((id) => (felder[id]?.value ?? "").trim());
}

export function feldUeberSchwelle(feld: DokumentFeldQuelle | undefined): boolean {
  if (!feld?.value?.trim()) return false;
  return feld.konfidenz >= KONFIDENZ_SCHWELLE;
}
