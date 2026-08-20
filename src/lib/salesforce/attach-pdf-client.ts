import { salesforceApiFetch, salesforceDataApiBase } from "./api";
import {
  buildContentVersionMultipart,
  MAX_EXPOSE_PDF_BYTES,
} from "./content-version";
import { salesforceErrorText } from "./query";

/**
 * Hängt ein Exposé-PDF direkt aus dem Browser an ein Real-Estate-Objekt.
 * Umgeht das Vercel-Request-Body-Limit (kein PDF über Server-Fn).
 * Voraussetzung: App-Origin in Salesforce CORS freigegeben.
 */
export async function attachExposePdfClient(input: {
  realEstateId: string;
  fileName: string;
  bytes: Uint8Array;
}): Promise<void> {
  if (input.bytes.byteLength > MAX_EXPOSE_PDF_BYTES) {
    throw new Error(
      "Das Exposé-PDF ist größer als 40 MB und kann nicht angehängt werden.",
    );
  }
  if (input.bytes.byteLength === 0) {
    throw new Error("PDF ist leer.");
  }

  const multipart = buildContentVersionMultipart({
    realEstateId: input.realEstateId,
    fileName: input.fileName,
    binary: input.bytes,
  });

  const ab = new ArrayBuffer(multipart.body.byteLength);
  new Uint8Array(ab).set(multipart.body);

  const res = await salesforceApiFetch(
    `${salesforceDataApiBase()}/sobjects/ContentVersion`,
    {
      method: "POST",
      headers: { "Content-Type": multipart.contentType },
      body: new Blob([ab]),
    },
  );

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    throw new Error(salesforceErrorText(data, res.status, text));
  }
}
