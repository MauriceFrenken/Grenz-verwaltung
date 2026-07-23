import { createServerFn } from "@tanstack/react-start";

import type { ExposeFeldId } from "@/lib/expose-ai";

import { buildRealEstatePayload, buildTransaktionPayload } from "./field-map";
import { salesforceDataApiPath, salesforceRestJson } from "./query";
import {
  clearSalesforceCredentialsCache,
  resolveSalesforceCredentials,
} from "./server-credentials";

export type ExportExposeToSalesforceInput = {
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
  /** Vorhandenes Real-Estate-Objekt; fehlt → neues Objekt anlegen */
  realEstateId?: string | null;
  felder: Partial<Record<ExposeFeldId, string>>;
  pdf?: {
    fileName: string;
    mimeType?: string;
    base64: string;
  } | null;
};

export type ExportExposeToSalesforceResult = {
  realEstateId: string;
  transactionId: string;
  mode: "update" | "create";
  authSource: "env" | "session";
};

function looksLikeAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /INVALID_SESSION|Session expired|401|UNAUTHORIZED/i.test(msg);
}

type CreateResult = { id: string; success: boolean; errors: unknown[] };

function normalizePdfTitle(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return "Expose";
  return trimmed.replace(/\.pdf$/i, "").trim() || "Expose";
}

async function createRealEstate(
  accessToken: string,
  instanceUrl: string,
  felder: Partial<Record<ExposeFeldId, string>>,
): Promise<string> {
  const payload = buildRealEstatePayload(felder, { includeName: true });
  if (!payload.Name && !payload.Street_Name__c) {
    throw new Error(
      "Objektadresse fehlt — neues Objekt kann nicht angelegt werden.",
    );
  }
  const created = await salesforceRestJson<CreateResult>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/Real_Estate__c`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (!created?.id) {
    throw new Error("Salesforce hat keine Objekt-ID zurückgegeben.");
  }
  return created.id;
}

async function updateRealEstate(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  felder: Partial<Record<ExposeFeldId, string>>,
): Promise<void> {
  // Bei Update: Name nicht anfassen (bestehende SF-Bezeichnung behalten).
  // Nur nicht-leere Exposé-Felder → kein Überschreiben mit Leerwerten.
  const payload = buildRealEstatePayload(felder, { includeName: false });
  if (Object.keys(payload).length === 0) return;

  await salesforceRestJson<void>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/Real_Estate__c/${encodeURIComponent(realEstateId)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

async function createTransaktion(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  felder: Partial<Record<ExposeFeldId, string>>,
): Promise<string> {
  const payload = buildTransaktionPayload(felder, realEstateId);
  const created = await salesforceRestJson<CreateResult>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/Transaktion__c`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (!created?.id) {
    throw new Error("Salesforce hat keine Transaktions-ID zurückgegeben.");
  }
  return created.id;
}

async function attachPdfToRealEstate(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  pdf: NonNullable<ExportExposeToSalesforceInput["pdf"]>,
): Promise<void> {
  const fileName = pdf.fileName.trim();
  const base64 = pdf.base64.trim();
  if (!fileName || !base64) return;

  await salesforceRestJson<CreateResult>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/ContentVersion`,
    {
      method: "POST",
      body: JSON.stringify({
        Title: normalizePdfTitle(fileName),
        PathOnClient: fileName,
        VersionData: base64,
        FirstPublishLocationId: realEstateId,
      }),
    },
  );
}

export const exportExposeToSalesforceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as ExportExposeToSalesforceInput)
  .handler(async ({ data }): Promise<ExportExposeToSalesforceResult> => {
    const sessionHint = {
      accessToken: data.accessToken,
      instanceUrl: data.instanceUrl,
      refreshToken: data.refreshToken,
    };

    let creds = await resolveSalesforceCredentials(sessionHint);
    const existingId = data.realEstateId?.trim() || null;
    const felder = data.felder ?? {};

    const run = async (): Promise<ExportExposeToSalesforceResult> => {
      let realEstateId: string;
      let mode: "update" | "create";

      if (existingId) {
        await updateRealEstate(
          creds.accessToken,
          creds.instanceUrl,
          existingId,
          felder,
        );
        realEstateId = existingId;
        mode = "update";
      } else {
        realEstateId = await createRealEstate(
          creds.accessToken,
          creds.instanceUrl,
          felder,
        );
        mode = "create";
      }

      const transactionId = await createTransaktion(
        creds.accessToken,
        creds.instanceUrl,
        realEstateId,
        felder,
      );

      if (data.pdf) {
        await attachPdfToRealEstate(
          creds.accessToken,
          creds.instanceUrl,
          realEstateId,
          data.pdf,
        );
      }

      return {
        realEstateId,
        transactionId,
        mode,
        authSource: creds.source,
      };
    };

    try {
      return await run();
    } catch (err) {
      if (!looksLikeAuthError(err)) throw err;
      clearSalesforceCredentialsCache();
      creds = await resolveSalesforceCredentials(sessionHint);
      return await run();
    }
  });
