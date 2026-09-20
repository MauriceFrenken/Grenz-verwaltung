/**
 * In-Memory-Übergabe von „Offene Exposés“ → Exposé-Import (Check).
 * Felder sofort, PDF per Prefetch — kein localStorage (zu groß / flüchtig).
 */
import type { ExposeFelder } from "@/lib/expose-ai";

import type { PostfachEintragMitPdf } from "./typen";

export type CheckHandoff = {
  felder: ExposeFelder | null;
  anhangName: string | null;
  pdfPromise: Promise<PostfachEintragMitPdf> | null;
};

const handoffs = new Map<string, CheckHandoff>();

export function speichereCheckHandoff(
  eintragId: string,
  data: { felder: ExposeFelder | null; anhangName: string | null },
): void {
  const existing = handoffs.get(eintragId);
  handoffs.set(eintragId, {
    felder: data.felder,
    anhangName: data.anhangName,
    pdfPromise: existing?.pdfPromise ?? null,
  });
}

export function setzeCheckPdfPromise(
  eintragId: string,
  pdfPromise: Promise<PostfachEintragMitPdf>,
): void {
  const existing = handoffs.get(eintragId);
  handoffs.set(eintragId, {
    felder: existing?.felder ?? null,
    anhangName: existing?.anhangName ?? null,
    pdfPromise,
  });
}

export function leseCheckHandoff(eintragId: string): CheckHandoff | null {
  return handoffs.get(eintragId) ?? null;
}

export function loescheCheckHandoff(eintragId: string): void {
  handoffs.delete(eintragId);
}
