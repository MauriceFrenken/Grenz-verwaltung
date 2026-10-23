/**
 * ContentVersion-Upload (Exposé-PDF) — shared Client + Server.
 * Multipart statt JSON+Base64, damit größere Dateien möglich sind.
 */

export const MAX_EXPOSE_PDF_BYTES = 40 * 1024 * 1024;

/** Privater Supabase-Bucket für Drag-and-Drop-PDFs vor dem SF-Attach. */
export const EXPOSE_PDF_TEMP_BUCKET = "expose-pdf-temp";

/**
 * Salesforce ContentVersion lehnt viele Unicode-Sonderzeichen in PathOnClient ab
 * (z. B. Hochgestellt ² in „85 m²“). NFKC macht ²→2, ³→3 usw.; Rest wird bereinigt.
 */
export function sanitizePdfFileName(fileName: string): string {
  let name = fileName.trim();
  if (!name) return "Expose.pdf";

  name = name.replace(/^.*[/\\]/, "");
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

export function normalizePdfTitle(fileName: string): string {
  const sanitized = sanitizePdfFileName(fileName);
  return sanitized.replace(/\.pdf$/i, "") || "Expose";
}

export type ContentVersionMultipart = {
  body: Uint8Array;
  contentType: string;
  fileName: string;
};

/** Baut den Multipart-Body für POST /sobjects/ContentVersion. */
export function buildContentVersionMultipart(input: {
  realEstateId: string;
  fileName: string;
  binary: Uint8Array;
}): ContentVersionMultipart {
  const fileName = sanitizePdfFileName(input.fileName);
  const title = normalizePdfTitle(fileName);
  const boundary = `grenz_cv_${Date.now().toString(36)}`;

  const metaJson = JSON.stringify({
    Title: title,
    PathOnClient: fileName,
    FirstPublishLocationId: input.realEstateId,
  });

  const preamble = new TextEncoder().encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="entity_content";\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${metaJson}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/octet-stream\r\n` +
      `Content-Disposition: form-data; name="VersionData"; filename="${fileName}"\r\n\r\n`,
  );
  const epilogue = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(
    preamble.length + input.binary.length + epilogue.length,
  );
  body.set(preamble, 0);
  body.set(input.binary, preamble.length);
  body.set(epilogue, preamble.length + input.binary.length);

  return {
    body,
    contentType: `multipart/form-data; boundary="${boundary}"`,
    fileName,
  };
}
