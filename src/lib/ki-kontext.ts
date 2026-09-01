/**
 * Gemeinsame Begrenzung von KI-Prompt-Inhalten. Server-only.
 */

/** Dokumentauszug — für Zuordnung/Klassifikation reicht meist der Anfang (+ Ende bei Rechnungen). */
export const KI_MAX_DOKUMENT_ZEICHEN = 24_000;
export const KI_MAX_MAIL_ZEICHEN = 6_000;
export const KI_MAX_STAMMDATEN_ZEICHEN = 40_000;

/** Genug extrahierter Text → kein ganzes PDF als Vision mitschicken. */
export const KI_MIN_TEXT_SKIP_VISION = 400;

/** Vision nur für kleinere Scans — große PDFs sprengen das Token-Limit. */
export const KI_MAX_VISION_PAYLOAD_BYTES = 4 * 1024 * 1024;

/** Max. geschätzte Tokens für Vision-Anhänge (PDF/Bilder). */
export const KI_MAX_VISION_TOKENS = 85_000;

/** @deprecated Alias — Payload-Limit für Vision-Anhänge. */
export const KI_MAX_VISION_BYTES = KI_MAX_VISION_PAYLOAD_BYTES;

/** Puffer unter dem Anthropic-Limit (200k) für System-Prompt und Antwort. */
export const KI_MAX_EINGABE_TOKENS = 175_000;

const KUERZUNG_HINWEIS = "\n\n[… Inhalt gekürzt für die KI-Analyse …]\n\n";

export function kuerzeTextFuerKi(text: string, maxZeichen: number): string {
  const t = text.trim();
  if (maxZeichen <= 0 || t.length <= maxZeichen) return t;
  if (maxZeichen < KUERZUNG_HINWEIS.length + 40) return t.slice(0, maxZeichen);

  const budget = maxZeichen - KUERZUNG_HINWEIS.length;
  const kopf = Math.floor(budget * 0.72);
  const fuss = budget - kopf;
  return `${t.slice(0, kopf)}${KUERZUNG_HINWEIS}${t.slice(-fuss)}`;
}

export function schaetzeTextTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export function schaetzeVisionTokens(
  vision: Array<{ art: "pdf" | "image"; base64: string }>,
): number {
  return vision.reduce((sum, block) => {
    // Base64 → Bytes → grobe Token-Schätzung (PDF-Vision ist besonders teuer).
    const faktor = block.art === "pdf" ? 1.2 : 0.85;
    return sum + Math.ceil((block.base64.length * 0.75 * faktor) / 3.5);
  }, 0);
}
