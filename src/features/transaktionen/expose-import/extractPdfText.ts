import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function itemText(item: unknown): string {
  if (item && typeof item === "object" && "str" in item && typeof (item as { str: unknown }).str === "string") {
    return (item as { str: string }).str;
  }
  return "";
}

export type PdfPageChunk = { pageNumber: number; text: string };

export type ExtractedPdfForChat = {
  pages: PdfPageChunk[];
  pageLabels: string[] | null;
  modelContext: string;
};

export async function extractPdfForChat(file: File): Promise<ExtractedPdfForChat> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: PdfPageChunk[] = [];

  const rawLabels = await pdf.getPageLabels();
  const pageLabels =
    rawLabels !== null && rawLabels.length === pdf.numPages ? rawLabels : null;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(itemText).join(" ").replace(/\s+/g, " ").trim();
    pages.push({ pageNumber: i, text: pageText });
  }

  const modelContext = pages
    .map((p) => {
      const raw = pageLabels?.[p.pageNumber - 1];
      const label =
        typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
      const labelLine =
        label != null && label !== String(p.pageNumber)
          ? `Gedruckte Seitennummer (nur für Menschen, nicht für Zitate): "${label}"\n`
          : "";
      const body = p.text.length > 0 ? p.text : "(kein extrahierbarer Text auf dieser Seite)";
      return `<<<PAGE ${p.pageNumber}>>>\n${labelLine}${body}`;
    })
    .join("\n\n")
    .trim();

  return { pages, modelContext, pageLabels };
}
