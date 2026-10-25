/** Serverseitige Textextraktion für Dateien aus dem OneDrive-Objektordner. */

import { extrahierePdfText } from "@/lib/postfach/pdf-text";

import {
  excelText,
  istExcel,
  istPdf,
  istText,
  istWord,
  klartext,
} from "./unterlagen";

export async function unterlageAusBytes(
  name: string,
  bytes: Uint8Array,
): Promise<{ text: string; seiten: number } | null> {
  if (istPdf(name)) {
    const pdf = await extrahierePdfText(bytes);
    return pdf.pages.some((p) => p.text)
      ? { text: pdf.modelContext, seiten: pdf.seiten }
      : null;
  }
  if (istExcel(name)) return excelText(bytes);
  if (istText(name)) return klartext(bytes);
  if (istWord(name)) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return r.value.trim() ? klartext(new TextEncoder().encode(r.value)) : null;
  }
  return null;
}
