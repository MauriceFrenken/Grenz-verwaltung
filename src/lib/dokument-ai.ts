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
  dokumentart: DokumentFeldQuelle;
  gesellschaftName: DokumentFeldQuelle;
  objektBezeichnung: DokumentFeldQuelle;
  ordnerPfad: DokumentFeldQuelle;
  zuordnungBegruendung: DokumentFeldQuelle;
  rechnungsnummer: DokumentFeldQuelle;
  rechnungsdatum: DokumentFeldQuelle;
  rechnungsbetrag: DokumentFeldQuelle;
  waehrung: DokumentFeldQuelle;
  zahlungsempfaenger: DokumentFeldQuelle;
  zahlungsempfaengerAdresse: DokumentFeldQuelle;
  rechnungssteller: DokumentFeldQuelle;
  rechnungsstellerAdresse: DokumentFeldQuelle;
};

export const DOKUMENT_FELD_IDS = [
  "dokumentart",
  "gesellschaftName",
  "objektBezeichnung",
  "ordnerPfad",
  "zuordnungBegruendung",
  "rechnungsnummer",
  "rechnungsdatum",
  "rechnungsbetrag",
  "waehrung",
  "zahlungsempfaenger",
  "zahlungsempfaengerAdresse",
  "rechnungssteller",
  "rechnungsstellerAdresse",
] as const;

export type DokumentFeldId = (typeof DOKUMENT_FELD_IDS)[number];

export const DOKUMENT_ABLAGE_FELDER: DokumentFeldId[] = [
  "dokumentart",
  "gesellschaftName",
  "objektBezeichnung",
  "ordnerPfad",
  "zuordnungBegruendung",
];

export const DOKUMENT_RECHNUNG_FELDER: DokumentFeldId[] = [
  "gesellschaftName",
  "objektBezeichnung",
  "rechnungsnummer",
  "rechnungsdatum",
  "rechnungsbetrag",
  "waehrung",
  "zahlungsempfaenger",
  "zahlungsempfaengerAdresse",
  "rechnungssteller",
  "rechnungsstellerAdresse",
  "zuordnungBegruendung",
];

export const DOKUMENT_FELD_LABELS: Record<DokumentFeldId, string> = {
  dokumentart: "Dokumentart",
  gesellschaftName: "Gesellschaft",
  objektBezeichnung: "Objekt",
  ordnerPfad: "Zielordner",
  zuordnungBegruendung: "Begründung",
  rechnungsnummer: "Rechnungsnummer",
  rechnungsdatum: "Rechnungsdatum",
  rechnungsbetrag: "Rechnungsbetrag",
  waehrung: "Währung",
  zahlungsempfaenger: "Zahlungsempfänger",
  zahlungsempfaengerAdresse: "Adresse Zahlungsempfänger",
  rechnungssteller: "Rechnungssteller",
  rechnungsstellerAdresse: "Adresse Rechnungssteller",
};

export type AnalyzeDokumentRequest = {
  documentTitle?: string;
  modelContext: string;
  stammdatenKontext: string;
  onedriveKontext: string;
};

export type AnalyzeDokumentResponse = {
  istRechnung: boolean;
  istRechnungKonfidenz: number;
  begruendung: string;
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
    DOKUMENT_FELD_IDS.map((id) => [id, leeresFeld()]),
  ) as DokumentAnalyseFelder;
}

function parseAntwort(text: string): AnalyzeDokumentResponse {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("KI-Antwort enthielt kein JSON.");

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const felderRaw = (parsed.felder ?? {}) as Record<string, unknown>;
  const felder = leereFelder();
  for (const id of DOKUMENT_FELD_IDS) {
    felder[id] = normalisiereFeld(felderRaw[id]);
  }

  return {
    istRechnung: parsed.istRechnung === true,
    istRechnungKonfidenz:
      typeof parsed.istRechnungKonfidenz === "number"
        ? Math.min(1, Math.max(0, parsed.istRechnungKonfidenz))
        : 0,
    begruendung:
      typeof parsed.begruendung === "string" ? parsed.begruendung.trim() : "",
    felder,
  };
}

function feldSchema(): string {
  return [
    '      "value": "<string oder null>",',
    '      "verbatimQuote": "<exakter Zitat-Text aus dem PDF oder null>",',
    '      "page": <Dateiseite als Zahl oder null>,',
    '      "konfidenz": <0.0 bis 1.0>',
  ].join("\n");
}

export async function handleAnalyzeDokumentRequest(
  input: AnalyzeDokumentRequest,
): Promise<AnalyzeDokumentResponse> {
  const key = getAnthropicKey();
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  }

  const titel = input.documentTitle?.trim() || "Dokument";
  const kontext = input.modelContext.slice(0, 120_000);

  const systemPrompt = `Du analysierst eingehende Geschäftsdokumente für die FRENKEN-Gruppe.

Schritt 1: Entscheide, ob es sich um eine Rechnung handelt (Rechnung, Invoice, Gutschrift mit Betrag).
Schritt 2a (Rechnung): Extrahiere Rechnungsfelder und ordne Gesellschaft/Objekt zu.
Schritt 2b (keine Rechnung): Schlage den passenden Ablageordner vor.

${ABLAGESTRUKTUR}

Regeln:
- Nutze die Stammdaten-Liste für Gesellschafts- und Objektzuordnung.
- Nutze die OneDrive-Ordnerliste für den konkreten Zielordner (bestehende Unterordner bevorzugen).
- ordnerPfad: vollständiger relativer Pfad ab Gesellschafts-Root, z. B. "02_FRENKEN IMMOBILIEN GMBH/02_Finanzen" oder "02_FRENKEN IMMOBILIEN GMBH/05_Immobilien/02_Bestand/IM-2026-001_Duesseldorf_Musterstrasse/03_Finanzen"
- zuordnungBegruendung: kurze Begründung auf Deutsch, warum Gesellschaft/Objekt/Ordner gewählt wurden.
- Bei Rechnungen: zahlungsempfaenger = an wen gezahlt wird (FRENKEN-Gesellschaft), rechnungssteller = Aussteller.
- rechnungsbetrag: nur Zahl mit Dezimalpunkt, keine Währung.
- waehrung: z. B. EUR.
- Nur Informationen aus dem Dokument — nichts erfinden. Bei Unsicherheit: value null, konfidenz niedrig.

Antworte NUR mit JSON:
{
  "istRechnung": <boolean>,
  "istRechnungKonfidenz": <0.0-1.0>,
  "begruendung": "<kurz auf Deutsch>",
  "felder": {
    "dokumentart": { ${feldSchema()} },
    "gesellschaftName": { ${feldSchema()} },
    "objektBezeichnung": { ${feldSchema()} },
    "ordnerPfad": { ${feldSchema()} },
    "zuordnungBegruendung": { ${feldSchema()} },
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

=== DOKUMENTTEXT ===
${kontext}`;

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
      messages: [{ role: "user", content: userPrompt }],
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
  return DOKUMENT_FELD_IDS.some((id) => (felder[id]?.value ?? "").trim());
}

export function feldUeberSchwelle(feld: DokumentFeldQuelle | undefined): boolean {
  if (!feld?.value?.trim()) return false;
  return feld.konfidenz >= KONFIDENZ_SCHWELLE;
}
