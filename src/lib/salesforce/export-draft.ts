import type { ExposeFeldId } from "@/lib/expose-ai";

const DRAFT_PREFIX = "grenz.expose.sf-export.";
const DRAFT_TTL_MS = 1000 * 60 * 60 * 6; // 6 Stunden

export type ExposeSalesforceExportDraft = {
  id: string;
  gespeichertAm: string;
  dateiname: string | null;
  felder: Partial<Record<ExposeFeldId, string>>;
  /** Herkunft Ankauf-Postfach — nach dem Export wird die Mail abgelegt. */
  postfachEintragId?: string | null;
};

type ExposeSalesforceDraftPdf = {
  dateiname: string;
  mimeType: string;
  bytes: Uint8Array;
};

const draftPdfStore = new Map<string, ExposeSalesforceDraftPdf>();

function draftKey(id: string): string {
  return `${DRAFT_PREFIX}${id}`;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function speichereExposeSalesforceDraft(input: {
  dateiname: string | null;
  felder: Partial<Record<ExposeFeldId, string>>;
  postfachEintragId?: string | null;
}): ExposeSalesforceExportDraft {
  const draft: ExposeSalesforceExportDraft = {
    id: randomId(),
    gespeichertAm: new Date().toISOString(),
    dateiname: input.dateiname,
    felder: input.felder,
    postfachEintragId: input.postfachEintragId ?? null,
  };
  localStorage.setItem(draftKey(draft.id), JSON.stringify(draft));
  return draft;
}

export function leseExposeSalesforceDraft(
  id: string,
): ExposeSalesforceExportDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const draft = JSON.parse(raw) as ExposeSalesforceExportDraft;
    if (!draft?.id || !draft.gespeichertAm) return null;
    const age = Date.now() - new Date(draft.gespeichertAm).getTime();
    if (Number.isFinite(age) && age > DRAFT_TTL_MS) {
      localStorage.removeItem(draftKey(id));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function speichereExposeSalesforceDraftPdf(input: {
  draftId: string;
  dateiname: string;
  mimeType?: string | null;
  bytes: Uint8Array;
}): void {
  draftPdfStore.set(input.draftId, {
    dateiname: input.dateiname,
    mimeType: input.mimeType?.trim() || "application/pdf",
    bytes: input.bytes,
  });
}

export function leseExposeSalesforceDraftPdf(
  draftId: string,
): ExposeSalesforceDraftPdf | null {
  return draftPdfStore.get(draftId) ?? null;
}

export function loescheExposeSalesforceDraftPdf(draftId: string): void {
  draftPdfStore.delete(draftId);
}
