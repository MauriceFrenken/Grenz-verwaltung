/**
 * PDF-Text serverseitig via unpdf (pdf.js ohne Worker — läuft auf Vercel/Nitro).
 * Nur aus Server-Code importieren; im Browser bleibt extractPdfForChat (Worker).
 */
import { extractText, getDocumentProxy } from "unpdf";

import { buildModelContext, type PdfPageChunk } from "@/lib/expose-pdf-context";

export type ExtrahiertesPdf = {
  seiten: number;
  pages: PdfPageChunk[];
  modelContext: string;
};

export async function extrahierePdfText(
  bytes: Uint8Array,
): Promise<ExtrahiertesPdf> {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });

  const seitenTexte = Array.isArray(text) ? text : [text];
  const pages: PdfPageChunk[] = seitenTexte.map((seite, index) => ({
    pageNumber: index + 1,
    text: (seite ?? "").replace(/\s+/g, " ").trim(),
  }));

  return {
    seiten: totalPages || pages.length,
    pages,
    modelContext: buildModelContext(pages, null),
  };
}
