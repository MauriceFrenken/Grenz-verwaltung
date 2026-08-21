import { supabase } from "@/lib/supabase";
import {
  EXPOSE_PDF_TEMP_BUCKET,
  MAX_EXPOSE_PDF_BYTES,
} from "./content-version";

/**
 * Lädt ein manuelles Exposé-PDF direkt Client → Supabase Storage.
 * Umgeht Vercel-Body-Limit und Salesforce-CORS.
 * Pfad: `{userId}/{uuid}.pdf`
 */
export async function uploadExposePdfToTempStorage(input: {
  bytes: Uint8Array;
  fileName: string;
}): Promise<{ storagePath: string; fileName: string }> {
  if (input.bytes.byteLength === 0) {
    throw new Error("PDF ist leer.");
  }
  if (input.bytes.byteLength > MAX_EXPOSE_PDF_BYTES) {
    throw new Error(
      "Das Exposé-PDF ist größer als 40 MB und kann nicht angehängt werden.",
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.id) {
    throw new Error("Nicht angemeldet — PDF-Upload nicht möglich.");
  }

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const storagePath = `${user.id}/${id}.pdf`;
  const ab = new ArrayBuffer(input.bytes.byteLength);
  new Uint8Array(ab).set(input.bytes);
  const blob = new Blob([ab], { type: "application/pdf" });

  const { error } = await supabase.storage
    .from(EXPOSE_PDF_TEMP_BUCKET)
    .upload(storagePath, blob, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    throw new Error(`PDF-Zwischenablage fehlgeschlagen: ${error.message}`);
  }

  return {
    storagePath,
    fileName: input.fileName.trim() || "Expose.pdf",
  };
}
