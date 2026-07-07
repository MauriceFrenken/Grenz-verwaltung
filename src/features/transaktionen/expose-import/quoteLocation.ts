import type { PdfPageChunk } from "./extractPdfText";

export type QuoteMatch = { pageNumber: number; strategy: "exact" | "normalized" | "casefold" };

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function findQuoteInPages(pages: PdfPageChunk[], quote: string): QuoteMatch | null {
  const raw = quote.trim();
  if (raw.length < 2) return null;

  for (const { pageNumber, text } of pages) {
    if (text.includes(raw)) return { pageNumber, strategy: "exact" };
  }

  const nq = collapseWs(raw);
  if (nq.length < 2) return null;
  for (const { pageNumber, text } of pages) {
    if (collapseWs(text).includes(nq)) return { pageNumber, strategy: "normalized" };
  }

  const nql = nq.toLowerCase();
  for (const { pageNumber, text } of pages) {
    if (collapseWs(text).toLowerCase().includes(nql)) return { pageNumber, strategy: "casefold" };
  }

  return null;
}
