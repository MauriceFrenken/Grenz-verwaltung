/**
 * Aufbau des KI-Kontexts aus PDF-Seitentexten. Wird von der Browser-Extraktion
 * (pdf.js im Worker) und der Server-Extraktion (Postfach-Analyse) genutzt,
 * damit beide Wege exakt denselben Prompt-Input erzeugen.
 */

export type PdfPageChunk = { pageNumber: number; text: string };

export function buildModelContext(
  pages: PdfPageChunk[],
  pageLabels: string[] | null,
): string {
  return pages
    .map((p) => {
      const raw = pageLabels?.[p.pageNumber - 1];
      const label =
        typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
      const labelLine =
        label != null && label !== String(p.pageNumber)
          ? `Gedruckte Seitennummer (nur für Menschen, nicht für Zitate): "${label}"\n`
          : "";
      const body =
        p.text.length > 0
          ? p.text
          : "(kein extrahierbarer Text auf dieser Seite)";
      return `<<<PAGE ${p.pageNumber}>>>\n${labelLine}${body}`;
    })
    .join("\n\n")
    .trim();
}
