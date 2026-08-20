/**
 * PDF-Text serverseitig extrahieren (Legacy-Build von pdf.js, läuft ohne Worker
 * in Node). Nur aus Server-Code importieren — der Legacy-Build gehört nicht ins
 * Client-Bundle, dort läuft `extractPdfForChat` im Worker.
 */
import { buildModelContext, type PdfPageChunk } from "@/lib/expose-pdf-context";

export type ExtrahiertesPdf = {
  seiten: number;
  pages: PdfPageChunk[];
  modelContext: string;
};

type TextItem = { str?: unknown };

type PdfSeite = {
  getTextContent: () => Promise<{ items: unknown[] }>;
};

type PdfDokument = {
  numPages: number;
  getPage: (nr: number) => Promise<PdfSeite>;
  getPageLabels: () => Promise<string[] | null>;
  destroy: () => Promise<void>;
};

type PdfjsModul = {
  getDocument: (optionen: Record<string, unknown>) => {
    promise: Promise<PdfDokument>;
  };
};

let modulPromise: Promise<PdfjsModul> | null = null;

function ladePdfjs(): Promise<PdfjsModul> {
  if (!modulPromise) {
    modulPromise =
      import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<unknown> as Promise<PdfjsModul>;
  }
  return modulPromise;
}

function itemText(item: unknown): string {
  const str = (item as TextItem | null)?.str;
  return typeof str === "string" ? str : "";
}

export async function extrahierePdfText(
  bytes: Uint8Array,
): Promise<ExtrahiertesPdf> {
  const pdfjs = await ladePdfjs();
  const doc = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    // Node hat keine Canvas-/Font-Umgebung; für reine Textextraktion nicht nötig.
    disableFontFace: true,
  }).promise;

  try {
    const rohLabels = await doc.getPageLabels().catch(() => null);
    const pageLabels =
      rohLabels !== null && rohLabels.length === doc.numPages
        ? rohLabels
        : null;

    const pages: PdfPageChunk[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const inhalt = await page.getTextContent();
      const text = inhalt.items
        .map(itemText)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ pageNumber: i, text });
    }

    return {
      seiten: doc.numPages,
      pages,
      modelContext: buildModelContext(pages, pageLabels),
    };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}
