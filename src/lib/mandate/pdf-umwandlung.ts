/**
 * PDF aus einer PowerPoint der App: Upload in Teilen in den Hilfsordner im OneDrive der
 * Dokumentenablage, Microsoft 365 wandelt um, das PDF kommt in den Bucket „dokumente“, die
 * Hilfsdatei wird gelöscht. Geteilt von Exposé und Bewertung der Mandatsakte. Nur serverseitig.
 */

import type { createServiceRoleClient } from "@/lib/server/aufrufer";

type Admin = ReturnType<typeof createServiceRoleClient>;

/** Hilfsordner im OneDrive der Dokumentenablage für die PDF-Umwandlung. */
const PDF_ORDNER = "Grenz Exposé PDF-Umwandlung";
/** Teilgröße für den Upload: Vielfaches von 320 KiB, als Base64 unter dem Vercel-Limit. */
export const PDF_TEIL_BYTES = 320 * 1024 * 8;

export type PdfUpload = { url: string; itemId: string | null };

async function zugang() {
  const { microsoftAccessToken } = await import("@/lib/microsoft/postfach");
  const { microsoftOneDriveUser } = await import("@/lib/microsoft/ablage");
  const { accessToken } = await microsoftAccessToken();
  return { accessToken, benutzer: microsoftOneDriveUser() };
}

export async function pdfUploadStarten(dateiname: string): Promise<PdfUpload> {
  const { graphDriveUploadSessionStarten } =
    await import("@/lib/microsoft/graph");
  const { accessToken, benutzer } = await zugang();
  const url = await graphDriveUploadSessionStarten(
    accessToken,
    benutzer,
    PDF_ORDNER,
    dateiname,
  );
  return { url, itemId: null };
}

/** Ein Teil der PowerPoint; liefert die Datei-ID, sobald der letzte Teil angekommen ist. */
export async function pdfTeilHochladen(
  upload: PdfUpload | null | undefined,
  base64: string,
  offset: number,
  gesamt: number,
): Promise<string | null> {
  if (!upload?.url) throw new Error("Bitte die PDF-Erstellung neu starten.");
  const { graphDriveUploadTeil } = await import("@/lib/microsoft/graph");
  const { itemId } = await graphDriveUploadTeil(
    upload.url,
    new Uint8Array(Buffer.from(base64, "base64")),
    offset,
    gesamt,
  );
  return itemId ?? null;
}

/** Umwandeln, im Bucket ablegen, Hilfsdatei löschen. Liefert einen Download-Link (10 Minuten). */
export async function pdfUmwandelnUndAblegen(
  admin: Admin,
  itemId: string | null | undefined,
  pfad: string,
): Promise<string> {
  if (!itemId) throw new Error("Die PowerPoint ist noch nicht hochgeladen.");
  const { graphDriveAlsPdf, graphDriveDateiLoeschen } =
    await import("@/lib/microsoft/graph");
  const { accessToken, benutzer } = await zugang();
  let pdf: Uint8Array;
  try {
    pdf = await graphDriveAlsPdf(accessToken, benutzer, itemId);
  } finally {
    await graphDriveDateiLoeschen(accessToken, benutzer, itemId).catch(
      () => undefined,
    );
  }
  const { error } = await admin.storage
    .from("dokumente")
    .upload(pfad, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(error.message);
  return pdfLink(admin, pfad);
}

export async function pdfLink(admin: Admin, pfad: string): Promise<string> {
  const dateiname = pfad.split("/").pop() ?? "Dokument.pdf";
  const { data, error } = await admin.storage
    .from("dokumente")
    .createSignedUrl(pfad, 600, { download: dateiname });
  if (error || !data?.signedUrl)
    throw new Error(error?.message ?? "PDF-Link konnte nicht erstellt werden.");
  return data.signedUrl;
}
