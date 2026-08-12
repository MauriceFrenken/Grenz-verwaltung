import { createServerFn } from "@tanstack/react-start";

import type { ExposeFeldId } from "@/lib/expose-ai";

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
  /** Exposé-PDF wurde am Objekt hinterlegt. */
  pdfAngehaengt: boolean;
  /** Grund, falls das PDF nicht hinterlegt werden konnte. */
  pdfFehler?: string;
  /** Serverseitig erneuerter Access Token — Client übernimmt ihn. */
  erneuerteSession?: {
    accessToken: string;
    instanceUrl: string;
    refreshToken: string;
  };
};

type CreateResult = { id: string; success: boolean; errors: unknown[] };

/**
 * Salesforce ContentVersion lehnt viele Unicode-Sonderzeichen in PathOnClient ab
 * (z. B. Hochgestellt ² in „85 m²“). NFKC macht ²→2, ³→3 usw.; Rest wird bereinigt.
 */
function sanitizePdfFileName(fileName: string): string {
  let name = fileName.trim();
  if (!name) return "Expose.pdf";

  // Nur Basename, falls ein Pfad mitkommt
  name = name.replace(/^.*[/\\]/, "");
  // Kompatibilitäts-Normalisierung: ²→2, ³→3, ﬁ→fi, …
  name = name.normalize("NFKC");

  const hasPdf = /\.pdf$/i.test(name);
  let base = hasPdf ? name.replace(/\.pdf$/i, "") : name;

  base = base
    .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 180);

  if (!base) base = "Expose";
  return `${base}.pdf`;
}

function normalizePdfTitle(fileName: string): string {
  const sanitized = sanitizePdfFileName(fileName);
  return sanitized.replace(/\.pdf$/i, "") || "Expose";
}

function fehlerText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

/**
 * ContentVersion per multipart/form-data (Binärdaten).
 * JSON+Base64 wäre auf ~37,5 MB begrenzt; Multipart erlaubt bis 2 GB bei SF.
 */
async function attachPdfToRealEstate(
  accessToken: string,
  instanceUrl: string,
  realEstateId: string,
  pdf: NonNullable<ExportExposeToSalesforceInput["pdf"]>,
): Promise<void> {
  const rawName = pdf.fileName.trim();
  const base64 = pdf.base64.trim();
  if (!rawName || !base64) return;

  const fileName = sanitizePdfFileName(rawName);
  const title = normalizePdfTitle(fileName);
  const binary = Buffer.from(base64, "base64");
  const boundary = `frenken_cv_${Date.now().toString(36)}`;

  const metaJson = JSON.stringify({
    Title: title,
    PathOnClient: fileName,
    FirstPublishLocationId: realEstateId,
  });

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="entity_content";\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${metaJson}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/octet-stream\r\n` +
      `Content-Disposition: form-data; name="VersionData"; filename="${fileName}"\r\n\r\n`,
    "utf8",
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([preamble, binary, epilogue]);

  await salesforceRestJson<CreateResult>(
    accessToken,
    instanceUrl,
    `${salesforceDataApiPath()}/sobjects/ContentVersion`,
    {
      method: "POST",
      headers: {
        // Salesforce erwartet die Boundary in Anführungszeichen.
        "Content-Type": `multipart/form-data; boundary="${boundary}"`,
      },
      body,
    },
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

  // Anhang ist optional: ein Fehler hier darf den Export nicht verwerfen.
  let pdfAngehaengt = false;
  let pdfFehler: string | undefined;
  if (data.pdf) {
    try {
      await attachPdfToRealEstate(
        creds.accessToken,
        creds.instanceUrl,
        realEstateId,
        data.pdf,
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
