import { createServerFn } from "@tanstack/react-start";

import type { ExposeFeldId } from "@/lib/expose-ai";
import { graphAnhangInhalt } from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { leseEintrag } from "@/lib/postfach/store";

import {
  buildContentVersionMultipart,
  MAX_EXPOSE_PDF_BYTES,
} from "./content-version";
import { mitRechteDiagnose } from "./describe";
import { buildRealEstatePayload, buildTransaktionPayload } from "./field-map";
import { salesforceDataApiPath, salesforceRestJson } from "./query";
import { resolveVerifiedSalesforceCredentials } from "./server-credentials";

export type ExportExposeToSalesforceInput = {
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
  /** Vorhandenes Real-Estate-Objekt; fehlt → neues Objekt anlegen */
  realEstateId?: string | null;
  felder: Partial<Record<ExposeFeldId, string>>;
  /**
   * Ankauf-Postfach: PDF wird serverseitig aus Graph geladen und angehängt
   * (kein großes PDF im Client→Vercel-Request).
   */
  postfachEintragId?: string | null;
};

export type ExportExposeToSalesforceResult = {
  realEstateId: string;
  transactionId: string;
  mode: "update" | "create";
  authSource: "env" | "session";
  /** Exposé-PDF wurde am Objekt hinterlegt (Graph-Pfad). */
  pdfAngehaengt: boolean;
  /** Grund, falls das PDF serverseitig nicht hinterlegt werden konnte. */
  pdfFehler?: string;
  /** Serverseitig erneuerter Access Token — Client übernimmt ihn. */
  erneuerteSession?: {
    accessToken: string;
    instanceUrl: string;
    refreshToken: string;
  };
};

type CreateResult = { id: string; success: boolean; errors: unknown[] };

function fehlerText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function base64ToBytes(base64: string): Uint8Array {
  const buf = Buffer.from(base64.trim(), "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
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

async function attachPdfBinary(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  fileName: string,
  binary: Uint8Array,
): Promise<void> {
  if (binary.byteLength === 0) return;
  if (binary.byteLength > MAX_EXPOSE_PDF_BYTES) {
    throw new Error(
      "Das Exposé-PDF ist größer als 40 MB und kann nicht angehängt werden.",
    );
  }

  const multipart = buildContentVersionMultipart({
    realEstateId,
    fileName,
    binary,
  });

  await salesforceRestJson<CreateResult>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/ContentVersion`,
    {
      method: "POST",
      headers: { "Content-Type": multipart.contentType },
      body: Buffer.from(multipart.body) as unknown as BodyInit,
    },
  );
}

/** PDF aus Ankauf-Postfach (Graph) laden und an Real Estate hängen. */
async function attachPdfFromPostfach(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  postfachEintragId: string,
): Promise<void> {
  const row = await leseEintrag(postfachEintragId);
  if (!row.anhang_id) {
    throw new Error("Zu dieser Mail ist kein PDF-Anhang gespeichert.");
  }
  if (
    typeof row.anhang_groesse === "number" &&
    row.anhang_groesse > MAX_EXPOSE_PDF_BYTES
  ) {
    throw new Error(
      "Das Exposé-PDF ist größer als 40 MB und kann nicht angehängt werden.",
    );
  }

  const { accessToken: graphToken } = await microsoftAccessToken();
  const anhang = await graphAnhangInhalt(
    graphToken,
    row.postfach,
    row.graph_nachricht_id,
    row.anhang_id,
  );
  if (!anhang.contentBytes) {
    throw new Error("PDF-Anhang enthält keine Datei-Daten.");
  }

  const binary = base64ToBytes(anhang.contentBytes);
  await attachPdfBinary(
    accessToken,
    instanceUrl,
    realEstateId,
    anhang.name || row.anhang_name || "Expose.pdf",
    binary,
  );
}

export async function exportExposeToSalesforce(
  data: ExportExposeToSalesforceInput,
): Promise<ExportExposeToSalesforceResult> {
  // Token vorab prüfen und ggf. erneuern: ein Retry mitten in der Sequenz
  // würde Objekt und Transaktion doppelt anlegen.
  const creds = await resolveVerifiedSalesforceCredentials({
    accessToken: data.accessToken,
    instanceUrl: data.instanceUrl,
    refreshToken: data.refreshToken,
  });

  const existingId = data.realEstateId?.trim() || null;
  const felder = data.felder ?? {};
  const postfachEintragId = data.postfachEintragId?.trim() || null;

  let realEstateId: string;
  let mode: "update" | "create";

  if (existingId) {
    try {
      await updateRealEstate(
        creds.accessToken,
        creds.instanceUrl,
        existingId,
        felder,
      );
    } catch (err) {
      throw new Error(
        `Objekt konnte nicht aktualisiert werden: ${await mitRechteDiagnose(
          creds.accessToken,
          creds.instanceUrl,
          "Real_Estate__c",
          "aktualisieren",
          fehlerText(err),
        )}`,
      );
    }
    realEstateId = existingId;
    mode = "update";
  } else {
    try {
      realEstateId = await createRealEstate(
        creds.accessToken,
        creds.instanceUrl,
        felder,
      );
    } catch (err) {
      throw new Error(
        `Objekt konnte nicht angelegt werden: ${await mitRechteDiagnose(
          creds.accessToken,
          creds.instanceUrl,
          "Real_Estate__c",
          "anlegen",
          fehlerText(err),
        )}`,
      );
    }
    mode = "create";
  }

  let transactionId: string;
  try {
    transactionId = await createTransaktion(
      creds.accessToken,
      creds.instanceUrl,
      realEstateId,
      felder,
    );
  } catch (err) {
    throw new Error(
      `Objekt wurde ${mode === "create" ? "angelegt" : "aktualisiert"}, aber die Transaktion konnte nicht angelegt werden: ${await mitRechteDiagnose(
        creds.accessToken,
        creds.instanceUrl,
        "Transaktion__c",
        "anlegen",
        fehlerText(err),
      )}`,
    );
  }

  // Anhang optional — Fehler hier verwerfen den Export nicht.
  // Kein PDF im Client→Vercel-Body; bei Postfach holt der Server aus Graph.
  let pdfAngehaengt = false;
  let pdfFehler: string | undefined;
  if (postfachEintragId) {
    try {
      await attachPdfFromPostfach(
        creds.accessToken,
        creds.instanceUrl,
        realEstateId,
        postfachEintragId,
      );
      pdfAngehaengt = true;
    } catch (err) {
      pdfFehler = fehlerText(err);
    }
  }

  return {
    realEstateId,
    transactionId,
    mode,
    authSource: creds.source,
    pdfAngehaengt,
    pdfFehler,
    erneuerteSession: creds.erneuert,
  };
}

export const exportExposeToSalesforceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as ExportExposeToSalesforceInput)
  .handler(({ data }) => exportExposeToSalesforce(data));
